import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { API_PORT, FACTORY_ADDRESS } from './config.js'
import { createApp } from './api.js'

// Prefer a real on-disk sqlite path for local dev when Turso is unset.
if (!process.env.TURSO_DATABASE_URL && !process.env.INDEXER_DATABASE_URL) {
  const root = path.dirname(fileURLToPath(import.meta.url))
  process.env.INDEXER_DATABASE_URL = `file:${path.join(root, '..', 'data', 'vyntra.sqlite')}`
}

export function startApi(port = API_PORT) {
  const app = createApp()
  console.log(`[indexer-api] http://127.0.0.1:${port} (factory ${FACTORY_ADDRESS ?? 'unset'})`)
  serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
  return app
}
