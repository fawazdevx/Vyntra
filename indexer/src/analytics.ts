import { getDb } from './db.js'

/** Fixed supply used for mcap elsewhere in the indexer. */
export const TOTAL_SUPPLY = 1_000_000_000

export type HolderRow = {
  address: string
  balance: number
  bought: number
  sold: number
  spentBot: number
  receivedBot: number
  tradeCount: number
  firstTradeAt: number
  lastTradeAt: number
  pct: number
  cluster: 'whale' | 'dolphin' | 'shrimp'
}

export type ClusterBucket = {
  count: number
  balance: number
  pct: number
}

export type HoldersSummary = {
  holderCount: number
  circulating: number
  top1Pct: number
  top5Pct: number
  top10Pct: number
  top20Pct: number
  clusters: {
    whale: ClusterBucket
    dolphin: ClusterBucket
    shrimp: ClusterBucket
  }
}

export type SniperRow = {
  address: string
  rank: number
  firstBuyAt: number
  firstBuyBlock: number
  boughtToken: number
  soldToken: number
  heldToken: number
  spentBot: number
  receivedBot: number
  dumpBps: number
  stillHolding: boolean
  pctOfCirculating: number
}

function emptyCluster(): ClusterBucket {
  return { count: 0, balance: 0, pct: 0 }
}

function classify(pctOfCirc: number): HolderRow['cluster'] {
  if (pctOfCirc >= 1) return 'whale'
  if (pctOfCirc >= 0.1) return 'dolphin'
  return 'shrimp'
}

function concentration(balances: number[], circ: number, n: number): number {
  if (circ <= 0) return 0
  const sum = balances.slice(0, n).reduce((a, b) => a + b, 0)
  return (sum / circ) * 100
}

/** Net curve positions from Buy/Sell events (pre-migration approximation). */
export function getHolders(
  launchId: number,
  limit = 100,
): { holders: HolderRow[]; summary: HoldersSummary } {
  const rows = getDb()
    .prepare(
      `SELECT
         trader AS address,
         SUM(CASE WHEN side = 'buy' THEN token_amount ELSE 0 END) AS bought,
         SUM(CASE WHEN side = 'sell' THEN token_amount ELSE 0 END) AS sold,
         SUM(CASE WHEN side = 'buy' THEN bot_amount ELSE 0 END) AS spent_bot,
         SUM(CASE WHEN side = 'sell' THEN bot_amount ELSE 0 END) AS received_bot,
         COUNT(*) AS trade_count,
         MIN(timestamp) AS first_trade_at,
         MAX(timestamp) AS last_trade_at
       FROM trades
       WHERE launch_id = ?
       GROUP BY trader`,
    )
    .all(launchId) as Array<{
    address: string
    bought: number
    sold: number
    spent_bot: number
    received_bot: number
    trade_count: number
    first_trade_at: number
    last_trade_at: number
  }>

  const nets = rows
    .map((r) => ({
      address: r.address,
      bought: r.bought || 0,
      sold: r.sold || 0,
      balance: Math.max((r.bought || 0) - (r.sold || 0), 0),
      spentBot: r.spent_bot || 0,
      receivedBot: r.received_bot || 0,
      tradeCount: r.trade_count || 0,
      firstTradeAt: r.first_trade_at || 0,
      lastTradeAt: r.last_trade_at || 0,
    }))
    .filter((r) => r.balance > 1e-12)
    .sort((a, b) => b.balance - a.balance)

  const circulating = nets.reduce((a, b) => a + b.balance, 0)
  const balances = nets.map((n) => n.balance)

  const clusters = {
    whale: emptyCluster(),
    dolphin: emptyCluster(),
    shrimp: emptyCluster(),
  }

  const holders: HolderRow[] = nets.map((n) => {
    const pct = circulating > 0 ? (n.balance / circulating) * 100 : 0
    const cluster = classify(pct)
    clusters[cluster].count += 1
    clusters[cluster].balance += n.balance
    return {
      address: n.address,
      balance: n.balance,
      bought: n.bought,
      sold: n.sold,
      spentBot: n.spentBot,
      receivedBot: n.receivedBot,
      tradeCount: n.tradeCount,
      firstTradeAt: n.firstTradeAt,
      lastTradeAt: n.lastTradeAt,
      pct,
      cluster,
    }
  })

  for (const key of Object.keys(clusters) as Array<keyof typeof clusters>) {
    clusters[key].pct = circulating > 0 ? (clusters[key].balance / circulating) * 100 : 0
  }

  const summary: HoldersSummary = {
    holderCount: holders.length,
    circulating,
    top1Pct: concentration(balances, circulating, 1),
    top5Pct: concentration(balances, circulating, 5),
    top10Pct: concentration(balances, circulating, 10),
    top20Pct: concentration(balances, circulating, 20),
    clusters,
  }

  return { holders: holders.slice(0, Math.min(Math.max(limit, 1), 500)), summary }
}

