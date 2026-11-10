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

The API listens at `http://127.0.0.1:8787`. Use one database per chain deployment. When moving this
Elysium indexer from Vercel to Railway, keep the existing Elysium Turso database to preserve history.

## Deploy the indexer on Railway

Railway runs the API and the indexer polling loop in one persistent Node service. The loop polls
the chain every 8 seconds by default; unlike a serverless function, it keeps running between API
requests.

1. In Railway, create a project with **Deploy from GitHub repo** and select the Vyntra repository.
2. Open the service's **Settings** and set **Root Directory** to `/indexer`.
3. Set **Build Command** to `npm ci --include=dev && npm run build` and **Start Command** to
   `npm start`.
4. Set **Healthcheck Path** to `/api/health`, then generate a public domain under **Networking**.
5. Add the variables below to this Railway service. Keep RPC and Turso credentials as service
   variables; do not add them to frontend `VITE_` variables.

Required variables:

| Name | Required | Value |
| --- | --- | --- |
| `FACTORY_ADDRESS` | yes | `0xbB5518161F163c092be3b55eEcC5d5354a7Fad8d` |
| `VYNTRA_MARKET_ADDRESS` | yes | `0x263D7a26eCbF80f09eD1D3efc745FE9D9802b47c` |
| `VYNTRA_TOKEN_ADDRESS` | yes | `0xe158A31562EE41240061b2068e8D91eCeBaFC7f7` |
| `VYNTRA_RESERVE_VAULT_ADDRESS` | yes | `0xE5c67af8567D07c1297b1e583464F93C0808199C` |
| `BOARD_ADDRESS` | recommended | `0x2F9E71F88b04D432b8e15C6f6dF9241bcd3Ffc81` |
| `INDEXER_CHAIN_ID` | yes | `99801` |
| `INDEXER_RPC_URL` | yes | Alchemy Elysium Testnet HTTPS RPC URL, including your key |
| `INDEXER_START_BLOCK` | yes | `26162975` |
| `VYNTRA_MARKET_START_BLOCK` | yes | `26162909` |
| `VYNTRA_RESERVE_START_BLOCK` | yes | `26162900` |
| `TURSO_DATABASE_URL` | yes | The existing Elysium indexer's Turso URL, to retain indexed data |
| `TURSO_AUTH_TOKEN` | yes | The token for that Turso database |

Recommended runtime variables:

| Name | Value | Purpose |
| --- | --- | --- |
| `INDEXER_POLL_MS` | `5000` | Poll every five seconds; reduce further only if the RPC plan can handle it |
| `INDEXER_CATCHUP_CHUNKS` | `3` | Process up to three bounded factory ranges per pass |
| `INDEXER_MARKET_CATCHUP_CHUNKS` | `3` | Process up to three platform-market ranges per pass |
| `VYNTRA_RESERVE_CATCHUP_CHUNKS` | `3` | Process up to three reserve ranges per pass |
| `CRON_SECRET` | Generate a long random value | Protects manual `/api/cron/sync` requests |

Use the **same Turso database and token** as the current indexer so the existing cursors and history
are preserved. Do not leave the Vercel and Railway indexers syncing to that database at the same
time. Once Railway is healthy, stop the Vercel indexer.

The Railway server supports both `/api/...` and unprefixed API routes. Check `/api/health`,
`/api/v1/stats`, `/api/v1/launches`, and `/api/v1/reserve`; health should report chain ID `99801`.
Then set the frontend's `VITE_INDEXER_URL` to `https://<your-railway-domain>/api` and redeploy the
frontend. This keeps the indexer RPC key server-side in Railway.

The database cursor is saved after each bounded range, so a restart resumes from the last completed
block. Use a separate Turso database for each chain deployment so launch and volume data cannot
mix. The old Vercel API routes and `vercel.json` remain available as a rollback path, but Vercel's
serverless deployment does not run the persistent worker loop.

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
