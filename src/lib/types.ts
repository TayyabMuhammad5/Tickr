// Shared TypeScript types across Tickr

export interface Coin {
  id: string;
  symbol: string;
  name: string;
}

export interface PriceSnapshot {
  id: number;
  coin_id: string;
  price_usd: number;
  fetched_at: string;
}

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  cash_balance: number;
  created_at: string;
}

export interface Holding {
  user_id: string;
  coin_id: string;
  quantity: number;
}

export interface Trade {
  id: string;
  user_id: string;
  coin_id: string;
  side: 'buy' | 'sell';
  quantity: number;
  price_usd: number;
  total_usd: number;
  created_at: string;
}

// Price map: coin_id → latest price in USD
export type PriceMap = Record<string, number>;

export interface LeaderboardEntry {
  id: string;
  display_name: string;
  cash_balance: number;
  holdings: Holding[];
  total_value: number;
}
