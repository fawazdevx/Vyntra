# Spawn.fun frontend

Vite + React + wagmi + RainbowKit. Token image uploads go through `POST /api/upload-image` (Catbox proxy): Vite middleware in local dev, Vercel serverless in production.

## Local

```bash
cp .env.example .env   # if present; or copy keys from repo docs
npm install
npm run dev
```

## Deploy to Vercel

### 1. Prep repo

Commit the `frontend/` app (includes `api/upload-image.ts` + `vercel.json`).

### 2. Create the project

**CLI**

```bash
cd frontend
npx vercel login
npx vercel          # preview
npx vercel --prod   # production
```

When prompted:

| Setting | Value |
|--------|--------|
| Root Directory | `frontend` (if linking the monorepo root) |
| Framework | Vite (auto from `vercel.json`) |
| Build Command | `npm run build` |
| Output Directory | `dist` |

**Dashboard**

1. [vercel.com/new](https://vercel.com/new) → import the Git repo  
2. **Root Directory** → `frontend`  
3. Framework Preset → Vite  
4. Add Environment Variables (below) → Deploy  

### 3. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (Production + Preview):

| Name | Required | Notes |
|------|----------|--------|
| `VITE_FACTORY_ADDRESS` | yes | VyntraFactory |
| `VITE_VYNTRA_TOKEN` | yes | Platform token (aliases: `VITE_SPAWN_TOKEN`) |
| `VITE_VYNTRA_MARKET` | yes | Platform market (aliases: `VITE_SPAWN_MARKET`) |
| `VITE_BUYBACK_VAULT` | yes | |
| `VITE_FEE_ROUTER` | yes | |
| `VITE_BOARD_ADDRESS` | optional | On-chain replies |
| `VITE_KEEPER_ADDRESS` | optional | Keeper panel |
| `VITE_WALLETCONNECT_ID` | yes (prod) | [cloud.walletconnect.com](https://cloud.walletconnect.com) |
| `VITE_INDEXER_URL` | optional | **Public** HTTPS origin of the indexer API (no trailing path). Example: `https://indexer.yourdomain.com`. Do **not** use `localhost` on Vercel — the browser of each visitor must reach this URL. Leave unset to use RPC-only (no portfolio/holders from indexer). |
| `VITE_BOT_TESTNET_RPC_URL` | optional | default `https://rpc.bohr.life` |
| `VITE_BOT_MAINNET_RPC_URL` | optional | default `https://rpc.botchain.ai` |
| `VITE_IMGBB_API_KEY` | optional | backup if Catbox API fails |

Redeploy after changing env vars (`VITE_*` are baked in at build time).

#### What to put in `VITE_INDEXER_URL`

1. Deploy `indexer/` as its **own** Vercel project (Root Directory `indexer`) with Turso — see [indexer/README.md](../indexer/README.md).
2. Set `VITE_INDEXER_URL` to that project's public origin **plus** `/api`, e.g. `https://vyntra-indexer.vercel.app/api`.
3. Confirm `curl https://…/api/health` returns `{"ok":true,...}`.
4. Local: `http://127.0.0.1:8787` (no `/api` prefix when using `npm run dev`).
5. Leave unset to use RPC-only (no portfolio/holders from indexer).

n if any

### 5. Verify upload API

After deploy:

```bash
curl -s -X POST https://YOUR_DOMAIN/api/upload-image \
  -H 'Content-Type: application/json' \
  -d '{"filename":"t.jpg","contentType":"image/jpeg","dataBase64":"/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z"}'
```

Expect `{"url":"https://files.catbox.moe/..."}`.

Then open `/spawn` and upload a token image in the UI.

## Image upload architecture

```
Browser (compress ≤512px JPEG)
    → POST /api/upload-image  { dataBase64, filename, contentType }
        → Catbox (server-side, no CORS issues)
    ← { url }
    → imageURI on spawn()
```

- Local: `plugins/uploadImage.ts` Vite middleware  
- Vercel: `api/upload-image.ts` serverless function  
- Shared: `server/uploadToCatbox.ts`  
- Optional fallback: `VITE_IMGBB_API_KEY`
