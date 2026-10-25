import { handle } from 'hono/vercel'
import { createApp } from '../src/api.js'

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
}

const app = createApp({ basePath: '/api' })

export default handle(app)
