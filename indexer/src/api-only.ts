import { ensureSchema } from './db.js'
import { startApi } from './api.js'

await ensureSchema()
startApi()
