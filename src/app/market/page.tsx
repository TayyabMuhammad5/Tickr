'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { COINS, COIN_ICON_CLASS, COIN_EMOJI, formatPrice, formatUsd } from '@/lib/coins';
import type { PriceMap } from '@/lib/types';
import Link from 'next/link';

interface PriceState {
  price: number;
  prevPrice: number | null;
  flashClass: '' | 'price-flash-up' | 'price-flash-down';
}

type PriceStates = Record<string, PriceState>;

/** Attempt to trigger on-demand ingestion — never throws */
async function ensureFreshPrices(onError?: (msg: string) => void) {
  try {
    const res = await fetch('/api/ingest', { method: 'GET' });
    const json = await res.json().catch(() => ({}));
    console.log('[market] ingest response:', json);
    if (!res.ok && json.error) {
      onError?.(json.error);
    } else {
      onError?.(null as unknown as string); // clear error
    }
  } catch (err) {
    console.error('[market] ingest fetch failed:', err);
    onError?.('Could not reach /api/ingest');
  }
}

/** How often the page actively requests a new price snapshot (ms) */
const INGEST_INTERVAL_MS = 60_000;

export default function MarketPage() {
  const [priceStates, setPriceStates] = useState<PriceStates>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [connected, setConnected] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Fetch initial prices from DB
  const loadInitialPrices = useCallback(async () => {
    const supabase = createClient();

    // For each coin get the latest price snapshot
    const { data, error } = await supabase
      .from('price_snapshots')
      .select('coin_id, price_usd, fetched_at')
      .order('fetched_at', { ascending: false });

    if (error || !data) return;

    // Take the latest per coin
    const latest: PriceMap = {};
    const latestTimes: Record<string, string> = {};
    for (const row of data) {
      if (!(row.coin_id in latest)) {
        latest[row.coin_id] = Number(row.price_usd);
        latestTimes[row.coin_id] = row.fetched_at;
      }
    }

    // Check staleness — trigger on-demand ingest if needed
    const now = Date.now();
    const allTimes = Object.values(latestTimes).map((t) => new Date(t).getTime());
    const mostRecent = allTimes.length ? Math.max(...allTimes) : 0;
    if (now - mostRecent > 55_000) {
      ensureFreshPrices();
    }

    setPriceStates((prev) => {
      const next = { ...prev };
      for (const [coinId, price] of Object.entries(latest)) {
        next[coinId] = {
          price,
          prevPrice: prev[coinId]?.price ?? null,
          flashClass: '',
        };
      }
      return next;
    });

    if (allTimes.length) setLastUpdated(new Date(mostRecent));
  }, []);

  useEffect(() => {
    loadInitialPrices();

    // Vercel Hobby cron only runs daily, so the page itself triggers
    // ingestion every 60 s while it is open. Supabase Realtime delivers
    // the new rows to ALL open tabs the moment they are inserted.
    const triggerIngest = () => ensureFreshPrices((err) => setIngestError(err));
    triggerIngest(); // fire immediately on mount
    const ingestInterval = setInterval(triggerIngest, INGEST_INTERVAL_MS);

    const supabase = createClient();

    // Subscribe to realtime inserts on price_snapshots
    const channel = supabase
      .channel('market-prices')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'price_snapshots' },
        (payload) => {
          const { coin_id, price_usd } = payload.new as {
            coin_id: string;
            price_usd: number;
          };
          const newPrice = Number(price_usd);

          setPriceStates((prev) => {
            const prevPrice = prev[coin_id]?.price ?? null;
            const flash =
              prevPrice === null
                ? ''
                : newPrice > prevPrice
                ? 'price-flash-up'
                : newPrice < prevPrice
                ? 'price-flash-down'
                : '';

            // Clear previous flash timer
            if (flashTimers.current[coin_id]) {
              clearTimeout(flashTimers.current[coin_id]);
            }

            // Schedule flash reset
            if (flash) {
              flashTimers.current[coin_id] = setTimeout(() => {
                setPriceStates((s) => ({
                  ...s,
                  [coin_id]: { ...s[coin_id], flashClass: '' },
                }));
              }, 700);
            }

            return {
              ...prev,
              [coin_id]: { price: newPrice, prevPrice, flashClass: flash as PriceState['flashClass'] },
            };
          });

          setLastUpdated(new Date());
        }
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      clearInterval(ingestInterval);
      supabase.removeChannel(channel);
      // Clear all flash timers
      Object.values(flashTimers.current).forEach(clearTimeout);
    };
  }, [loadInitialPrices]);

  const hasAnyPrice = Object.keys(priceStates).length > 0;

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3rem' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Market</h1>
          <p className="text-secondary text-sm" style={{ marginTop: '0.375rem' }}>
            Live prices for 5 cryptocurrencies, updates stream in real time
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {lastUpdated && (
            <span className="text-xs text-muted mono">
              Last update: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          {connected ? (
            <span className="live-dot">Live</span>
          ) : (
            <span className="text-xs text-muted">Connecting…</span>
          )}
        </div>
      </div>

      {/* Ingest error banner — shows when /api/ingest fails */}
      {ingestError && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }} role="alert">
          <span aria-hidden="true">⚠</span>
          <span>
            <strong>Price fetch error:</strong> {ingestError}.{' '}
            Check that your Supabase env vars are set and the schema has been run.
          </span>
        </div>
      )}

      {/* Price Table */}
      {!hasAnyPrice ? (
        <div className="table-container">
          <table className="data-table" aria-label="Market prices loading">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Price (USD)</th>
                <th>Change</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {COINS.map((coin) => (
                <tr key={coin.id}>
                  <td>
                    <div className="coin-cell">
                      <div className={`coin-icon ${COIN_ICON_CLASS[coin.id]}`}>
                        {COIN_EMOJI[coin.id]}
                      </div>
                      <div>
                        <div className="coin-name">{coin.name}</div>
                        <div className="coin-symbol">{coin.symbol}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="skeleton" style={{ width: '120px', height: '20px' }} />
                  </td>
                  <td>
                    <div className="skeleton" style={{ width: '60px', height: '20px' }} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="skeleton" style={{ width: '60px', height: '30px', marginLeft: 'auto' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table" aria-label="Live cryptocurrency prices">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Price (USD)</th>
                <th>vs Previous</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {COINS.map((coin) => {
                const state = priceStates[coin.id];
                const price = state?.price ?? null;
                const prevPrice = state?.prevPrice ?? null;
                const flashClass = state?.flashClass ?? '';

                const priceDiff =
                  price !== null && prevPrice !== null ? price - prevPrice : null;
                const pricePct =
                  priceDiff !== null && prevPrice
                    ? (priceDiff / prevPrice) * 100
                    : null;

                const trendClass =
                  priceDiff === null
                    ? 'neutral'
                    : priceDiff > 0
                    ? 'up'
                    : priceDiff < 0
                    ? 'down'
                    : 'neutral';

                return (
                  <tr key={coin.id}>
                    <td>
                      <div className="coin-cell">
                        <div
                          className={`coin-icon ${COIN_ICON_CLASS[coin.id]}`}
                          aria-hidden="true"
                        >
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
                        id={`price-${coin.id}`}
                        className={`price-value mono ${flashClass}`}
                        aria-label={`${coin.name} price: ${price !== null ? formatUsd(price) : 'loading'}`}
                        aria-live="polite"
                        aria-atomic="true"
                      >
                        {price !== null ? `$${formatPrice(price)}` : '—'}
                      </span>
                    </td>

                    <td>
                      {pricePct !== null ? (
                        <span className={`change-pill ${trendClass}`}>
                          {trendClass === 'up' ? '▲' : trendClass === 'down' ? '▼' : ''}
                          {Math.abs(pricePct).toFixed(3)}%
                        </span>
                      ) : (
                        <span className="change-pill neutral">—</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <Link
                        id={`trade-btn-${coin.id}`}
                        href={`/trade?coin=${coin.id}`}
                        className="btn btn-ghost btn-sm"
                        aria-label={`Trade ${coin.name}`}
                      >
                        Trade →
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
