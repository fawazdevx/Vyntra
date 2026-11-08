# Vyntra indexer

HTTP API and chain sync for launches, trades, OHLCV, replies, holders, snipers, and portfolio.
The current project target is Kinetiq Elysium Testnet: chain ID `99801`, native token HYPE.

## Run locally

```bash
cd indexer
cp .env.example .env
# Add deployed contract addresses and deployment block numbers after the Elysium deployment.
npm install
npm run dev
```

The API listens at `http://127.0.0.1:8787`. For Elysium, use a fresh local database or a new
Turso database; never point the testnet indexer at a database populated by another chain.

## Deploy the API on Vercel

Use the existing separate Vercel indexer project:

| Project setting | Value |
| --- | --- |
| Root Directory | `indexer` |
| Framework Preset | Other |
| Build Command | `npm run vercel-build` |
| Install Command | `npm install` |
| Output Directory | `public` |

Set these variables in the indexer project:

| Name | Required | Value |
| --- | --- | --- |
| `FACTORY_ADDRESS` | yes | Elysium VyntraFactory |
| `VYNTRA_MARKET_ADDRESS` | yes | Elysium VYNTRA/HYPE market |
| `VYNTRA_TOKEN_ADDRESS` | yes | Elysium VYNTRA token |
| `VYNTRA_RESERVE_VAULT_ADDRESS` | yes | Elysium reserve policy vault |
| `INDEXER_CHAIN_ID` | yes | `99801` |
| `INDEXER_RPC_URL` | yes | `https://testnet-rpc.elysium.kinetiq.xyz` |
| `INDEXER_START_BLOCK` | yes | Factory deployment block |
| `VYNTRA_MARKET_START_BLOCK` | yes | VYNTRA market deployment block |
| `VYNTRA_RESERVE_START_BLOCK` | recommended | Reserve vault deployment block; defaults to `INDEXER_START_BLOCK` |
| `TURSO_DATABASE_URL` | yes | New Elysium-only Turso database URL |
| `TURSO_AUTH_TOKEN` | yes | Token for that database |
| `BOARD_ADDRESS` | optional | Elysium VyntraBoard |
| `INDEXER_LOG_CHUNK` | optional | Default `2000` blocks |
| `INDEXER_MARKET_CATCHUP_CHUNKS` | optional | Default `1` on Vercel |
| `VYNTRA_RESERVE_CATCHUP_CHUNKS` | optional | Default `1` on Vercel |
| `CRON_SECRET` | recommended | Random bearer secret for `/api/cron/sync` |

After deployment, check `/api/health`, `/api/v1/stats`, `/api/v1/launches`, and `/api/v1/reserve`.
Health should report chain ID `99801`. Set the frontend `VITE_INDEXER_URL` to the project URL plus
`/api`, then redeploy the frontend.

Vercel syncs on API requests when the index is stale and uses the configured Cron schedule as a
backup. Use a separate Turso database for each chain deployment so launch and volume data cannot mix.

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Sync status and chain configuration |
| GET | `/api/v1/hype-usd` | Hyperliquid mainnet HYPE/USD reference estimate |
| GET | `/api/v1/stats` | Aggregate launch and HYPE volume stats |
| GET | `/api/v1/reserve` | Indexed reserve campaigns, claims, expiries, and budget reallocations |
| GET | `/api/v1/launches?sort=trending\|new\|volume` | Launch list |
| GET | `/api/v1/launches/:id` | One launch |
| GET | `/api/v1/launches/:id/trades` | Trade tape |
| GET | `/api/v1/platform-trades` | Current VYNTRA market tape from `VYNTRA_MARKET_START_BLOCK` |
| GET | `/api/v1/launches/:id/ohlcv?interval=300` | Candles |
| GET | `/api/v1/launches/:id/replies` | Board replies |
| GET | `/api/v1/launches/:id/holders` | Holders |
| GET | `/api/v1/launches/:id/snipers` | Snipers |
| GET | `/api/v1/wallets/:address/portfolio` | Portfolio and PnL |
| GET | `/api/v1/wallets/:address/trades` | Wallet history |

The HYPE/USD route uses Hyperliquid mainnet HYPE as a reference. Faucet HYPE on Elysium Testnet has
no guaranteed dollar value, so the displayed dollar amount is an estimate rather than a testnet price.
