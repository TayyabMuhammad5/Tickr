'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { COINS, COIN_ICON_CLASS, COIN_EMOJI, formatUsd, formatQuantity } from '@/lib/coins';
import type { Profile, Holding, PriceMap } from '@/lib/types';
import Link from 'next/link';

export default function PortfolioPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

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
      .channel('portfolio-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'price_snapshots' }, (p) => {
        const { coin_id, price_usd } = p.new as { coin_id: string; price_usd: number };
        setPrices((prev) => ({ ...prev, [coin_id]: Number(price_usd) }));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (p) => {
        setProfile((prev) => prev ? { ...prev, cash_balance: Number(p.new.cash_balance) } : prev);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holdings' }, () => {
        supabase.auth.getUser().then(({ data: { user: u } }) => {
          if (u) {
            supabase.from('holdings').select('*').eq('user_id', u.id).then(({ data }) => {
              if (data) setHoldings(data as Holding[]);
            });
          }
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  if (authChecked && !user) {
    return (
      <div className="container" style={{ paddingTop: '2.5rem' }}>
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">📊</div>
          <h3>Sign in to view your portfolio</h3>
          <p>Your holdings and balance are tracked per account.</p>
          <Link href="/auth" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
            Sign in or create account
          </Link>
        </div>
      </div>
    );
  }

  const cashBalance = profile?.cash_balance ?? 0;
  const activeHoldings = holdings.filter((h) => Number(h.quantity) > 0);

  // Compute values
  const holdingsValue = activeHoldings.reduce((sum, h) => {
    const p = prices[h.coin_id] ?? 0;
    return sum + Number(h.quantity) * p;
  }, 0);

  const totalValue = cashBalance + holdingsValue;

  const cashPct = totalValue > 0 ? (cashBalance / totalValue) * 100 : 100;

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3rem' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Portfolio</h1>
          {profile && (
            <p className="text-secondary text-sm" style={{ marginTop: '0.375rem' }}>
              {profile.display_name}
            </p>
          )}
        </div>
        <span className="paper-badge">Practice Balance</span>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total Value</div>
          <div id="portfolio-total-value" className="stat-value" style={{ color: 'var(--accent-blue)' }}>
            {loading ? <span className="skeleton" style={{ width: '120px', height: '28px', display: 'block' }} /> : formatUsd(totalValue)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Cash Balance</div>
          <div id="portfolio-cash" className="stat-value">
            {loading ? <span className="skeleton" style={{ width: '120px', height: '28px', display: 'block' }} /> : formatUsd(cashBalance)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Holdings Value</div>
          <div id="portfolio-holdings-value" className="stat-value" style={{ color: 'var(--accent-green)' }}>
            {loading ? <span className="skeleton" style={{ width: '120px', height: '28px', display: 'block' }} /> : formatUsd(holdingsValue)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">vs Start ($10,000)</div>
          <div
            id="portfolio-pnl"
            className="stat-value"
            style={{ color: totalValue >= 10000 ? 'var(--accent-green)' : 'var(--accent-red)' }}
          >
            {loading
              ? <span className="skeleton" style={{ width: '120px', height: '28px', display: 'block' }} />
              : `${totalValue >= 10000 ? '+' : ''}${formatUsd(totalValue - 10000)}`}
          </div>
        </div>
      </div>

      {/* Allocation bar */}
      {!loading && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span className="text-sm text-secondary">Portfolio allocation</span>
            <span className="text-sm text-muted">Cash {cashPct.toFixed(1)}% / Crypto {(100 - cashPct).toFixed(1)}%</span>
          </div>
          <div
            style={{ height: '8px', borderRadius: '999px', background: 'var(--bg-elevated)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}
            role="progressbar"
            aria-label={`${(100 - cashPct).toFixed(1)}% in crypto holdings`}
          >
            <div
              style={{
                width: `${100 - cashPct}%`,
                height: '100%',
                background: 'linear-gradient(90deg, var(--accent-blue), var(--accent-purple))',
                borderRadius: '999px',
                transition: 'width 0.5s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Holdings table */}
      {loading ? (
        <div className="table-container">
          <table className="data-table" aria-label="Portfolio loading">
            <thead>
              <tr><th>Asset</th><th>Quantity</th><th>Price</th><th>Value</th><th style={{ textAlign: 'right' }}>Action</th></tr>
            </thead>
            <tbody>
              {[1, 2, 3].map((i) => (
                <tr key={i}>
                  {[1, 2, 3, 4, 5].map((j) => (
                    <td key={j}><div className="skeleton" style={{ width: `${60 + j * 15}px`, height: '18px' }} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : activeHoldings.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">📭</div>
          <h3>No holdings yet</h3>
          <p>Head over to the Trade page to make your first buy with your $10,000 practice cash.</p>
          <Link id="portfolio-go-trade" href="/trade" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
            Go to Trade →
          </Link>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table" aria-label="Your crypto holdings">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Quantity</th>
                <th>Current Price</th>
                <th>Current Value</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {COINS.filter((c) => activeHoldings.find((h) => h.coin_id === c.id)).map((coin) => {
                const h = activeHoldings.find((hh) => hh.coin_id === coin.id)!;
                const price = prices[coin.id] ?? null;
                const value = price !== null ? Number(h.quantity) * price : null;

                return (
                  <tr key={coin.id}>
                    <td>
                      <div className="coin-cell">
                        <div className={`coin-icon ${COIN_ICON_CLASS[coin.id]}`} aria-hidden="true">
                          {COIN_EMOJI[coin.id]}
                        </div>
                        <div>
                          <div className="coin-name">{coin.name}</div>
                          <div className="coin-symbol">{coin.symbol}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        id={`holding-qty-${coin.id}`}
                        className="mono font-medium"
                      >
                        {formatQuantity(Number(h.quantity), coin.symbol)}
                      </span>
                    </td>
                    <td>
                      <span className="mono" id={`holding-price-${coin.id}`}>
                        {price !== null ? `$${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                      </span>
                    </td>
                    <td>
                      <span
                        id={`holding-value-${coin.id}`}
                        className="mono font-semibold"
                        style={{ color: 'var(--accent-green)' }}
                      >
                        {value !== null ? formatUsd(value) : '—'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        id={`portfolio-sell-${coin.id}`}
                        href={`/trade?coin=${coin.id}`}
                        className="btn btn-danger btn-sm"
                        aria-label={`Sell ${coin.name}`}
                      >
                        Sell
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
