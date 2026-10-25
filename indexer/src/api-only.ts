import { ensureSchema } from './db.js'
import { startApi } from './serve-local.js'

await ensureSchema()
startApi()
