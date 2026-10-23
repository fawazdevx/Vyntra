import { POLL_MS } from './config.js'
import { runLoop, syncOnce } from './sync.js'

const once = process.argv.includes('--once')

if (once) {
  syncOnce()
    .then((r) => {
      console.log('[indexer] once', r)
      process.exit(0)
    })
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
} else {
  runLoop(POLL_MS)
}
