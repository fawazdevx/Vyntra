import type { Address } from 'viem'
import type { LaunchView } from './config'
import type { TradePoint } from '../hooks/useTradeHistory'

const BASE = (import.meta.env.VITE_INDEXER_URL as string | undefined)?.replace(/\/$/, '') || ''

export const isIndexerConfigured = Boolean(BASE)

async function getJson<T>(path: string): Promise<T | null> {
  if (!BASE) return null
  try {
    const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

type IndexerLaunch = {
  id: number
  token: string
  curve: string
  splitter: string
  creator: string
  name: string
  symbol: string
  imageURI: string
  description: string
  createdAt: number
  progressBps: number
  raisedBot: number
  graduated: boolean
  migrated: boolean
  externalPair: string
  buyTaxBps: number
  sellTaxBps: number
  tradeCount?: number
  volumeBot?: number
}

function toLaunchView(l: IndexerLaunch): LaunchView {
  return {
    id: l.id,
    token: l.token as Address,
    curve: l.curve as Address,
    splitter: l.splitter as Address,
    creator: l.creator as Address,
    name: l.name,
    symbol: l.symbol,
    imageURI: l.imageURI || '',
    description: l.description || '',
    createdAt: l.createdAt,
    progressBps: l.progressBps,
    raisedBot: l.raisedBot,
    graduated: l.graduated,
    migrated: l.migrated,
    externalPair: (l.externalPair || '0x0000000000000000000000000000000000000000') as Address,
    creatorFees: 0n,
    buyTaxBps: l.buyTaxBps,
    sellTaxBps: l.sellTaxBps,
  }
}

export async function indexerHealth(): Promise<{ ok: boolean; ready: boolean } | null> {
  return getJson('/health')
}

export async function fetchLaunchesFromIndexer(): Promise<LaunchView[] | null> {
  const data = await getJson<{ launches: IndexerLaunch[] }>('/v1/launches?sort=trending&limit=500')
  if (!data?.launches) return null
  return data.launches.map(toLaunchView)
}

export async function fetchLaunchFromIndexer(id: number): Promise<LaunchView | null> {
  const data = await getJson<{ launch: IndexerLaunch }>(`/v1/launches/${id}`)
  if (!data?.launch) return null
  return toLaunchView(data.launch)
}

export async function fetchTradesFromIndexer(launchId: number): Promise<TradePoint[] | null> {
  const data = await getJson<{
    trades: Array<{
      time: number
      price: number
      mcap: number
      amountBot: number
      amountToken: number
      side: 'buy' | 'sell'
      trader: string
      txHash: string
    }>
  }>(`/v1/launches/${launchId}/trades?limit=5000`)
  if (!data?.trades) return null
  return data.trades.map((t) => ({
    time: t.time,
    price: t.price,
    mcap: t.mcap,
    amountBot: t.amountBot,
    amountToken: t.amountToken,
    side: t.side,
    trader: t.trader as Address,
    txHash: t.txHash as `0x${string}`,
  }))
}

export async function fetchOhlcvFromIndexer(
  launchId: number,
  intervalSec = 300,
): Promise<
  | {
      interval: number
      candles: Array<{
        time: number
        open: number
        high: number
        low: number
        close: number
        volume: number
        trades: number
      }>
    }
  | null
> {
  return getJson(`/v1/launches/${launchId}/ohlcv?interval=${intervalSec}&limit=500`)
}

export async function fetchStatsFromIndexer(): Promise<{
  launches: number
  onCurve: number
  graduated: number
  raisedBot: number
  volumeBot: number
  trades: number
} | null> {
  return getJson('/v1/stats')
}

export type BotUsdPrice = {
  priceUsd: number
  source: 'geckoterminal'
  referenceToken: 'WBOT'
  referenceChainId: 677
  updatedAt: number
}

export async function fetchBotUsdPriceFromIndexer(): Promise<BotUsdPrice | null> {
  const data = await getJson<BotUsdPrice>('/v1/bot-usd')
  if (!data || !Number.isFinite(data.priceUsd) || data.priceUsd <= 0) return null
  return data
}

export type HoldersPayload = {
  launchId: number
  source: string
  note?: string
  holders: Array<{
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
  }>
  summary: {
    holderCount: number
    circulating: number
    top1Pct: number
    top5Pct: number
    top10Pct: number
    top20Pct: number
    clusters: {
      whale: { count: number; balance: number; pct: number }
      dolphin: { count: number; balance: number; pct: number }
      shrimp: { count: number; balance: number; pct: number }
    }
  }
}

export type SnipersPayload = {
  launchId: number
  source: string
  note?: string
  window: { uniqueBuyers: number; earlySeconds: number }
  snipers: Array<{
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
  }>
  summary: {
    sniperCount: number
    stillHolding: number
    fullyDumped: number
    totalSpentBot: number
    totalHeldToken: number
    heldPctOfCirculating: number
    avgDumpBps: number
  }
}

export async function fetchHoldersFromIndexer(
  launchId: number,
  limit = 50,
): Promise<HoldersPayload | null> {
  return getJson(`/v1/launches/${launchId}/holders?limit=${limit}`)
}

export async function fetchSnipersFromIndexer(
  launchId: number,
  limit = 20,
  earlySeconds = 0,
): Promise<SnipersPayload | null> {
  const qs = new URLSearchParams({ limit: String(limit) })
  if (earlySeconds > 0) qs.set('earlySeconds', String(earlySeconds))
  return getJson(`/v1/launches/${launchId}/snipers?${qs}`)
}

export type PortfolioPayload = {
  address: string
  source?: string
  note?: string
  positions: Array<{
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
  }>
  summary: {
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
}

export type WalletTradesPayload = {
  address: string
  trades: Array<{
    launchId: number | null
    market: 'launch' | 'platform'
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
  }>
}

export async function fetchPortfolioFromIndexer(
  address: string,
): Promise<PortfolioPayload | null> {
  return getJson(`/v1/wallets/${address}/portfolio`)
}

export async function fetchWalletTradesFromIndexer(
  address: string,
  limit = 100,
): Promise<WalletTradesPayload | null> {
  return getJson(`/v1/wallets/${address}/trades?limit=${limit}`)
}
