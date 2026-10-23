import { API_PORT, POLL_MS } from './config.js'
import { startApi } from './api.js'
import { runLoop } from './sync.js'

/** Run HTTP API + background sync loop in one process. */
startApi(API_PORT)
runLoop(POLL_MS).catch((e) => {
  console.error('[indexer] fatal', e)
  process.exit(1)
})
