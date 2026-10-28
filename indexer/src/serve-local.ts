import { serve } from '@hono/node-server'
import { API_PORT, FACTORY_ADDRESS } from './config.js'
import { createApp } from './api.js'

export function startApi(port = API_PORT) {
  const app = createApp()
  console.log(`[indexer-api] http://127.0.0.1:${port} (factory ${FACTORY_ADDRESS ?? 'unset'})`)
  serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
  return app
}
