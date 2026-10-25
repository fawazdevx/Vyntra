# Vyntra indexer

HTTP API + chain sync for launches, trades, OHLCV, replies, holders/snipers, and portfolio.

Storage is **libSQL** (local `file:` DB or **Turso** in production). The same codebase runs:

- locally (`npm run dev` — API + poll loop)
- on **Vercel** (serverless API + Cron / stale-on-request sync)

## Local

```bash
cd indexer
cp .env.example .env
# FACTORY_ADDRESS=0x…  BOARD_ADDRESS=0x…
npm install
npm run dev          # http://127.0.0.1:8787 + sync loop
```

```bash
curl -s http://127.0.0.1:8787/health
```

Frontend:

```env
VITE_INDEXER_URL=http://127.0.0.1:8787
```

## Deploy on Vercel (second project)

### 1. Create a Turso database

```bash
# https://turso.tech — CLI or dashboard
turso db create vyntra-indexer
turso db show vyntra-indexer --url
turso db tokens create vyntra-indexer
```

### 2. Create the Vercel project

- Import the same Git repo
- **Root Directory** = `indexer`
- Framework: Other
- Install / build: `npm install` / `npm run vercel-build` (typecheck)

### 3. Environment variables (Production + Preview)

| Name | Required | Notes |
|------|----------|--------|
| `FACTORY_ADDRESS` | yes | Live VyntraFactory |
| `BOARD_ADDRESS` | optional | Replies |
| `TURSO_DATABASE_URL` | yes | `libsql://…turso.io` |
| `TURSO_AUTH_TOKEN` | yes | Turso token |
| `INDEXER_RPC_URL` | yes | e.g. `https://rpc.bohr.life` |
| `INDEXER_CHAIN_ID` | yes | `968` testnet / `677` mainnet |
| `CRON_SECRET` | recommended | Random string; Cron sends `Authorization: Bearer …` |
| `INDEXER_SYNC_STALE_SEC` | optional | Default `20` — request-path sync if older |

### 4. Deploy

```bash
cd indexer
npx vercel login
npx vercel --prod
```

### 5. Point the frontend at it

On the **frontend** Vercel project:

```env
VITE_INDEXER_URL=https://<your-indexer-project>.vercel.app/api
```

Redeploy the frontend after changing `VITE_*`.

Health check:

```bash
curl -s https://<your-indexer-project>.vercel.app/api/health
```

### How sync works on Vercel

There is no always-on worker. Sync runs when:

1. **Cron** hits `/api/cron/sync` every 5 minutes (`vercel.json`) — needs a plan that allows that schedule
2. **Stale-on-request** — API routes call `maybeSync()` if `last_sync_at` is older than `INDEXER_SYNC_STALE_SEC`

Hobby cron limits may be daily only; stale-on-request keeps markets usable without Pro.

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Sync status + config |
| GET | `/cron/sync` | Force sync (Bearer `CRON_SECRET` if set) |
| GET | `/v1/stats` | Aggregate market stats |
| GET | `/v1/launches?sort=trending\|new\|volume` | Launch list |
| GET | `/v1/launches/:id` | Single launch |
| GET | `/v1/launches/:id/trades` | Trade tape |
| GET | `/v1/launches/:id/ohlcv?interval=300` | Candles |
| GET | `/v1/launches/:id/replies` | Board replies |
| GET | `/v1/launches/:id/holders` | Holders |
| GET | `/v1/launches/:id/snipers` | Snipers |
| GET | `/v1/wallets/:address/portfolio` | Portfolio / PnL |
| GET | `/v1/wallets/:address/trades` | Wallet trades |

On Vercel, prefix every path with `/api` (because of `basePath: '/api'`).
