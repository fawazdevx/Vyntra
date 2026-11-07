import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  process.env.INDEXER_DATABASE_URL = `file:${join(
    mkdtempSync(join(tmpdir(), 'vyntra-smoke-')),
    'smoke.sqlite',
  )}`
  // dynamic import after env so db client picks up temp file URL
  const { ensureSchema, execute, queryAll } = await import('./db.js')
  const { createApp } = await import('./api.js')
  await ensureSchema()
  await execute(
    `INSERT OR REPLACE INTO launches (
      id, token, curve, splitter, creator, name, symbol, image_uri, description,
      created_at, created_block, graduated, migrated, external_pair, progress_bps,
      raised_native, buy_tax_bps, sell_tax_bps, trade_count, volume_native, updated_at
    ) VALUES (1, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      '0xcccccccccccccccccccccccccccccccccccccccc',
      '0xdddddddddddddddddddddddddddddddddddddddd',
      'Smoke', 'SMK', '', '', 1700000000, 1, 0, 0, '', 1000, 1, 0, 0, 0, 0, 1700000000)`,
  )
  console.log('[smoke] launches', await queryAll('SELECT id, name, symbol FROM launches'))
  const app = createApp()
  console.log('[smoke] health', await (await app.request('/health')).json())
  console.log('[smoke] ok')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
