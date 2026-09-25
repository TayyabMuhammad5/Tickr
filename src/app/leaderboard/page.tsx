'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { COINS, COIN_ICON_CLASS, COIN_EMOJI, formatUsd } from '@/lib/coins';
import type { Profile, Holding, PriceMap } from '@/lib/types';

interface LeaderEntry {
  id: string;
  display_name: string;
  cash_balance: number;
  holdings: Holding[];
  total_value: number;
}

const REFRESH_INTERVAL_MS = 20_000; // recompute leaderboard every 20s

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const buildLeaderboard = useCallback(
    (profiles: Profile[], allHoldings: Holding[], priceMap: PriceMap): LeaderEntry[] => {
      return profiles
        .map((p) => {
          const userHoldings = allHoldings.filter((h) => h.user_id === p.id);
          const holdingsValue = userHoldings.reduce((sum, h) => {
            const price = priceMap[h.coin_id] ?? 0;
            return sum + Number(h.quantity) * price;
          }, 0);
          return {
            id: p.id,
            display_name: p.display_name || p.email?.split('@')[0] || 'Trader',
            cash_balance: Number(p.cash_balance),
            holdings: userHoldings,
            total_value: Number(p.cash_balance) + holdingsValue,
          };
        })
        .sort((a, b) => b.total_value - a.total_value);
    },
    []
  );

  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [allHoldings, setAllHoldings] = useState<Holding[]>([]);

  const recompute = useCallback(
    (profilesOverride?: Profile[], holdingsOverride?: Holding[], pricesOverride?: PriceMap) => {
      const p = profilesOverride ?? allProfiles;
      const h = holdingsOverride ?? allHoldings;
      const pr = pricesOverride ?? prices;
      const computed = buildLeaderboard(p, h, pr);
      setEntries(computed);
      setLastUpdated(new Date());
    },
    [allProfiles, allHoldings, prices, buildLeaderboard]
  );

  const loadData = useCallback(async () => {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id ?? null);

    const [profilesRes, holdingsRes, pricesRes] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('holdings').select('*'),
      supabase
        .from('price_snapshots')
        .select('coin_id, price_usd, fetched_at')
        .order('fetched_at', { ascending: false }),
    ]);

    const profiles = (profilesRes.data ?? []) as Profile[];
    const holdings = (holdingsRes.data ?? []) as Holding[];

    const priceMap: PriceMap = {};
    if (pricesRes.data) {
      for (const row of pricesRes.data) {
        if (!(row.coin_id in priceMap)) priceMap[row.coin_id] = Number(row.price_usd);
      }
    }

    setAllProfiles(profiles);
    setAllHoldings(holdings);
    setPrices(priceMap);
    setLoading(false);

    const computed = buildLeaderboard(profiles, holdings, priceMap);
    setEntries(computed);
    setLastUpdated(new Date());
  }, [buildLeaderboard]);

  useEffect(() => {
    loadData();

    const supabase = createClient();

    const channel = supabase
      .channel('leaderboard-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'price_snapshots' }, (p) => {
        const { coin_id, price_usd } = p.new as { coin_id: string; price_usd: number };
        setPrices((prev) => {
          const next = { ...prev, [coin_id]: Number(price_usd) };
          return next;
        });
        // Recompute is handled by the interval below to avoid excessive re-renders
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holdings' }, () => {
        // Reload all holdings and recompute
        supabase.from('holdings').select('*').then(({ data }) => {
          if (data) {
            setAllHoldings(data as Holding[]);
          }
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        supabase.from('profiles').select('*').then(({ data }) => {
          if (data) setAllProfiles(data as Profile[]);
        });
      })
      .subscribe();

    // Recompute leaderboard on interval (simpler than subscribing to every insert)
    const interval = setInterval(() => {
      recompute();
    }, REFRESH_INTERVAL_MS);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [loadData, recompute]);

  // Recompute when any data changes
  useEffect(() => {
    if (allProfiles.length > 0) {
      recompute();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allProfiles, allHoldings, prices]);

  const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3rem' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Leaderboard</h1>
          <p className="text-secondary text-sm" style={{ marginTop: '0.375rem' }}>
            Ranked by total portfolio value (cash + holdings at live prices)
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {lastUpdated && (
            <span className="text-xs text-muted mono">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <span className="live-dot">Live</span>
        </div>
      </div>

      {loading ? (
        <div className="table-container">
          <table className="data-table" aria-label="Leaderboard loading">
            <thead>
              <tr><th>#</th><th>Trader</th><th>Cash</th><th>Holdings</th><th style={{ textAlign: 'right' }}>Total Value</th></tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4].map((i) => (
                <tr key={i}>
                  {[1, 2, 3, 4, 5].map((j) => (
                    <td key={j}><div className="skeleton" style={{ width: `${50 + j * 20}px`, height: '18px' }} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">🏆</div>
          <h3>No traders yet</h3>
          <p>Be the first to sign up and claim the top spot!</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table" aria-label="Trading leaderboard">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Trader</th>
                <th>Cash</th>
                <th>Top Holdings</th>
                <th style={{ textAlign: 'right' }}>Total Value</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => {
                const rank = idx + 1;
                const isMe = entry.id === currentUserId;
                const activeHoldings = entry.holdings.filter((h) => Number(h.quantity) > 0);
                const holdingsValue = entry.total_value - entry.cash_balance;

                return (
                  <tr
                    key={entry.id}
                    id={`leaderboard-row-${entry.id}`}
                    style={isMe ? { background: 'rgba(99,179,237,0.06)', borderLeft: '3px solid var(--accent-blue)' } : {}}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className={`rank-cell rank-${rank <= 3 ? rank : ''}`}>
                          #{rank}
                        </span>
                        {MEDAL[rank] && <span className="medal" aria-hidden="true">{MEDAL[rank]}</span>}
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: `hsl(${(entry.display_name.charCodeAt(0) * 13) % 360}, 60%, 30%)`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: 'white',
                            flexShrink: 0,
                          }}
                          aria-hidden="true"
                        >
                          {entry.display_name[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div>
                          <div className="font-semibold text-sm">
                            {entry.display_name}
                            {isMe && (
                              <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: 'var(--accent-blue)', fontWeight: 600 }}>
                                (you)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="mono text-sm">{formatUsd(entry.cash_balance)}</span>
                    </td>

                    <td>
                      {activeHoldings.length === 0 ? (
                        <span className="text-muted text-sm">—</span>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                          {activeHoldings.slice(0, 3).map((h) => {
                            const coin = COINS.find((c) => c.id === h.coin_id);
                            if (!coin) return null;
                            return (
                              <span
                                key={h.coin_id}
                                className={`coin-icon ${COIN_ICON_CLASS[h.coin_id]}`}
                                style={{ width: '24px', height: '24px', fontSize: '0.65rem' }}
                                title={`${Number(h.quantity).toFixed(4)} ${coin.symbol} ≈ ${formatUsd((prices[h.coin_id] ?? 0) * Number(h.quantity))}`}
                              >
                                {COIN_EMOJI[h.coin_id]}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div>
                        <div
                          id={`leaderboard-total-${entry.id}`}
                          className="mono font-bold"
                          style={{
                            color: entry.total_value >= 10000 ? 'var(--accent-green)' : 'var(--accent-red)',
                            fontSize: '1rem',
                          }}
                        >
                          {formatUsd(entry.total_value)}
                        </div>
                        <div className="text-xs text-muted mono">
                          {holdingsValue > 0 ? `+${formatUsd(holdingsValue)} crypto` : 'cash only'}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted" style={{ marginTop: '1rem' }}>
        Rankings computed client-side from profiles + holdings + latest prices (recomputed every{' '}
        {REFRESH_INTERVAL_MS / 1000}s and on any data change via Realtime).
      </p>
    </div>
  );
}