/**
 * First N unique buyers by (block, log). Dump rate from later sells.
 * `earlySeconds` optionally restricts to buys within that window of the first buy.
 */
export function getSnipers(
  launchId: number,
  opts: { limit?: number; earlySeconds?: number } = {},
): {
  snipers: SniperRow[]
  summary: Record<string, number>
  window: Record<string, number>
} {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100)
  const earlySeconds = opts.earlySeconds && opts.earlySeconds > 0 ? opts.earlySeconds : 0

  const firstBuys = getDb()
    .prepare(
      `SELECT trader, timestamp, block_number, token_amount, bot_amount, tx_hash, log_index
       FROM trades
       WHERE launch_id = ? AND side = 'buy'
       ORDER BY block_number ASC, log_index ASC, id ASC`,
    )
    .all(launchId) as Array<{
    trader: string
    timestamp: number
    block_number: number
    token_amount: number
    bot_amount: number
  }>

  if (firstBuys.length === 0) {
    return {
      snipers: [],
      summary: {
        sniperCount: 0,
        stillHolding: 0,
        fullyDumped: 0,
        totalSpentBot: 0,
        totalHeldToken: 0,
        heldPctOfCirculating: 0,
        avgDumpBps: 0,
      },
      window: { uniqueBuyers: limit, earlySeconds },
    }
  }

  const t0 = firstBuys[0].timestamp
  const seen = new Set<string>()
  const sniperAddrs: string[] = []
  for (const row of firstBuys) {
    if (seen.has(row.trader.toLowerCase())) continue
    if (earlySeconds > 0 && row.timestamp - t0 > earlySeconds) break
    seen.add(row.trader.toLowerCase())
    sniperAddrs.push(row.trader)
    if (sniperAddrs.length >= limit) break
  }

  const { summary: holderSummary } = getHolders(launchId, 500)
  const circulating = holderSummary.circulating

  const snipers: SniperRow[] = []
  for (let i = 0; i < sniperAddrs.length; i++) {
    const address = sniperAddrs[i]
    const agg = getDb()
      .prepare(
        `SELECT
           SUM(CASE WHEN side = 'buy' THEN token_amount ELSE 0 END) AS bought,
           SUM(CASE WHEN side = 'sell' THEN token_amount ELSE 0 END) AS sold,
           SUM(CASE WHEN side = 'buy' THEN bot_amount ELSE 0 END) AS spent_bot,
           SUM(CASE WHEN side = 'sell' THEN bot_amount ELSE 0 END) AS received_bot,
           MIN(CASE WHEN side = 'buy' THEN timestamp END) AS first_buy_at,
           MIN(CASE WHEN side = 'buy' THEN block_number END) AS first_buy_block
         FROM trades
         WHERE launch_id = ? AND trader = ?`,
      )
      .get(launchId, address) as {
      bought: number
      sold: number
      spent_bot: number
      received_bot: number
      first_buy_at: number
      first_buy_block: number
    }

    const boughtToken = agg?.bought || 0
    const soldToken = agg?.sold || 0
    const heldToken = Math.max(boughtToken - soldToken, 0)
    const dumpBps =
      boughtToken > 0 ? Math.min(10_000, Math.round((soldToken / boughtToken) * 10_000)) : 0

    snipers.push({
      address,
      rank: i + 1,
      firstBuyAt: agg?.first_buy_at || 0,
      firstBuyBlock: agg?.first_buy_block || 0,
      boughtToken,
      soldToken,
      heldToken,
      spentBot: agg?.spent_bot || 0,
      receivedBot: agg?.received_bot || 0,
      dumpBps,
      stillHolding: heldToken > 1e-12,
      pctOfCirculating: circulating > 0 ? (heldToken / circulating) * 100 : 0,
    })
  }

  const totalSpentBot = snipers.reduce((a, s) => a + s.spentBot, 0)
  const totalHeldToken = snipers.reduce((a, s) => a + s.heldToken, 0)
  const stillHolding = snipers.filter((s) => s.stillHolding).length
  const fullyDumped = snipers.filter((s) => !s.stillHolding && s.boughtToken > 0).length
  const avgDumpBps =
    snipers.length > 0
      ? Math.round(snipers.reduce((a, s) => a + s.dumpBps, 0) / snipers.length)
      : 0

  return {
    snipers,
    summary: {
      sniperCount: snipers.length,
      stillHolding,
      fullyDumped,
      totalSpentBot,
      totalHeldToken,
      heldPctOfCirculating: circulating > 0 ? (totalHeldToken / circulating) * 100 : 0,
      avgDumpBps,
    },
    window: { uniqueBuyers: limit, earlySeconds },
  }
}
