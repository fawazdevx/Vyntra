import { useQuery } from '@tanstack/react-query'
import { usePublicClient, useWatchContractEvent } from 'wagmi'
import { formatEther, type Address } from 'viem'
import { bondingCurveAbi } from '../lib/abis'
import { fetchTradesFromIndexer, isIndexerConfigured } from '../lib/indexer'

export type TradePoint = {
  time: number
  price: number
  mcap: number
  amountBot: number
  amountToken: number
  side: 'buy' | 'sell'
  trader: Address
  txHash: `0x${string}`
}

const TOTAL_SUPPLY = 1_000_000_000

function priceFromBuy(botIn: bigint, tokensOut: bigint, fee: bigint) {
  if (tokensOut === 0n) return 0
  const net = botIn > fee ? botIn - fee : botIn
  return Number(formatEther(net)) / Number(formatEther(tokensOut))
}

function priceFromSell(botOut: bigint, tokensIn: bigint) {
  if (tokensIn === 0n) return 0
  return Number(formatEther(botOut)) / Number(formatEther(tokensIn))
}

async function fetchTrades(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  curve: Address,
): Promise<TradePoint[]> {
  const [buys, sells] = await Promise.all([
    publicClient.getContractEvents({
      address: curve,
      abi: bondingCurveAbi,
      eventName: 'Buy',
      fromBlock: 0n,
      toBlock: 'latest',
    }),
    publicClient.getContractEvents({
      address: curve,
      abi: bondingCurveAbi,
      eventName: 'Sell',
      fromBlock: 0n,
      toBlock: 'latest',
    }),
  ])

  const blockNums = [
    ...new Set(
      [...buys, ...sells]
        .map((e) => e.blockNumber)
        .filter((b): b is bigint => b != null),
    ),
  ]

  const timestamps = new Map<bigint, number>()
  await Promise.all(
    blockNums.map(async (bn) => {
      const block = await publicClient.getBlock({ blockNumber: bn })
      timestamps.set(bn, Number(block.timestamp))
    }),
  )

  const trades: TradePoint[] = []

  for (const e of buys) {
    const ts = e.blockNumber != null ? timestamps.get(e.blockNumber) : undefined
    if (!ts || !e.transactionHash || e.args.botIn == null || e.args.tokensOut == null) continue
    const price = priceFromBuy(e.args.botIn, e.args.tokensOut, e.args.fee ?? 0n)
    trades.push({
      time: ts,
      price,
      mcap: price * TOTAL_SUPPLY,
      amountBot: Number(formatEther(e.args.botIn)),
      amountToken: Number(formatEther(e.args.tokensOut)),
      side: 'buy',
      trader: e.args.buyer!,
      txHash: e.transactionHash,
    })
  }

  for (const e of sells) {
    const ts = e.blockNumber != null ? timestamps.get(e.blockNumber) : undefined
    if (!ts || !e.transactionHash || e.args.botOut == null || e.args.tokensIn == null) continue
    const price = priceFromSell(e.args.botOut, e.args.tokensIn)
    trades.push({
      time: ts,
      price,
      mcap: price * TOTAL_SUPPLY,
      amountBot: Number(formatEther(e.args.botOut)),
      amountToken: Number(formatEther(e.args.tokensIn)),
      side: 'sell',
      trader: e.args.seller!,
      txHash: e.transactionHash,
    })
  }

  trades.sort((a, b) => a.time - b.time)

  // lightweight-charts requires unique ascending timestamps
  const unique: TradePoint[] = []
  let last = 0
  for (const t of trades) {
    let time = t.time
    if (time <= last) time = last + 1
    unique.push({ ...t, time })
    last = time
  }
  return unique
}

export function useTradeHistory(curve?: Address, launchId?: number) {
  const publicClient = usePublicClient()

  const query = useQuery({
    queryKey: ['vyntra', 'trades', curve, launchId, publicClient?.chain?.id, isIndexerConfigured],
    enabled: Boolean((publicClient && curve) || (isIndexerConfigured && launchId)),
    refetchInterval: 10_000,
    queryFn: async () => {
      // Indexer returns [] for unindexed launches (truthy) — fall through to RPC so
      // charts still render buys made before the daily sync catches up.
      let indexed: TradePoint[] | null = null
      if (isIndexerConfigured && launchId && launchId > 0) {
        indexed = await fetchTradesFromIndexer(launchId)
        if (indexed && indexed.length > 0) return indexed
      }
      if (publicClient && curve) return fetchTrades(publicClient, curve)
      return indexed ?? ([] as TradePoint[])
    },
  })

  useWatchContractEvent({
    address: curve,
    abi: bondingCurveAbi,
    eventName: 'Buy',
    enabled: Boolean(curve),
    onLogs() {
      query.refetch()
    },
  })

  useWatchContractEvent({
    address: curve,
    abi: bondingCurveAbi,
    eventName: 'Sell',
    enabled: Boolean(curve),
    onLogs() {
      query.refetch()
    },
  })

  return query
}
