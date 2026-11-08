import { queryAll } from './db.js'
import {
  VYNTRA_MARKET_ADDRESS,
  VYNTRA_MARKET_START_BLOCK,
  VYNTRA_TOKEN_ADDRESS,
} from './config.js'

export type PortfolioPosition = {
  launchId: number | null
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
  spentNative: number
  receivedNative: number
  tradeCount: number
  firstTradeAt: number
  lastTradeAt: number
  avgCostNative: number
  lastPrice: number
  realizedPnlNative: number
  unrealizedPnlNative: number
  totalPnlNative: number
}

export type PortfolioTrade = {
  launchId: number | null
  market: 'launch' | 'platform'
  symbol: string
  name: string
  side: 'buy' | 'sell'
  nativeAmount: number
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
  spentNative: number
  receivedNative: number
  heldValueNative: number
  realizedPnlNative: number
  unrealizedPnlNative: number
  totalPnlNative: number
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
export async function getPortfolio(address: string): Promise<{
  address: string
  positions: PortfolioPosition[]
  summary: PortfolioSummary
}> {
  const wallet = normalizeAddr(address)
  if (!isAddress(wallet)) {
    return {
      address: wallet,
      positions: [],
      summary: {
        positionCount: 0,
        openCount: 0,
        tradeCount: 0,
        spentNative: 0,
        receivedNative: 0,
        heldValueNative: 0,
        realizedPnlNative: 0,
        unrealizedPnlNative: 0,
        totalPnlNative: 0,
      },
    }
  }

  const [launchTrades, platformTrades] = await Promise.all([
    queryAll<{
      launch_id: number
      side: 'buy' | 'sell'
      native_amount: number
      token_amount: number
      price: number
      timestamp: number
      block_number: number
      log_index: number
      token: string
      curve: string
      name: string
      symbol: string
      image_uri: string
      creator: string
      graduated: number
      migrated: number
    }>(
      `SELECT t.launch_id, t.side, t.native_amount, t.token_amount, t.price, t.timestamp,
              t.block_number, t.log_index,
              l.token, l.curve, l.name, l.symbol, l.image_uri, l.creator, l.graduated, l.migrated
       FROM trades t
       JOIN launches l ON l.id = t.launch_id
       WHERE LOWER(t.trader) = ?
       ORDER BY t.timestamp ASC, t.block_number ASC, t.log_index ASC`,
      [wallet],
    ),
    queryAll<{
      side: 'buy' | 'sell'
      native_amount: number
      token_amount: number
      price: number
      timestamp: number
      block_number: number
      log_index: number
    }>(
      `SELECT side, native_amount, token_amount, price, timestamp, block_number, log_index
       FROM platform_trades
       WHERE LOWER(trader) = ? AND block_number >= ?
       ORDER BY timestamp ASC, block_number ASC, log_index ASC`,
      [wallet, Number(VYNTRA_MARKET_START_BLOCK)],
    ),
  ])

  const trades = [
    ...launchTrades,
    ...platformTrades.map((t) => ({
      ...t,
      launch_id: null,
      token: VYNTRA_TOKEN_ADDRESS ?? '',
      curve: VYNTRA_MARKET_ADDRESS ?? '',
      name: 'Vyntra',
      symbol: 'VYNTRA',
      image_uri: '',
      creator: '',
      graduated: 0,
      migrated: 0,
    })),
  ].sort(
    (a, b) =>
      a.timestamp - b.timestamp ||
      a.block_number - b.block_number ||
      a.log_index - b.log_index,
  )

  type Acc = {
    launchId: number | null
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
    spentNative: number
    receivedNative: number
    tradeCount: number
    firstTradeAt: number
    lastTradeAt: number
    costBasisNative: number
    realizedPnlNative: number
    inventory: number
  }

  const byPosition = new Map<string, Acc>()

  for (const t of trades) {
    const key = t.launch_id === null ? 'platform' : `launch:${t.launch_id}`
    let acc = byPosition.get(key)
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
        spentNative: 0,
        receivedNative: 0,
        tradeCount: 0,
        firstTradeAt: t.timestamp,
        lastTradeAt: t.timestamp,
        costBasisNative: 0,
        realizedPnlNative: 0,
        inventory: 0,
      }
      byPosition.set(key, acc)
    }

    acc.tradeCount += 1
    acc.lastTradeAt = t.timestamp
    if (t.timestamp < acc.firstTradeAt) acc.firstTradeAt = t.timestamp

    if (t.side === 'buy') {
      acc.boughtToken += t.token_amount
      acc.spentNative += t.native_amount
      acc.costBasisNative += t.native_amount
      acc.inventory += t.token_amount
    } else {
      const sellAmt = Math.min(t.token_amount, acc.inventory > 0 ? acc.inventory : t.token_amount)
      const avgCost = acc.inventory > 1e-18 ? acc.costBasisNative / acc.inventory : 0
      const costOut = avgCost * sellAmt
      acc.soldToken += t.token_amount
      acc.receivedNative += t.native_amount
      acc.realizedPnlNative += t.native_amount - costOut
      acc.costBasisNative = Math.max(acc.costBasisNative - costOut, 0)
      acc.inventory = Math.max(acc.inventory - sellAmt, 0)
      if (acc.inventory <= 1e-12) {
        acc.inventory = 0
        acc.costBasisNative = 0
      }
    }
  }

  const [lastPrices, platformPriceRows] = await Promise.all([
    queryAll<{ launch_id: number; price: number }>(
      `SELECT launch_id, price FROM trades t
       WHERE t.id IN (
         SELECT MAX(id) FROM trades GROUP BY launch_id
       )`,
    ),
    queryAll<{ price: number }>(
      `SELECT price FROM platform_trades
       WHERE block_number >= ?
       ORDER BY block_number DESC, log_index DESC
       LIMIT 1`,
      [Number(VYNTRA_MARKET_START_BLOCK)],
    ),
  ])
  const priceMap = new Map(lastPrices.map((r) => [r.launch_id, r.price]))
  const platformLastPrice = platformPriceRows[0]?.price

  const positions: PortfolioPosition[] = [...byPosition.values()]
    .map((acc) => {
      const heldToken = Math.max(acc.inventory, 0)
      const avgCostNative = heldToken > 1e-12 ? acc.costBasisNative / heldToken : 0
      const lastPrice = acc.launchId === null
        ? platformLastPrice ?? avgCostNative
        : priceMap.get(acc.launchId) ?? avgCostNative
      const unrealizedPnlNative = heldToken > 0 ? (lastPrice - avgCostNative) * heldToken : 0
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
        spentNative: scrub(acc.spentNative),
        receivedNative: scrub(acc.receivedNative),
        tradeCount: acc.tradeCount,
        firstTradeAt: acc.firstTradeAt,
        lastTradeAt: acc.lastTradeAt,
        avgCostNative: scrub(avgCostNative),
        lastPrice: scrub(lastPrice),
        realizedPnlNative: scrub(acc.realizedPnlNative),
        unrealizedPnlNative: scrub(unrealizedPnlNative),
        totalPnlNative: scrub(acc.realizedPnlNative + unrealizedPnlNative),
      }
    })
    .sort((a, b) => b.lastTradeAt - a.lastTradeAt)

  const summary: PortfolioSummary = {
    positionCount: positions.length,
    openCount: positions.filter((p) => p.heldToken > 1e-12).length,
    tradeCount: positions.reduce((a, p) => a + p.tradeCount, 0),
    spentNative: scrub(positions.reduce((a, p) => a + p.spentNative, 0)),
    receivedNative: scrub(positions.reduce((a, p) => a + p.receivedNative, 0)),
    heldValueNative: scrub(positions.reduce((a, p) => a + p.heldToken * p.lastPrice, 0)),
    realizedPnlNative: scrub(positions.reduce((a, p) => a + p.realizedPnlNative, 0)),
    unrealizedPnlNative: scrub(positions.reduce((a, p) => a + p.unrealizedPnlNative, 0)),
    totalPnlNative: scrub(positions.reduce((a, p) => a + p.totalPnlNative, 0)),
  }

  return { address: wallet, positions, summary }
}

