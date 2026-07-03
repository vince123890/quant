# Quant API

Vercel-ready market data API, ported from the service layer of the
[Quant desktop terminal](https://github.com/eisenjimmy/Quant) (MIT).
No API key required — data comes from public sources (Yahoo Finance,
FRED CSV, Google News RSS) with deterministic sample fallback.

## Endpoints

| Endpoint | Description |
| --- | --- |
| `GET /api/quotes?symbols=SPY,QQQ` | Live quotes (price, change, previous close) |
| `GET /api/chart/SPY?range=6m` | OHLCV candles (`1d 1w 1m 6m 1y 5y max`) |
| `GET /api/signals/SPY?range=6m` | Deterministic signal evaluation: regime, setup, decision, risk/reward plan, pivots |
| `GET /api/macro/vix?range=1y` | Macro series (`jobs unemployment inflation treasury10y oil vix`) |
| `GET /api/news?symbols=AAPL&limit=6` | Headlines per symbol, deduped |
| `GET /api/search?q=apple` | Symbol search |
| `GET /api/valuation/AAPL` | Valuation snapshot (P/E, EV, margins, growth) |
| `GET /api/earnings?symbols=AAPL,MSFT` | Upcoming earnings events |
| `GET /api/holdings/SPY` | Top ETF holdings |

Every response includes a `source` field where relevant: `live` (real data)
or `sample` (deterministic fallback when the upstream source failed).

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. On [vercel.com](https://vercel.com), **Add New → Project → Import** this repo.
3. Framework preset: **Next.js** (auto-detected). No environment variables needed.
4. Deploy.

Note: Yahoo's unofficial endpoints sometimes rate-limit datacenter IPs more
aggressively than residential ones. Responses set `s-maxage` cache headers so
Vercel's CDN absorbs repeat traffic; endpoints degrade to `sample` data rather
than erroring.

## Disclaimer

Unofficial public data sources, for research/educational use only.
Not investment advice.
