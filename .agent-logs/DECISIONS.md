# Tickr Build Log — Design Decisions

## 1. Why trade execution is one atomic Postgres function

The `execute_trade` RPC is a single Postgres function rather than separate read-then-write API calls for two critical reasons:

**TOCTOU (Time-of-Check to Time-of-Use) race conditions**

If the API layer split the trade into separate operations:
1. Read current price
2. Read user's cash balance
3. Check if balance ≥ price × quantity
4. Deduct balance
5. Add to holdings
6. Insert trade record

...then between steps 1 and 4, another trade from the same session (or a concurrent request) could deduct the balance. Between steps 3 and 4, the balance could drop below the required amount. Both scenarios result in a corrupted database — the user could end up with a negative cash balance or holdings they didn't pay for.

By wrapping all six operations in a single `SECURITY DEFINER` Postgres function, they execute as one atomic transaction. Postgres's MVCC and row-level locking (`FOR UPDATE` on the balance/holdings row) guarantee that no other transaction can read or modify the balance between our check and our deduction.

**Price integrity**

The RPC fetches the price from `price_snapshots` itself (the latest row). If the API layer fetched the price and passed it as a parameter, a malicious client could send a fake price. The RPC pattern ensures the price used for the trade is always sourced from the database, not from the client.

---

## 2. How price ingestion is triggered

**Primary: On-demand interval from the Market page**

Vercel's **Hobby (free) tier** only supports cron jobs that run **once per day** — not every minute as originally planned. The `vercel.json` cron is set to `0 0 * * *` (daily at midnight UTC) as a safety net.

Instead, the Market page itself calls `GET /api/ingest` every **60 seconds** via `setInterval` while it is open in a browser tab. The flow is:

```
Market page mounts
  → calls /api/ingest immediately (on mount)
  → then every 60s via setInterval
      → fetches CoinGecko prices
      → inserts into price_snapshots
      → Supabase Realtime fires → ALL open tabs update instantly
  → cleans up interval on unmount
```

**Why on-demand over pure daily cron**: A daily cron alone would make prices 24 hours stale. The page-driven interval ensures prices update every ~60 seconds whenever anyone is actively using the app, which is exactly when live prices matter most.

**Why not a dedicated background worker**: Would require a paid hosting tier. The on-demand approach is free, simple, and achieves the same UX since the Realtime subscription delivers updates to all open tabs the moment the insert happens.

**Secondary: Daily Vercel Cron**

`vercel.json` still has `"schedule": "0 0 * * *"` as a once-daily fallback — this ensures at least one fresh price snapshot exists even if no one visited the site that day.

**Error handling**: If CoinGecko returns a non-2xx response (rate limit, outage), the route logs the error and returns HTTP 200 to Vercel (to avoid being marked as a cron failure on a temporary rate limit). **No fabricated prices are ever written.** If the response is missing a coin's price, that coin is silently skipped for that cycle.

---

## 3. Scope cuts made under time pressure

**Not built:**
- Price history chart (candlestick or line chart per coin)
- Order history / trade history view (the `trades` table exists in the DB and schema but there's no UI page)
- Limit orders (only market orders at current price)
- Portfolio realized/unrealized P&L split (only total P&L vs. $10k start)
- Email confirmation flow (disabled in Supabase for instant signup)
- Profile settings (display name edit)

**Why these cuts:**
The spec explicitly calls out "skip if tight" for the realized/unrealized indicator, and says "one clean, real, live-updating trading loop, fully working, beats a broader system with gaps." All four required views are complete and working. The cuts above are additive features that would have added complexity without improving the core trading loop.

**Leaderboard computation approach:**
The leaderboard ranking is computed client-side from the `profiles`, `holdings`, and latest `price_snapshots` data that the page already fetches. The alternative — a Postgres view or SQL query — would require re-fetching on every price update. Since the frontend already has all the data it needs via Realtime subscriptions, recomputing client-side on a 20-second interval (plus on every data change event) is simpler and produces the same result without additional database load.

---

## 4. Tool and model used

- **Tool**: Antigravity IDE (Google DeepMind)
- **Model**: Claude Sonnet 4.6 (Thinking)
- **Automatic log capture**: `.agents/hooks.json` → `Stop` lifecycle event → `capture_turn.ps1`
  - The `Stop` hook fires at the end of every agent turn
  - The script reads `transcriptPath` from stdin, extracts the last `USER_INPUT` and `PLANNER_RESPONSE`, appends to `.agent-logs/`
