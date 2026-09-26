# Tickr — Paper Trading Simulator

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Database%20%26%20Auth-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Vercel-Deployed-000000?style=flat-square&logo=vercel)](https://vercel.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> **Practice crypto trading with live real prices. Zero real money. All the thrill.**

Tickr is a modern, full-stack paper-trading simulator built to provide a realistic trading experience without financial risk. Powered by **Next.js 15**, **Supabase** (Postgres + Auth + Realtime), and hosted on **Vercel**, Tickr offers a highly responsive, live-updating environment. 

Every asset price shown on the platform originates from real CoinGecko API data stored in the database — no mocking, no hardcoded values.

---

## 🌐 Live Demo

**Experience the platform live:** **[https://tickr-blond-two.vercel.app/](https://tickr-blond-two.vercel.app/)**

### Demo Credentials

For quick evaluation without creating an account, you can use the pre-seeded demo profile:

| Email | Password | Starting State |
|-------|----------|----------------|
| `demo@tickr.dev` | `demo1234` | $25,000 cash + BTC, ETH, and SOL holdings |

---

## ✨ Key Features

| Feature | Description |
|------|-------------|
| **Live Market Data** | Real-time 5-coin price table with dynamic green/red flash animations on price changes. Subscribed via Supabase Realtime for instant, refresh-free updates. |
| **Instant Trading** | Buy/sell execution with live total calculation, robust client-side validation, and comprehensive error handling. Trades execute atomically via Postgres RPC to guarantee data integrity. |
| **Portfolio Management** | Detailed holdings table displaying cash balance, total portfolio value, P&L vs. starting balance, and a visual asset allocation bar. |
| **Global Leaderboard** | Community rankings based on total portfolio value, recomputed seamlessly using live asset prices. |

*Note: A persistent **"Practice / Paper Trading"** banner is visible across the application to ensure the simulated nature of the platform is always clear.*

---

## 🏗 Architecture & Technical Decisions

The application is designed for speed, atomicity, and real-time responsiveness.

```text
Client (Next.js 15, App Router)
    ↕ Supabase Realtime (WebSocket subscriptions)
    ↕ /api/trade  (POST - Secure Trade Execution)
    ↕ /api/ingest (GET - Live Price Fetching)
    
Server (Vercel Serverless + Cron)
    ↕ Supabase Postgres (Row Level Security + Atomic RPC)
    ↕ CoinGecko API (Server-side external data source)
```

### 1. Real-Time Price Ingestion
The frontend **never calls CoinGecko directly**. Instead:
- The Next.js client polls the internal `/api/ingest` endpoint every 60 seconds while active.
- A Vercel Cron Job runs daily as a fallback to ensure prices are never completely stale.
- The backend fetches data from CoinGecko and inserts it into the `price_snapshots` table.
- **Supabase Realtime** instantly pushes these updates to all connected browser clients.

### 2. Atomic Trade Execution
To prevent Race Conditions (TOCTOU) and ensure absolute data consistency, trades are executed using a single Postgres RPC function (`execute_trade`). 
- Validates the current live price directly from the database.
- Confirms sufficient cash balance or asset holdings.
- Deducts funds, credits assets, and logs the trade **in a single atomic transaction**.

---

## 🚀 Local Development Setup

To run Tickr locally, follow these steps:

### 1. Clone and Install
```bash
git clone https://github.com/TayyabMuhammad5/Tickr.git
cd Tickr
npm install
```

### 2. Configure Environment Variables
Copy the example environment file and fill in your Supabase credentials:
```bash
cp .env.local.example .env.local
```
Required variables:
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon/public key (browser-safe)
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role key (server-only)
- `CRON_SECRET`: Random secret used to authenticate manual ingest calls

### 3. Database Setup
1. Create a new project at [Supabase](https://supabase.com/).
2. Navigate to **SQL Editor** and run the provided `supabase/schema.sql` file.
3. In **Authentication → Settings**, disable "Confirm email" to allow instant signups.

### 4. Run the Development Server
```bash
npm run dev
```
Navigate to `http://localhost:3000` to view the application.

---

## ☁️ Deployment

Tickr is optimized for Vercel deployment. 

```bash
npx vercel --prod
```
Ensure you add the four required environment variables to your Vercel Project Settings. The scheduled cron job for price fetching will activate automatically.

---

## 📄 License & Agent Logs

This project was built as part of an advanced agentic coding exercise. All automated agent build logs are stored in the `.agent-logs/` directory for review.
