# Vyntra frontend

React, Vite, wagmi, and RainbowKit frontend for Kinetiq Elysium Testnet (`99801`, HYPE gas).

## Run locally

```bash
cp .env.example .env
# Add the Elysium contract addresses after deployment.
npm install
npm run dev
```

## Deploy to Vercel

Use `frontend` as the project Root Directory, Vite as the framework, `npm run build` as the build
command, and `dist` as the output directory. Set these variables in Production and Preview:

| Name | Required | Notes |
| --- | --- | --- |
| `VITE_CHAIN_ID` | yes | `99801` |
| `VITE_ELYSIUM_TESTNET_RPC_URL` | optional | Defaults to `https://testnet-rpc.elysium.kinetiq.xyz` |
| `VITE_FACTORY_ADDRESS` | yes | Elysium VyntraFactory |
| `VITE_VYNTRA_TOKEN` | yes | Platform token |
| `VITE_VYNTRA_MARKET` | yes | Platform HYPE market |
| `VITE_VYNTRA_RESERVE_TIMELOCK` | yes | Public reserve-operation delay |
| `VITE_VYNTRA_RESERVE_VAULT` | yes | Live allocation balances and rolling release cap |
| `VITE_VYNTRA_PROMOTION` | yes | Creator featured-placement contract |
| `VITE_BUYBACK_VAULT` | yes | Buyback vault |
| `VITE_FEE_ROUTER` | yes | Fee router |
| `VITE_BOARD_ADDRESS` | optional | On-chain replies |
| `VITE_KEEPER_ADDRESS` | optional | Keeper panel |
| `VITE_INDEXER_URL` | optional | Indexer URL including `/api`, e.g. `https://vyntra-indexer.vercel.app/api` |
| `VITE_HIDDEN_LAUNCH_IDS` | optional | Comma-separated launch IDs to hide in Vyntra, such as an imported legacy launch (`1`) |
| `VITE_WALLETCONNECT_ID` | yes for production wallets | WalletConnect Cloud project ID |
| `IMGBB_API_KEY` | optional | Private ImgBB fallback for the server-side image uploader |

`VITE_*` values are baked into the build. Redeploy after changing them. Set the indexer project to
index `VYNTRA_RESERVE_VAULT_ADDRESS` and its deployment block so campaign activity appears on the
VYNTRA page. Give the Elysium indexer a separate Turso database from any other chain deployment.

The USD helper uses Hyperliquid mainnet HYPE as a reference. Testnet HYPE has no guaranteed dollar
value, so the displayed USD amount is only an estimate.

## Image uploads

The browser compresses token images and sends them through `/api/upload-image`. In local Vite,
`plugins/uploadImage.ts` handles the request. Vercel uses `api/upload-image.ts`; the server tries
Catbox, then ImgBB when the private `IMGBB_API_KEY` is configured. It avoids hosts with explicit
short expirations because a token's on-chain image URL cannot be changed after launch. Pasted URLs
should be direct, public image links that will remain available.
