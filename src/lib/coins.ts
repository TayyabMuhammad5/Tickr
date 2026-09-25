import { Coin } from '@/lib/types';

export const COINS: Coin[] = [
  { id: 'bitcoin',  symbol: 'BTC', name: 'Bitcoin'  },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { id: 'solana',   symbol: 'SOL', name: 'Solana'   },
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' },
  { id: 'cardano',  symbol: 'ADA', name: 'Cardano'  },
];

export const COIN_MAP = Object.fromEntries(COINS.map((c) => [c.id, c]));

export const COIN_ICON_CLASS: Record<string, string> = {
  bitcoin:  'coin-btc',
  ethereum: 'coin-eth',
  solana:   'coin-sol',
  dogecoin: 'coin-doge',
  cardano:  'coin-ada',
};

export const COIN_EMOJI: Record<string, string> = {
  bitcoin:  '₿',
  ethereum: 'Ξ',
  solana:   '◎',
  dogecoin: 'Ð',
  cardano:  '₳',
};

/** Format a USD price with appropriate decimal places */
export function formatPrice(usd: number): string {
  if (usd >= 1000) {
    return usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else if (usd >= 1) {
    return usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  } else {
    return usd.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  }
}

/** Format a portfolio/total USD value */
export function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format a crypto quantity */
export function formatQuantity(qty: number, symbol: string): string {
  const decimals = symbol === 'BTC' ? 8 : symbol === 'ETH' ? 6 : 4;
  return qty.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }) + ' ' + symbol;
}
