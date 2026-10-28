import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Select the existing local data path before config/db modules are imported. */
export function configureLocalDatabase(): void {
  if (
    process.env.VERCEL ||
    process.env.TURSO_DATABASE_URL ||
    process.env.LIBSQL_URL ||
    process.env.INDEXER_DATABASE_URL
  ) {
    return
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  const indexerRoot = path.basename(path.dirname(moduleDir)) === 'dist'
    ? path.resolve(moduleDir, '..', '..')
    : path.resolve(moduleDir, '..')

  const localDbPath = path.join(indexerRoot, 'data', 'vyntra.sqlite')
  process.env.INDEXER_DATABASE_URL = `file:${localDbPath}`
  console.info(`[indexer] local database=${localDbPath}`)
}
