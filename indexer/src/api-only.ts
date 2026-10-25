import { createRequire } from 'node:module'
try {
  createRequire(import.meta.url)('dotenv').config()
} catch {
  // optional
}

// Load config dependent modules only after dotenv has populated process.env.
const [{ ensureSchema }, { startApi }] = await Promise.all([
  import('./db.js'),
  import('./serve-local.js'),
])

await ensureSchema()
startApi()
