'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { COINS, COIN_ICON_CLASS, COIN_EMOJI, formatPrice, formatUsd, formatQuantity } from '@/lib/coins';
import type { PriceMap, Profile, Holding } from '@/lib/types';
import Link from 'next/link';

type Side = 'buy' | 'sell';

export default function TradePageClient() {
  const searchParams = useSearchParams();

  const [user, setUser] = useState<{ id: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  const [selectedCoin, setSelectedCoin] = useState(
    searchParams.get('coin') ?? 'bitcoin'
  );
  const [side, setSide] = useState<Side>('buy');
  const [quantityStr, setQuantityStr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);

  const coin = COINS.find((c) => c.id === selectedCoin) ?? COINS[0];
  const currentPrice = prices[selectedCoin] ?? null;
  const quantity = parseFloat(quantityStr) || 0;
  const total = currentPrice !== null ? currentPrice * quantity : null;

  const currentHolding = holdings.find((h) => h.coin_id === selectedCoin);
  const heldQty = Number(currentHolding?.quantity ?? 0);

  const cashBalance = profile?.cash_balance ?? 0;
  const wouldFail =
    side === 'buy'
      ? total !== null && total > cashBalance
      : quantity > heldQty;

  const canSubmit =
    !loading &&
    user !== null &&
    quantity > 0 &&
    currentPrice !== null &&
    !wouldFail;

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user: u } } = await supabase.auth.getUser();
    setUser(u);
    setAuthChecked(true);

    if (!u) { setLoading(false); return; }

    const [profileRes, holdingsRes, pricesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', u.id).single(),
      supabase.from('holdings').select('*').eq('user_id', u.id),
      supabase
        .from('price_snapshots')
        .select('coin_id, price_usd, fetched_at')
        .order('fetched_at', { ascending: false }),
    ]);

    if (profileRes.data) setProfile(profileRes.data as Profile);
    if (holdingsRes.data) setHoldings(holdingsRes.data as Holding[]);
    if (pricesRes.data) {
      const map: PriceMap = {};
      for (const row of pricesRes.data) {
        if (!(row.coin_id in map)) map[row.coin_id] = Number(row.price_usd);
      }
      setPrices(map);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const supabase = createClient();

    const channel = supabase
      .channel('trade-subscriptions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'price_snapshots' }, (p: { new: { coin_id: string; price_usd: number } }) => {
        setPrices((prev) => ({ ...prev, [p.new.coin_id]: Number(p.new.price_usd) }));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (p: { new: { cash_balance: number } }) => {
        setProfile((prev) => prev ? { ...prev, cash_balance: Number(p.new.cash_balance) } : prev);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holdings' }, () => {
        supabase.auth.getUser().then(({ data: { user: u } }) => {
          if (u) supabase.from('holdings').select('*').eq('user_id', u.id).then(({ data }) => {
            if (data) setHoldings(data as Holding[]);
          });
        });
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const handleTrade = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coin_id: selectedCoin, side, quantity }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? 'Trade failed. Please try again.');
      } else {
        setSuccess(
          `${side === 'buy' ? 'Bought' : 'Sold'} ${formatQuantity(quantity, coin.symbol)} at $${formatPrice(currentPrice!)}. Total: ${formatUsd(total!)}`
        );
        setQuantityStr('');
        await loadData();
      }
    } catch {
      setError('Network error. Please check your connection.');
    }
    setSubmitting(false);
  };

  if (authChecked && !user) {
    return (
      <div className="container" style={{ paddingTop: '2.5rem' }}>
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">🔒</div>
          <h3>Sign in to trade</h3>
          <p>You need an account to place simulated trades.</p>
          <Link href="/auth" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
            Sign in or create account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3rem' }}>
      <div className="page-header">
        <h1>Trade</h1>
        <p className="text-secondary text-sm" style={{ marginTop: '0.375rem' }}>
          Buy or sell crypto with your practice cash. Prices update in real time.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: '1.5rem', alignItems: 'start' }}>
        {/* Trade Form */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Cash balance */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div>
              <div className="stat-label">Practice Cash Balance</div>
              <div className="stat-value" id="trade-cash-balance" style={{ fontSize: '1.75rem' }}>
                {loading
                  ? <span className="skeleton" style={{ width: '140px', height: '28px', display: 'block' }} />
                  : formatUsd(cashBalance)}
              </div>
            </div>
            <span className="paper-badge">Paper</span>
          </div>

          {/* Coin selector */}
          <div className="form-group">
            <label className="form-label">Asset</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
              {COINS.map((c) => (
                <button
                  key={c.id}
                  id={`trade-select-${c.id}`}
                  type="button"
                  onClick={() => { setSelectedCoin(c.id); setError(null); setSuccess(null); }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem',
                    padding: '0.75rem 0.375rem',
                    border: `1px solid ${selectedCoin === c.id ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-md)',
                    background: selectedCoin === c.id ? 'rgba(99,179,237,0.08)' : 'var(--bg-base)',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  <span className={`coin-icon ${COIN_ICON_CLASS[c.id]}`} style={{ width: '32px', height: '32px', fontSize: '0.8rem' }}>
                    {COIN_EMOJI[c.id]}
                  </span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: selectedCoin === c.id ? 'var(--accent-blue)' : 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
                    {c.symbol}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Buy / Sell toggle */}
          <div className="form-group">
            <label className="form-label">Direction</label>
            <div className="segment" style={{ width: '100%' }}>
              <button id="trade-side-buy" type="button" className={`segment-btn ${side === 'buy' ? 'active-buy' : ''}`} onClick={() => { setSide('buy'); setError(null); setSuccess(null); }}>
                ▲ Buy
              </button>
              <button id="trade-side-sell" type="button" className={`segment-btn ${side === 'sell' ? 'active-sell' : ''}`} onClick={() => { setSide('sell'); setError(null); setSuccess(null); }}>
                ▼ Sell
              </button>
            </div>
          </div>

          {/* Quantity */}
          <div className="form-group">
            <label className="form-label" htmlFor="trade-quantity">Quantity ({coin.symbol})</label>
            <input
              id="trade-quantity"
              type="number"
              className="form-input mono"
              placeholder="0.00"
              value={quantityStr}
              onChange={(e) => { setQuantityStr(e.target.value); setError(null); setSuccess(null); }}
              min="0"
              step="any"
              disabled={submitting}
            />
            {side === 'sell' && heldQty > 0 && (
              <p className="form-hint">
                You hold: <strong className="mono">{heldQty.toFixed(8)} {coin.symbol}</strong>
                <button
                  id="trade-max-qty"
                  type="button"
                  onClick={() => setQuantityStr(String(heldQty))}
                  style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                >
                  Max
                </button>
              </p>
            )}
          </div>

          {/* Live total */}
          <div style={{ padding: '1rem 1.25rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span className="text-sm text-secondary">Current price</span>
              <span className="mono font-semibold" id="trade-current-price">
                {currentPrice !== null ? `$${formatPrice(currentPrice)}` : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="text-sm text-secondary">Estimated total</span>
              <span id="trade-estimated-total" className="mono font-bold"
                style={{ fontSize: '1.25rem', color: side === 'buy' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                {total !== null && quantity > 0 ? formatUsd(total) : '—'}
              </span>
            </div>
          </div>

          {/* Pre-flight validation */}
          {wouldFail && quantity > 0 && (
            <div id="trade-preflight-error" className="alert alert-error">
              <span aria-hidden="true">⚠</span>
              {side === 'buy'
                ? `Insufficient balance. Need ${total !== null ? formatUsd(total) : '—'}, have ${formatUsd(cashBalance)}.`
                : `Insufficient holdings. Holding ${heldQty.toFixed(8)} ${coin.symbol}, trying to sell ${quantity.toFixed(8)}.`}
            </div>
          )}

          {error && (
            <div id="trade-error" className="alert alert-error" role="alert">
              <span aria-hidden="true">⚠</span> {error}
            </div>
          )}
          {success && (
            <div id="trade-success" className="alert alert-success" role="status">
              <span aria-hidden="true">✓</span> {success}
            </div>
          )}

          <button
            id="trade-submit"
            type="button"
            className={`btn btn-lg btn-block ${side === 'buy' ? 'btn-buy' : 'btn-sell'}`}
            onClick={handleTrade}
            disabled={!canSubmit || submitting}
          >
            {submitting ? (
              <><span className="spinner" aria-hidden="true" /> Processing…</>
            ) : (
              <>{side === 'buy' ? '▲ Buy' : '▼ Sell'} {coin.symbol}{total !== null && quantity > 0 ? ` • ${formatUsd(total)}` : ''}</>
            )}
          </button>
        </div>

        {/* Side panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card card-sm">
            <h3 style={{ marginBottom: '1rem', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Your Holdings</h3>
            {holdings.filter((h) => Number(h.quantity) > 0).length === 0 ? (
              <p className="text-sm text-muted">No holdings yet. Make your first buy!</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {COINS.filter((c) => holdings.find((h) => h.coin_id === c.id && Number(h.quantity) > 0)).map((c) => {
                  const h = holdings.find((hh) => hh.coin_id === c.id)!;
                  const p = prices[c.id];
                  const val = p ? Number(h.quantity) * p : null;
                  return (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="flex items-center gap-2">
                        <span className={`coin-icon ${COIN_ICON_CLASS[c.id]}`} style={{ width: '28px', height: '28px', fontSize: '0.7rem' }}>
                          {COIN_EMOJI[c.id]}
                        </span>
                        <div>
                          <div className="text-sm font-semibold">{c.symbol}</div>
                          <div className="text-xs text-muted mono">{Number(h.quantity).toFixed(6)}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm mono font-semibold">{val !== null ? formatUsd(val) : '—'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="card card-sm">
            <p className="text-xs text-muted" style={{ lineHeight: '1.6' }}>
              <strong style={{ color: 'var(--paper-text)' }}>Practice mode:</strong> all trades are simulated. No real money is involved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
