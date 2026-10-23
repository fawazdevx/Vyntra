# Vyntra indexer

SQLite event indexer + HTTP API for launches, trades, OHLCV, replies, holders/snipers, and protocol stats.

Works **before deploy** (API serves empty data / `ready: false`). After you set `FACTORY_ADDRESS`, the worker syncs from BOT RPC.

## Quick start (after deploy)

```bash
cd indexer
cp .env.example .env
# paste FACTORY_ADDRESS=0x… (and optional BOARD_ADDRESS)

npm install
npm run dev          # API :8787 + sync loop
# or split:
#   npm run worker   # sync only
#   npm run api      # API only
```

Health:

```bash
curl -s http://127.0.0.1:8787/health | jq
```

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Sync status + config |
| GET | `/v1/stats` | Aggregate market stats |
| GET | `/v1/launches?sort=trending\|new\|volume` | Launch list |
| GET | `/v1/launches/:id` | Single launch |
| GET | `/v1/launches/:id/trades` | Trade tape points |
| GET | `/v1/launches/:id/ohlcv?interval=300` | Candles (60/300/900/3600/86400) |
| GET | `/v1/launches/:id/replies` | Indexed board replies |
| GET | `/v1/launches/:id/holders` | Holder list + whale clusters |
| GET | `/v1/launches/:id/snipers` | Early-buyer / sniper dump stats |
| GET | `/v1/wallets/:address/portfolio` | Positions + realized/unrealized PnL |
| GET | `/v1/wallets/:address/trades` | Wallet trade history |

## Frontend

Set in `frontend/.env`:

```env
VITE_INDEXER_URL=http://127.0.0.1:8787
```

The app prefers the indexer and falls back to direct RPC if it is down.

## Cron (optional)

```cron
*/2 * * * * cd /path/to/Vyntra/indexer && npm run sync >> /tmp/vyntra-indexer.log 2>&1
```

Keep `npm run api` (or `npm run dev`) running as a service for the UI.
