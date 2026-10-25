import { API_PORT, POLL_MS, FACTORY_ADDRESS } from './config.js'
import { ensureSchema } from './db.js'
import { startApi } from './api.js'
import { runLoop } from './sync.js'

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
