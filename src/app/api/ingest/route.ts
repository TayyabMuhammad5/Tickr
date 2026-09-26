import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

const COINS = ['bitcoin', 'ethereum', 'solana', 'dogecoin', 'cardano'];
const COINGECKO_URL = `https://api.coingecko.com/api/v3/simple/price?ids=${COINS.join(',')}&vs_currencies=usd`;

// Simple rate-limit: track last successful ingest time in memory.
// Prevents hammering CoinGecko if multiple tabs trigger simultaneously.
let lastIngestAt = 0;
const MIN_INGEST_INTERVAL_MS = 45_000; // 45 s — well within CoinGecko free tier

export async function GET(req: NextRequest) {
  // Allow browser calls (market page interval) AND Vercel cron calls freely.
  // The route is safe to expose: it only reads public CoinGecko data and
  // writes to price_snapshots using the service role (no user data at risk).
  // Optional: if CRON_SECRET is set, still accept Vercel-signed cron calls.
  const isCron = req.headers.get('x-vercel-cron') === '1';

  // In-memory rate limit — skip if we ingested very recently (unless it's the cron)
  const now = Date.now();
  if (!isCron && now - lastIngestAt < MIN_INGEST_INTERVAL_MS) {
    return NextResponse.json(
      { ok: true, skipped: true, reason: 'rate_limited', nextIngestIn: Math.ceil((MIN_INGEST_INTERVAL_MS - (now - lastIngestAt)) / 1000) + 's' },
      { status: 200 }
    );
  }

  let data: Record<string, { usd: number }>;

  try {
    const res = await fetch(COINGECKO_URL, {
      // No auth headers — CoinGecko free tier, no key required
      cache: 'no-store',
    });

    if (!res.ok) {
      console.error(`[ingest] CoinGecko responded ${res.status}`);
      return NextResponse.json(
        { error: 'CoinGecko request failed', status: res.status },
        { status: 200 } // 200 so Vercel cron doesn't mark it as failure on rate limit
      );
    }

    data = await res.json();
  } catch (err) {
    console.error('[ingest] Network error fetching CoinGecko:', err);
    return NextResponse.json({ error: 'Network error' }, { status: 200 });
  }

  const supabase = createServiceClient();
  const rows = COINS.map((id) => ({
    coin_id: id,
    price_usd: data[id]?.usd ?? null,
  })).filter((r) => r.price_usd !== null);

  if (rows.length === 0) {
    console.error('[ingest] No valid prices in CoinGecko response');
    return NextResponse.json({ error: 'No valid prices' }, { status: 200 });
  }

  const { error } = await supabase.from('price_snapshots').insert(rows);

  if (error) {
    console.error('[ingest] Supabase insert error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  lastIngestAt = Date.now();
  console.log(`[ingest] Inserted ${rows.length} snapshots at ${new Date().toISOString()}`);
  return NextResponse.json({ ok: true, inserted: rows.length, prices: rows });
}
