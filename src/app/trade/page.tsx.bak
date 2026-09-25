import { Suspense } from 'react';
import TradePageClient from './TradePageClient';

export const metadata = {
  title: 'Trade — Tickr Paper Trading',
  description: 'Buy and sell cryptocurrency with your practice cash balance.',
};

export default function TradePage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: '2.5rem' }}>
          <div className="empty-state">
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        </div>
      }
    >
      <TradePageClient />
    </Suspense>
  );
}
