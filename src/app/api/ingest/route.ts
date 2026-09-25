import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

const COINS = ['bitcoin', 'ethereum', 'solana', 'dogecoin', 'cardano'];
const COINGECKO_URL = `https://api.coingecko.com/api/v3/simple/price?ids=${COINS.join(',')}&vs_currencies=usd`;

export async function GET(req: NextRequest) {
  // Verify cron secret on Vercel — Vercel automatically sets Authorization header
  // when the cron job fires. On manual calls we allow a CRON_SECRET header check.
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (
    cronSecret &&
    authHeader !== `Bearer ${cronSecret}` &&
    // Vercel sets this header for internally triggered crons
    req.headers.get('x-vercel-cron') !== '1'
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let data: Record<string, { usd: number }>;

  try {
    const res = await fetch(COINGECKO_URL, {
      // No auth headers — CoinGecko free tier, no key required
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      console.error(`[ingest] CoinGecko responded ${res.status}`);
      return NextResponse.json(
        { error: 'CoinGecko request failed', status: res.status },
        { status: 200 } // 200 so Vercel cron doesn't mark it as a failure on rate limit
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

  console.log(`[ingest] Inserted ${rows.length} price snapshots at ${new Date().toISOString()}`);
  return NextResponse.json({ ok: true, inserted: rows.length, prices: rows });
}
