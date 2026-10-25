# Vyntra indexer

HTTP API + chain sync for launches, trades, OHLCV, replies, holders/snipers, and portfolio.

Storage is **libSQL** (local `file:` DB or **Turso** in production). The same codebase runs:

- locally (`npm run dev` — API + poll loop)
- on **Render** (`npm start` — always-on API + poll loop)
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

## Deploy the API and worker together on Render

Render is the recommended production host when continuous background syncing is needed. The web service runs the API and poll loop in one process, while the frontend can stay on Vercel.

1. In Render, create a Blueprint for this repository and set **Blueprint Path** to `indexer/render.yaml`.
2. Choose a paid, always-on web service plan. Free web services can spin down while idle, which stops the polling loop.
3. Set the required variables prompted by the Blueprint:

   | Name | Value |
   |------|-------|
   | `FACTORY_ADDRESS` | Mainnet VyntraFactory address |
   | `INDEXER_CHAIN_ID` | `677` for BOT Chain mainnet |
   | `INDEXER_RPC_URL` | Mainnet RPC URL |
   | `INDEXER_START_BLOCK` | Block where the mainnet factory is deployed |
   | `TURSO_DATABASE_URL` | Production Turso URL |
   | `TURSO_AUTH_TOKEN` | Production Turso token |

4. After deploy, check `https://<render-service>.onrender.com/health` and confirm `ready` is `true` and `chainId` is `677`.
5. On the **frontend** Vercel project, set `VITE_INDEXER_URL` to `https://<render-service>.onrender.com` and redeploy the frontend.
6. Once the frontend uses Render, retire the old Vercel **indexer** project so only the Render process is syncing the shared database. Keep the frontend Vercel project.

Do not set `INDEXER_START_BLOCK` to `0` on a fresh mainnet database unless a full historical scan is intended. Keep the existing Turso database only if it contains data for the same chain and factory; otherwise use a separate mainnet database.

## Deploy on Vercel (second project)

## Vercel project settings (required)

| Setting | Value |
|---------|--------|
| Root Directory | `indexer` |
| Framework Preset | Other |
| Build Command | `npm run vercel-build` |
| Install Command | `npm install` |
| Output | (leave default for serverless `api/`) |

After deploy, `/api/health` must return JSON in under 1s. If it still times out, the Root Directory is probably the repo root instead of `indexer`.


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
| `INDEXER_LOG_CHUNK` | optional | Maximum block range per sync batch. Default `2000`. |
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
# also: https://<your-indexer-project>.vercel.app/  (rewrites to health)
```

### How sync works on Vercel

There is no always-on worker. Sync runs when:

1. **Stale-on-request (primary on Hobby)** — API routes call the sync if `last_sync_at` is older than `INDEXER_SYNC_STALE_SEC` (default 20s). Each sync advances by at most `INDEXER_LOG_CHUNK` blocks (default 2000), so initial backfills resume safely across requests.
2. **Cron (backup)** — `vercel.json` calls `/api/cron/sync` once daily (`0 0 * * *`). Vercel **Hobby** only allows daily crons; `*/5 * * * *` needs **Pro**.

On Hobby you do **not** need Pro for a working indexer — request traffic drives sync. Upgrade Pro only if you want frequent background sync with no traffic.

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Sync status + config |
| GET | `/v1/bot-usd` | Cached BOT Chain mainnet WBOT/USD reference price |
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


## Troubleshooting Vercel timeouts

If `/api/health` times out:

1. Redeploy after pulling latest (`api/health.ts` is a tiny function with no DB/viem).
2. Confirm env on the **indexer** project: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `FACTORY_ADDRESS`, `INDEXER_RPC_URL`.
3. `hasTursoUrl: false` in the health JSON means Turso is not configured — `/api/v1/*` will fail until it is.
4. Root Directory of the Vercel project must be `indexer`.
