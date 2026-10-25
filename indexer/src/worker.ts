import { createRequire } from 'node:module'
try {
  createRequire(import.meta.url)('dotenv').config()
} catch {
  // optional
}

// Load config dependent modules only after dotenv has populated process.env.
const [{ POLL_MS }, { ensureSchema }, { runLoop, syncOnce }] = await Promise.all([
  import('./config.js'),
  import('./db.js'),
  import('./sync.js'),
])

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
