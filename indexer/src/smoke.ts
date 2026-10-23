import { createApp } from './api.js'
import { getDb } from './db.js'

async function main() {
  const db = getDb()
  // Seed a tiny launch + trades so holders/snipers smoke without a live factory.
  db.prepare(
    `INSERT OR REPLACE INTO launches (
      id, token, curve, splitter, creator, name, symbol, image_uri, description,
      created_at, created_block, graduated, migrated, external_pair, progress_bps,
      raised_bot, buy_tax_bps, sell_tax_bps, trade_count, volume_bot, updated_at
    ) VALUES (9001, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      '0xcccccccccccccccccccccccccccccccccccccccc',
      '0xdddddddddddddddddddddddddddddddddddddddd',
      'Smoke', 'SMK', '', '', 1700000000, 1, 0, 0, '', 1000, 1, 0, 0, 3, 1.5, 1700000100)`,
  ).run()

  db.prepare('DELETE FROM trades WHERE launch_id = 9001').run()
  const ins = db.prepare(
    `INSERT INTO trades (
      launch_id, curve, side, trader, bot_amount, token_amount, fee, price, mcap,
      block_number, tx_hash, log_index, timestamp
    ) VALUES (?, '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
  )
  ins.run(
    9001,
    'buy',
    '0x1111111111111111111111111111111111111111',
    1,
    1000000,
    0.000001,
    1000,
    10,
    '0xsmoke1',
    0,
    1700000001,
  )
  ins.run(
    9001,
    'buy',
    '0x2222222222222222222222222222222222222222',
    0.5,
    400000,
    0.00000125,
    1250,
    11,
    '0xsmoke2',
    0,
    1700000005,
  )
  ins.run(
    9001,
    'sell',
    '0x1111111111111111111111111111111111111111',
    0.2,
    200000,
    0.000001,
    1000,
    12,
    '0xsmoke3',
    0,
    1700000010,
  )

  const app = createApp()
  const health = await app.request('/health')
  const stats = await app.request('/v1/stats')
  const launches = await app.request('/v1/launches')
  const holders = await app.request('/v1/launches/9001/holders')
  const snipers = await app.request('/v1/launches/9001/snipers?limit=10')
  const portfolio = await app.request(
    '/v1/wallets/0x1111111111111111111111111111111111111111/portfolio',
  )
  const walletTrades = await app.request(
    '/v1/wallets/0x1111111111111111111111111111111111111111/trades?limit=10',
  )
  const holdersJson = await holders.json()
  const snipersJson = await snipers.json()
  const portfolioJson = await portfolio.json()
  const walletTradesJson = await walletTrades.json()

  console.log('health', await health.json())
  console.log('stats', await stats.json())
  console.log('launches', (await launches.json()).launches?.length)
  console.log('holders', holdersJson.summary)
  console.log('snipers', snipersJson.summary)
  console.log('portfolio', portfolioJson.summary)
  console.log('walletTrades', walletTradesJson.trades?.length)
  if (!holders.ok || !snipers.ok) throw new Error('analytics endpoints failed')
  if (!portfolio.ok || !walletTrades.ok) throw new Error('portfolio endpoints failed')
  if ((holdersJson.summary?.holderCount ?? 0) < 1) throw new Error('expected holders')
  if ((snipersJson.summary?.sniperCount ?? 0) < 1) throw new Error('expected snipers')
  if ((portfolioJson.summary?.positionCount ?? 0) < 1) throw new Error('expected portfolio')
  if ((walletTradesJson.trades?.length ?? 0) < 1) throw new Error('expected wallet trades')
  console.log('smoke ok')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
