import { POLL_MS } from './config.js'
import { ensureSchema } from './db.js'
import { runLoop, syncOnce } from './sync.js'

const once = process.argv.includes('--once')
await ensureSchema()

if (once) {
  const r = await syncOnce()
  console.log(`[indexer] once ${r.from}→${r.to} launches+${r.launches} trades+${r.trades}`)
  process.exit(0)
}

runLoop(POLL_MS).catch((e) => {
  console.error('[indexer] fatal', e)
  process.exit(1)
})
