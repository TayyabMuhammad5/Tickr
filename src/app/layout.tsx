import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';

export const metadata: Metadata = {
  title: 'Tickr — Paper Trading Simulator',
  description:
    'Practice crypto trading with real live prices and zero real money. Tickr is a paper-trading simulator powered by live CoinGecko market data.',
  keywords: ['paper trading', 'crypto simulator', 'bitcoin', 'ethereum', 'practice trading'],
  openGraph: {
    title: 'Tickr — Paper Trading Simulator',
    description: 'Trade real live crypto prices with fake money. No risk, real prices.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <div className="page-shell">
          <Nav />
          <div className="main-content">{children}</div>
        </div>
      </body>
    </html>
  );
}
