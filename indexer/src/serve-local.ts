import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { API_PORT, FACTORY_ADDRESS } from './config.js'
import { createApp } from './api.js'

export function startApi(port = API_PORT) {
  const app = new Hono()
  // Keep the same /api-prefixed URLs used by the frontend's VITE_INDEXER_URL,
  // while retaining unprefixed routes for direct health checks and local tools.
  app.route('/', createApp())
  app.route('/api', createApp())
  console.log(`[indexer-api] listening on port ${port} (factory ${FACTORY_ADDRESS ?? 'unset'})`)
  serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
  return app
}
