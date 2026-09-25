import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const VALID_COINS = ['bitcoin', 'ethereum', 'solana', 'dogecoin', 'cardano'];
const VALID_SIDES = ['buy', 'sell'];

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Verify session server-side
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { coin_id?: string; side?: string; quantity?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { coin_id, side, quantity: rawQuantity } = body;

  // Validate coin_id
  if (!coin_id || !VALID_COINS.includes(coin_id)) {
    return NextResponse.json(
      { error: `Invalid coin_id. Must be one of: ${VALID_COINS.join(', ')}` },
      { status: 400 }
    );
  }

  // Validate side
  if (!side || !VALID_SIDES.includes(side)) {
    return NextResponse.json(
      { error: `Invalid side. Must be 'buy' or 'sell'` },
      { status: 400 }
    );
  }

  // Validate quantity
  const quantity = Number(rawQuantity);
  if (!rawQuantity || isNaN(quantity) || quantity <= 0) {
    return NextResponse.json(
      { error: 'Quantity must be a positive number' },
      { status: 400 }
    );
  }

  // Call the atomic execute_trade RPC — this is the single source of truth for
  // balance/holdings mutation. No client-side state is modified here.
  const { error: rpcError } = await supabase.rpc('execute_trade', {
    p_coin_id: coin_id,
    p_side: side,
    p_quantity: quantity,
  });

  if (rpcError) {
    // Surface Postgres RAISE EXCEPTION messages as clear 400 errors
    const msg = rpcError.message ?? 'Trade failed';
    const isClientError =
      msg.includes('Insufficient cash') ||
      msg.includes('Insufficient holdings') ||
      msg.includes('No price available') ||
      msg.includes('Invalid side');

    return NextResponse.json(
      { error: msg },
      { status: isClientError ? 400 : 500 }
    );
  }

  return NextResponse.json({ ok: true, coin_id, side, quantity });
}