export async function getWalletTrades(
  address: string,
  limit = 200,
): Promise<{ address: string; trades: PortfolioTrade[] }> {
  const wallet = normalizeAddr(address)
  if (!isAddress(wallet)) return { address: wallet, trades: [] }

  const lim = Math.min(Math.max(limit, 1), 2000)
  type WalletTradeRow = {
    launch_id: number | null
    side: 'buy' | 'sell'
    native_amount: number
    token_amount: number
    price: number
    mcap: number
    fee: number
    timestamp: number
    block_number: number
    tx_hash: string
    log_index: number
    trader: string
    symbol: string
    name: string
    market: 'launch' | 'platform'
  }

  const [launchRows, platformRows] = await Promise.all([
    queryAll<Omit<WalletTradeRow, 'market' | 'launch_id'> & { launch_id: number }>(
      `SELECT t.launch_id, t.side, t.native_amount, t.token_amount, t.price, t.mcap, t.fee,
              t.timestamp, t.block_number, t.tx_hash, t.log_index, t.trader, l.symbol, l.name
       FROM trades t
       JOIN launches l ON l.id = t.launch_id
       WHERE LOWER(t.trader) = ?
       ORDER BY t.timestamp DESC, t.id DESC
       LIMIT ?`,
      [wallet, lim],
    ),
    queryAll<Omit<WalletTradeRow, 'market' | 'launch_id' | 'symbol' | 'name'>>(
      `SELECT side, native_amount, token_amount, price, mcap, fee,
              timestamp, block_number, tx_hash, log_index, trader
       FROM platform_trades
       WHERE LOWER(trader) = ? AND block_number >= ?
       ORDER BY timestamp DESC, id DESC
       LIMIT ?`,
      [wallet, Number(VYNTRA_MARKET_START_BLOCK), lim],
    ),
  ])

  const rows: WalletTradeRow[] = [
    ...launchRows.map((row) => ({ ...row, market: 'launch' as const })),
    ...platformRows.map((row) => ({
      ...row,
      launch_id: null,
      symbol: 'VYNTRA',
      name: 'Vyntra',
      market: 'platform' as const,
    })),
  ]
    .sort(
      (a, b) =>
        b.timestamp - a.timestamp ||
        b.block_number - a.block_number ||
        b.log_index - a.log_index,
    )
    .slice(0, lim)

  return {
    address: wallet,
    trades: rows.map((r) => ({
      launchId: r.launch_id,
      market: r.market,
      symbol: r.symbol,
      name: r.name,
      side: r.side,
      nativeAmount: r.native_amount,
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
