# Tickr — Paper Trading Simulator

> **Practice crypto trading with live real prices. Zero real money. All the thrill.**

Tickr is a full-stack paper-trading simulator built with **Next.js 15**, **Supabase** (Postgres + Auth + Realtime), and **Vercel** (hosting + cron). Every price shown originates from a real CoinGecko API call stored in the database — no mocking, no hardcoding.

---

## Live Demo

🌐 **[tickr.vercel.app](tickr-blond-two.vercel.app)** ← deployed URL

### Demo credentials (pre-seeded)

| Email | Password | Starting state |
|-------|----------|----------------|
| `demo@tickr.dev` | `demo1234` | $25,000 cash + BTC/ETH/SOL holdings |

---

## Features

| View | Description |
|------|-------------|
| **Market** | Live 5-coin price table with green/red flash animations. Subscribed via Supabase Realtime — updates without refresh. |
| **Trade** | Buy/sell form with live total calculation, client-side validation, clear error messages. Executes via atomic Postgres RPC. |
| **Portfolio** | Holdings table, cash balance, total value, P&L vs. starting $10k, allocation bar. |
| **Leaderboard** | All users ranked by total portfolio value, recomputed from live prices every 20s. |

A persistent **"Practice / Paper Trading"** banner and badge are visible on every page and the auth screen — this is not a disclaimer, it's the product's identity.

---

## Architecture

```
Browser (Next.js 15, App Router)
    ↕ Supabase Realtime (WebSocket)
    ↕ /api/trade  (POST)
    ↕ /api/ingest (GET, cron-triggered)
Vercel (serverless + cron)
    ↕ Supabase Postgres (RLS + RPC)
    ↕ CoinGecko API (server-side only)
```

The frontend **never calls CoinGecko directly**. It only reads from `price_snapshots` in the database.

---

## Stage 1 — Database Setup (Supabase)

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. In **Authentication → Settings**: disable "Confirm email" for instant signup
3. In **SQL Editor**, paste and run `supabase/schema.sql`
4. Create the demo account via the Auth UI or by signing up at your deployed URL, then run the seed section at the bottom of `schema.sql`

---

## Stage 2 — Price Ingestion

**Approach: Vercel Cron (`vercel.json`) — true scheduled execution**

`vercel.json` configures a cron that calls `GET /api/ingest` every minute:

```json
{ "crons": [{ "path": "/api/ingest", "schedule": "* * * * *" }] }
```

The route:
1. Fetches `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,dogecoin,cardano&vs_currencies=usd` (no API key — free tier)
2. On success: inserts one `price_snapshots` row per coin using the service-role Supabase client
3. On any error (rate limit, network): logs it and returns 200 — **never writes fabricated prices**

**On-demand fallback**: If the most recent snapshot is older than 55 seconds when the Market page loads, it also triggers `/api/ingest` in the background. This covers cold-start scenarios.

**Why true cron over on-demand only**: A cron ensures prices update even when no one is viewing the site, keeping the leaderboard and realtime subscriptions fresh in all open tabs.

---

## Stage 3 — Trade API

`POST /api/trade`:
1. Verifies the user session server-side (no client-supplied user ID)
2. Validates `coin_id`, `side` (buy/sell), and `quantity` (must be positive)
3. Calls the `execute_trade(p_coin_id, p_side, p_quantity)` Postgres RPC
4. Maps RPC `RAISE EXCEPTION` messages to 400 errors (not generic 500s)

**Why atomic RPC**: The buy/sell logic reads the current price, checks the balance/holdings, and writes — all in one transaction. Separate API-layer read-then-write calls would create a TOCTOU race condition where the balance could change between check and deduction, or the price could drift between fetch and trade execution.

---

## Stage 4 — Frontend

**Visual identity**: Dark navy (`#060b14`) with a blue/purple accent palette, `JetBrains Mono` for prices and numbers, `Inter` for prose. Green/red flash animations on price ticks. Glassmorphic nav. Animated pulsing "Practice" badge.

**Realtime**: All four views subscribe to `price_snapshots`, `holdings`, and `profiles` via Supabase Realtime channels. A second browser tab will show the same live updates.

---

## Local Development

```bash
# 1. Clone and install
git clone https://github.com/YOUR_USERNAME/tickr
cd tickr
npm install

# 2. Set environment variables
cp .env.local.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, and CRON_SECRET

# 3. Run
npm run dev
```

---

## Deployment (Vercel)

```bash
npx vercel --prod
# Set the 4 env vars above in the Vercel dashboard or via CLI:
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add CRON_SECRET
```

The cron job activates automatically after deployment on Vercel's Hobby tier (free).

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-only, never exposed to browser) |
| `CRON_SECRET` | Random secret used to authenticate manual calls to `/api/ingest` |

---

## Agent Logs

All build session logs are in `.agent-logs/` — committed as part of the repo per the assignment requirements. See `CAPTURE-TEST.md` for details on how automatic prompt/response capture was set up.

---

## Definition of Done Checklist

- [x] `npm run build` passes
- [ ] Deployed live, verified in incognito window
- [x] Prices update in Market view without refresh (Realtime)
- [x] Buy → sell same coin returns cash and zeroes holding (atomic RPC)
- [x] Over-balance trade rejected with clear message (not silent failure)
- [x] Second tab shows same live updates (Realtime subscription)
- [x] `.agent-logs/` committed, repo public
