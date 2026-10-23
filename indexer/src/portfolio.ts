import { getDb } from './db.js'

export type PortfolioPosition = {
  launchId: number
  token: string
  curve: string
  name: string
  symbol: string
  imageURI: string
  creator: string
  graduated: boolean
  migrated: boolean
  boughtToken: number
  soldToken: number
  heldToken: number
  spentBot: number
  receivedBot: number
  tradeCount: number
  firstTradeAt: number
  lastTradeAt: number
  avgCostBot: number
  lastPrice: number
  realizedPnlBot: number
  unrealizedPnlBot: number
  totalPnlBot: number
}

export type PortfolioTrade = {
  launchId: number
  symbol: string
  name: string
  side: 'buy' | 'sell'
  botAmount: number
  tokenAmount: number
  price: number
  mcap: number
  fee: number
  timestamp: number
  blockNumber: number
  txHash: string
  trader: string
}

export type PortfolioSummary = {
  positionCount: number
  openCount: number
  tradeCount: number
  spentBot: number
  receivedBot: number
  heldValueBot: number
  realizedPnlBot: number
  unrealizedPnlBot: number
  totalPnlBot: number
}

function scrub(n: number) {
  if (!Number.isFinite(n)) return 0
  if (Math.abs(n) < 1e-12) return 0
  return Math.round(n * 1e12) / 1e12
}

function normalizeAddr(addr: string) {
  return addr.trim().toLowerCase()
}

function isAddress(addr: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim())
}

/** Average-cost realized PnL + mark-to-last-trade unrealized. */
export function getPortfolio(address: string): {
  address: string
  positions: PortfolioPosition[]
  summary: PortfolioSummary
} {
  const wallet = normalizeAddr(address)
  if (!isAddress(wallet)) {
    return {
      address: wallet,
      positions: [],
      summary: {
        positionCount: 0,
        openCount: 0,
        tradeCount: 0,
        spentBot: 0,
        receivedBot: 0,
        heldValueBot: 0,
        realizedPnlBot: 0,
        unrealizedPnlBot: 0,
        totalPnlBot: 0,
      },
    }
  }

  const trades = getDb()
    .prepare(
      `SELECT t.launch_id, t.side, t.bot_amount, t.token_amount, t.price, t.timestamp,
              l.token, l.curve, l.name, l.symbol, l.image_uri, l.creator, l.graduated, l.migrated
       FROM trades t
       JOIN launches l ON l.id = t.launch_id
       WHERE LOWER(t.trader) = ?
       ORDER BY t.timestamp ASC, t.id ASC`,
    )
    .all(wallet) as Array<{
    launch_id: number
    side: 'buy' | 'sell'
    bot_amount: number
    token_amount: number
    price: number
    timestamp: number
    token: string
    curve: string
    name: string
    symbol: string
    image_uri: string
    creator: string
    graduated: number
    migrated: number
  }>

  type Acc = {
    launchId: number
    token: string
    curve: string
    name: string
    symbol: string
    imageURI: string
    creator: string
    graduated: boolean
    migrated: boolean
    boughtToken: number
    soldToken: number
    spentBot: number
    receivedBot: number
    tradeCount: number
    firstTradeAt: number
    lastTradeAt: number
    costBasisBot: number
    realizedPnlBot: number
    inventory: number
  }

  const byLaunch = new Map<number, Acc>()

  for (const t of trades) {
    let acc = byLaunch.get(t.launch_id)
    if (!acc) {
      acc = {
        launchId: t.launch_id,
        token: t.token,
        curve: t.curve,
        name: t.name,
        symbol: t.symbol,
        imageURI: t.image_uri || '',
        creator: t.creator,
        graduated: Boolean(t.graduated),
        migrated: Boolean(t.migrated),
        boughtToken: 0,
        soldToken: 0,
        spentBot: 0,
        receivedBot: 0,
        tradeCount: 0,
        firstTradeAt: t.timestamp,
        lastTradeAt: t.timestamp,
        costBasisBot: 0,
        realizedPnlBot: 0,
        inventory: 0,
      }
      byLaunch.set(t.launch_id, acc)
    }

    acc.tradeCount += 1
    acc.lastTradeAt = t.timestamp
    if (t.timestamp < acc.firstTradeAt) acc.firstTradeAt = t.timestamp

    if (t.side === 'buy') {
      acc.boughtToken += t.token_amount
      acc.spentBot += t.bot_amount
      acc.costBasisBot += t.bot_amount
      acc.inventory += t.token_amount
    } else {
      const sellAmt = Math.min(t.token_amount, acc.inventory > 0 ? acc.inventory : t.token_amount)
      const avgCost = acc.inventory > 1e-18 ? acc.costBasisBot / acc.inventory : 0
      const costOut = avgCost * sellAmt
      acc.soldToken += t.token_amount
      acc.receivedBot += t.bot_amount
      acc.realizedPnlBot += t.bot_amount - costOut
      acc.costBasisBot = Math.max(acc.costBasisBot - costOut, 0)
      acc.inventory = Math.max(acc.inventory - sellAmt, 0)
      if (acc.inventory <= 1e-12) {
        acc.inventory = 0
        acc.costBasisBot = 0
      }
    }
  }

  const lastPrices = getDb()
    .prepare(
      `SELECT launch_id, price FROM trades t
       WHERE t.id IN (
         SELECT MAX(id) FROM trades GROUP BY launch_id
       )`,
    )
    .all() as Array<{ launch_id: number; price: number }>
  const priceMap = new Map(lastPrices.map((r) => [r.launch_id, r.price]))

  const positions: PortfolioPosition[] = [...byLaunch.values()]
    .map((acc) => {
      const heldToken = Math.max(acc.inventory, 0)
      const avgCostBot = heldToken > 1e-12 ? acc.costBasisBot / heldToken : 0
      const lastPrice = priceMap.get(acc.launchId) ?? avgCostBot
      const unrealizedPnlBot = heldToken > 0 ? (lastPrice - avgCostBot) * heldToken : 0
      return {
        launchId: acc.launchId,
        token: acc.token,
        curve: acc.curve,
        name: acc.name,
        symbol: acc.symbol,
        imageURI: acc.imageURI,
        creator: acc.creator,
        graduated: acc.graduated,
        migrated: acc.migrated,
        boughtToken: scrub(acc.boughtToken),
        soldToken: scrub(acc.soldToken),
        heldToken: scrub(heldToken),
        spentBot: scrub(acc.spentBot),
        receivedBot: scrub(acc.receivedBot),
        tradeCount: acc.tradeCount,
        firstTradeAt: acc.firstTradeAt,
        lastTradeAt: acc.lastTradeAt,
        avgCostBot: scrub(avgCostBot),
        lastPrice: scrub(lastPrice),
        realizedPnlBot: scrub(acc.realizedPnlBot),
        unrealizedPnlBot: scrub(unrealizedPnlBot),
        totalPnlBot: scrub(acc.realizedPnlBot + unrealizedPnlBot),
      }
    })
    .sort((a, b) => b.lastTradeAt - a.lastTradeAt)

  const summary: PortfolioSummary = {
    positionCount: positions.length,
    openCount: positions.filter((p) => p.heldToken > 1e-12).length,
    tradeCount: positions.reduce((a, p) => a + p.tradeCount, 0),
    spentBot: scrub(positions.reduce((a, p) => a + p.spentBot, 0)),
    receivedBot: scrub(positions.reduce((a, p) => a + p.receivedBot, 0)),
    heldValueBot: scrub(positions.reduce((a, p) => a + p.heldToken * p.lastPrice, 0)),
    realizedPnlBot: scrub(positions.reduce((a, p) => a + p.realizedPnlBot, 0)),
    unrealizedPnlBot: scrub(positions.reduce((a, p) => a + p.unrealizedPnlBot, 0)),
    totalPnlBot: scrub(positions.reduce((a, p) => a + p.totalPnlBot, 0)),
  }

  return { address: wallet, positions, summary }
}

