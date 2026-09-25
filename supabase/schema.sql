-- ============================================================
-- Tickr — Paper Trading Simulator
-- Supabase Schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- 1. PROFILES — one row per auth user, created automatically via trigger
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  cash_balance NUMERIC(14,2) DEFAULT 10000.00 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger: auto-create a profile when a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
    VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. COINS — static list of supported cryptocurrencies
CREATE TABLE public.coins (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL
);

INSERT INTO public.coins (id, symbol, name) VALUES
  ('bitcoin',  'BTC',  'Bitcoin'),
  ('ethereum', 'ETH',  'Ethereum'),
  ('solana',   'SOL',  'Solana'),
  ('dogecoin', 'DOGE', 'Dogecoin'),
  ('cardano',  'ADA',  'Cardano');

-- 3. PRICE_SNAPSHOTS — one row per CoinGecko poll per coin
CREATE TABLE public.price_snapshots (
  id BIGSERIAL PRIMARY KEY,
  coin_id TEXT REFERENCES public.coins(id) NOT NULL,
  price_usd NUMERIC(18,6) NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_price_snapshots_coin_time
  ON public.price_snapshots (coin_id, fetched_at DESC);

-- 4. HOLDINGS — one row per (user, coin) pair
CREATE TABLE public.holdings (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  coin_id TEXT REFERENCES public.coins(id) NOT NULL,
  quantity NUMERIC(18,8) DEFAULT 0 NOT NULL,
  PRIMARY KEY (user_id, coin_id)
);

-- 5. TRADES — audit log of every simulated buy/sell
CREATE TABLE public.trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) NOT NULL,
  coin_id TEXT REFERENCES public.coins(id) NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  quantity NUMERIC(18,8) NOT NULL,
  price_usd NUMERIC(18,6) NOT NULL,
  total_usd NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holdings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coins          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_snapshots ENABLE ROW LEVEL SECURITY;

-- Profiles: everyone can read (for leaderboard display names), only own can update
CREATE POLICY "public profiles read"   ON public.profiles FOR SELECT USING (true);
CREATE POLICY "own profile update"     ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Holdings: own rows only
CREATE POLICY "own holdings select"    ON public.holdings FOR SELECT USING (auth.uid() = user_id);
-- Leaderboard needs all holdings — use a service-role select or a view
CREATE POLICY "all holdings read"      ON public.holdings FOR SELECT USING (true);

-- Trades: own rows only
CREATE POLICY "own trades"             ON public.trades FOR SELECT USING (auth.uid() = user_id);

-- Coins & prices: public read
CREATE POLICY "coins public read"      ON public.coins FOR SELECT USING (true);
CREATE POLICY "prices public read"     ON public.price_snapshots FOR SELECT USING (true);

-- ============================================================
-- Atomic Trade Execution RPC
-- WHY: running this as a single Postgres function ensures that the
-- read (get price, check balance/holdings) and write (update balance,
-- update holdings, insert trade) happen inside one transaction.
-- If we split these into separate API calls (read then write),
-- we'd have a TOCTOU race: the balance could change between the check
-- and the deduction, or the price could be fetched once and become
-- stale by the time the write executes. The RPC atomicity eliminates both.
-- ============================================================

CREATE OR REPLACE FUNCTION public.execute_trade(
  p_coin_id  TEXT,
  p_side     TEXT,
  p_quantity NUMERIC
)
RETURNS void AS $$
DECLARE
  v_price    NUMERIC;
  v_total    NUMERIC;
  v_cash     NUMERIC;
  v_qty_held NUMERIC;
BEGIN
  -- Always use the freshest price in the DB (not a client-supplied value)
  SELECT price_usd INTO v_price
    FROM public.price_snapshots
    WHERE coin_id = p_coin_id
    ORDER BY fetched_at DESC
    LIMIT 1;
  IF v_price IS NULL THEN
    RAISE EXCEPTION 'No price available for %', p_coin_id;
  END IF;

  v_total := v_price * p_quantity;

  IF p_side = 'buy' THEN
    SELECT cash_balance INTO v_cash
      FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
    IF v_cash < v_total THEN
      RAISE EXCEPTION 'Insufficient cash balance';
    END IF;
    UPDATE public.profiles
      SET cash_balance = cash_balance - v_total
      WHERE id = auth.uid();
    INSERT INTO public.holdings (user_id, coin_id, quantity)
      VALUES (auth.uid(), p_coin_id, p_quantity)
      ON CONFLICT (user_id, coin_id)
      DO UPDATE SET quantity = holdings.quantity + p_quantity;

  ELSIF p_side = 'sell' THEN
    SELECT quantity INTO v_qty_held
      FROM public.holdings
      WHERE user_id = auth.uid() AND coin_id = p_coin_id
      FOR UPDATE;
    IF v_qty_held IS NULL OR v_qty_held < p_quantity THEN
      RAISE EXCEPTION 'Insufficient holdings';
    END IF;
    UPDATE public.holdings
      SET quantity = quantity - p_quantity
      WHERE user_id = auth.uid() AND coin_id = p_coin_id;
    UPDATE public.profiles
      SET cash_balance = cash_balance + v_total
      WHERE id = auth.uid();

  ELSE
    RAISE EXCEPTION 'Invalid side: must be buy or sell';
  END IF;

  INSERT INTO public.trades (user_id, coin_id, side, quantity, price_usd, total_usd)
    VALUES (auth.uid(), p_coin_id, p_side, p_quantity, v_price, v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Realtime subscriptions
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.price_snapshots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.holdings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- ============================================================
-- Demo user seed
-- Run AFTER creating the demo@tickr.dev account via Auth UI or email signup.
-- Replace <DEMO_USER_UUID> with the actual UUID from auth.users.
-- ============================================================
-- UPDATE public.profiles
--   SET cash_balance = 25000.00, display_name = 'Demo Trader'
--   WHERE email = 'demo@tickr.dev';

-- INSERT INTO public.holdings (user_id, coin_id, quantity) VALUES
--   ('<DEMO_USER_UUID>', 'bitcoin',  0.25),
--   ('<DEMO_USER_UUID>', 'ethereum', 2.5),
--   ('<DEMO_USER_UUID>', 'solana',   20.0);
