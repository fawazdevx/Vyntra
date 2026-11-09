import type { Address } from 'viem'

export type TradePoint = {
  time: number
  price: number
  mcap: number
  amountNative: number
  amountToken: number
  side: 'buy' | 'sell'
  trader: Address
  txHash: `0x${string}`
  blockNumber?: number
  logIndex?: number
}

function tradeKey(trade: TradePoint) {
  return `${trade.txHash.toLowerCase()}:${trade.side}`
}

/** Prefer indexed records when present, and keep unindexed on-chain events visible. */
export function mergeTradePoints(indexed: TradePoint[], live: TradePoint[]): TradePoint[] {
  const merged = new Map<string, TradePoint>()
  for (const trade of indexed) merged.set(tradeKey(trade), trade)
  for (const trade of live) {
    const key = tradeKey(trade)
    if (!merged.has(key)) merged.set(key, trade)
  }

  const ordered = [...merged.values()].sort((a, b) => {
    if (a.blockNumber != null && b.blockNumber != null) {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber
      if (a.logIndex != null && b.logIndex != null && a.logIndex !== b.logIndex) {
        return a.logIndex - b.logIndex
      }
    }
    return a.time - b.time || a.txHash.localeCompare(b.txHash)
  })

  // The chart library requires strictly increasing timestamps for trades in one block.
  let lastTime = 0
  return ordered.map((trade) => {
    const time = trade.time <= lastTime ? lastTime + 1 : trade.time
    lastTime = time
    return time === trade.time ? trade : { ...trade, time }
  })
}
