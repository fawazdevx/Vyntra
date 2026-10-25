import { handle } from 'hono/vercel'
import { createApp } from '../../src/api.js'

export const config = { runtime: 'edge' }

// Mount at /api so /api/v1/... matches createApp basePath /api
const app = createApp({ basePath: '/api' })
export default handle(app)
