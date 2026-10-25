import { createRequire } from 'node:module'
try {
  createRequire(import.meta.url)('dotenv').config()
} catch {
  // optional
}

// Load config dependent modules only after dotenv has populated process.env.
const [{ API_PORT, POLL_MS, FACTORY_ADDRESS }, { ensureSchema }, { startApi }, { runLoop }] =
  await Promise.all([
    import('./config.js'),
    import('./db.js'),
    import('./serve-local.js'),
    import('./sync.js'),
  ])

await ensureSchema()
startApi(API_PORT)

if (FACTORY_ADDRESS) {
  runLoop(POLL_MS).catch((e) => {
    console.error('[indexer] fatal', e)
    process.exit(1)
  })
} else {
  console.warn('[indexer] FACTORY_ADDRESS unset — API only (ready: false). Set it after deploy.')
}