export function getWalletTrades(
  address: string,
  limit = 200,
): { address: string; trades: PortfolioTrade[] } {
  const wallet = normalizeAddr(address)
  if (!isAddress(wallet)) return { address: wallet, trades: [] }

  const lim = Math.min(Math.max(limit, 1), 2000)
  const rows = getDb()
    .prepare(
      `SELECT t.launch_id, t.side, t.bot_amount, t.token_amount, t.price, t.mcap, t.fee,
              t.timestamp, t.block_number, t.tx_hash, t.trader, l.symbol, l.name
       FROM trades t
       JOIN launches l ON l.id = t.launch_id
       WHERE LOWER(t.trader) = ?
       ORDER BY t.timestamp DESC, t.id DESC
       LIMIT ?`,
    )
    .all(wallet, lim) as Array<{
    launch_id: number
    side: 'buy' | 'sell'
    bot_amount: number
    token_amount: number
    price: number
    mcap: number
    fee: number
    timestamp: number
    block_number: number
    tx_hash: string
    trader: string
    symbol: string
    name: string
  }>

  return {
    address: wallet,
    trades: rows.map((r) => ({
      launchId: r.launch_id,
      symbol: r.symbol,
      name: r.name,
      side: r.side,
      botAmount: r.bot_amount,
      tokenAmount: r.token_amount,
      price: r.price,
      mcap: r.mcap,
      fee: r.fee,
      timestamp: r.timestamp,
      blockNumber: r.block_number,
      txHash: r.tx_hash,
      trader: r.trader,
    })),
  }
}
