import { useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePublicClient, useWatchContractEvent } from 'wagmi'
import { formatEther, type Address } from 'viem'
import { bondingCurveAbi } from '../lib/abis'
import { fetchTradesFromIndexer, isIndexerConfigured } from '../lib/indexer'
import { mergeTradePoints, type TradePoint } from '../lib/tradeHistory'

export type { TradePoint } from '../lib/tradeHistory'

const TOTAL_SUPPLY = 1_000_000_000

function priceFromBuy(nativeIn: bigint, tokensOut: bigint, fee: bigint) {
  if (tokensOut === 0n) return 0
  const net = nativeIn > fee ? nativeIn - fee : nativeIn
  return Number(formatEther(net)) / Number(formatEther(tokensOut))
}

function priceFromSell(nativeOut: bigint, tokensIn: bigint) {
  if (tokensIn === 0n) return 0
  return Number(formatEther(nativeOut)) / Number(formatEther(tokensIn))
}

async function fetchTrades(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  curve: Address,
  fromBlock = 0n,
  toBlock: bigint | 'latest' = 'latest',
): Promise<TradePoint[]> {
  const [buys, sells] = await Promise.all([
    publicClient.getContractEvents({
      address: curve,
      abi: bondingCurveAbi,
      eventName: 'Buy',
      fromBlock,
      toBlock,
    }),
    publicClient.getContractEvents({
      address: curve,
      abi: bondingCurveAbi,
      eventName: 'Sell',
      fromBlock,
      toBlock,
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
    if (!ts || !e.transactionHash || e.args.nativeIn == null || e.args.tokensOut == null) continue
    const price = priceFromBuy(e.args.nativeIn, e.args.tokensOut, e.args.fee ?? 0n)
    trades.push({
      time: ts,
      price,
      mcap: price * TOTAL_SUPPLY,
      amountNative: Number(formatEther(e.args.nativeIn)),
      amountToken: Number(formatEther(e.args.tokensOut)),
      side: 'buy',
      trader: e.args.buyer!,
      txHash: e.transactionHash,
      blockNumber: e.blockNumber == null ? undefined : Number(e.blockNumber),
      logIndex: e.logIndex == null ? undefined : Number(e.logIndex),
    })
  }

  for (const e of sells) {
    const ts = e.blockNumber != null ? timestamps.get(e.blockNumber) : undefined
    if (!ts || !e.transactionHash || e.args.nativeOut == null || e.args.tokensIn == null) continue
    const price = priceFromSell(e.args.nativeOut, e.args.tokensIn)
    trades.push({
      time: ts,
      price,
      mcap: price * TOTAL_SUPPLY,
      amountNative: Number(formatEther(e.args.nativeOut)),
      amountToken: Number(formatEther(e.args.tokensIn)),
      side: 'sell',
      trader: e.args.seller!,
      txHash: e.transactionHash,
      blockNumber: e.blockNumber == null ? undefined : Number(e.blockNumber),
      logIndex: e.logIndex == null ? undefined : Number(e.logIndex),
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
  const queryClient = useQueryClient()
  const liveTradesRef = useRef<{ scope: string; trades: TradePoint[] }>({ scope: '', trades: [] })
  const tradeScope = `${publicClient?.chain?.id ?? ''}:${curve?.toLowerCase() ?? ''}:${launchId ?? ''}`
  const getLiveTrades = () => liveTradesRef.current.scope === tradeScope ? liveTradesRef.current.trades : []
  const queryKey = ['vyntra', 'trades', curve, launchId, publicClient?.chain?.id, isIndexerConfigured] as const

  const query = useQuery({
    queryKey,
    enabled: Boolean((publicClient && curve) || (isIndexerConfigured && launchId)),
    refetchInterval: 10_000,
    queryFn: async () => {
      // An empty indexer response falls through to RPC while the launch is still syncing.
      let indexed: TradePoint[] | null = null
      if (isIndexerConfigured && launchId && launchId > 0) {
        indexed = await fetchTradesFromIndexer(launchId)
        if (indexed && indexed.length > 0) {
          if (!publicClient || !curve) return mergeTradePoints(indexed, getLiveTrades())
          try {
            const latest = await publicClient.getBlockNumber()
            const recentFromBlock = latest > 128n ? latest - 128n : 0n
            const recent = await fetchTrades(publicClient, curve, recentFromBlock, latest)
            return mergeTradePoints(indexed, [...recent, ...getLiveTrades()])
          } catch {
            return mergeTradePoints(indexed, getLiveTrades())
          }
        }
      }
      if (publicClient && curve) {
        const onChain = await fetchTrades(publicClient, curve)
        return mergeTradePoints(onChain, getLiveTrades())
      }
      return mergeTradePoints(indexed ?? [], getLiveTrades())
    },
  })

  async function addLiveTrades(trades: TradePoint[]) {
    if (trades.length === 0) return
    const nextLiveTrades = mergeTradePoints([], [...getLiveTrades(), ...trades]).slice(-500)
    liveTradesRef.current = { scope: tradeScope, trades: nextLiveTrades }
    queryClient.setQueryData<TradePoint[]>(queryKey, (current) =>
      mergeTradePoints(current ?? [], nextLiveTrades),
    )
    await query.refetch()
  }

  useWatchContractEvent({
    address: curve,
    abi: bondingCurveAbi,
    eventName: 'Buy',
    enabled: Boolean(curve),
    onLogs(logs) {
      if (!publicClient) return
      void Promise.all(logs.map(async (log) => {
        if (
          log.blockNumber == null || !log.transactionHash || log.args.buyer == null ||
          log.args.nativeIn == null || log.args.tokensOut == null
        ) return null
        const block = await publicClient.getBlock({ blockNumber: log.blockNumber })
        const price = priceFromBuy(log.args.nativeIn, log.args.tokensOut, log.args.fee ?? 0n)
        return {
          time: Number(block.timestamp),
          price,
          mcap: price * TOTAL_SUPPLY,
          amountNative: Number(formatEther(log.args.nativeIn)),
          amountToken: Number(formatEther(log.args.tokensOut)),
          side: 'buy' as const,
          trader: log.args.buyer,
          txHash: log.transactionHash,
          blockNumber: Number(log.blockNumber),
          logIndex: log.logIndex == null ? undefined : Number(log.logIndex),
        }
      })).then((rows) => addLiveTrades(rows.filter((row): row is TradePoint => row != null)))
        .catch(() => undefined)
    },
  })

  useWatchContractEvent({
    address: curve,
    abi: bondingCurveAbi,
    eventName: 'Sell',
    enabled: Boolean(curve),
    onLogs(logs) {
      if (!publicClient) return
      void Promise.all(logs.map(async (log) => {
        if (
          log.blockNumber == null || !log.transactionHash || log.args.seller == null ||
          log.args.nativeOut == null || log.args.tokensIn == null
        ) return null
        const block = await publicClient.getBlock({ blockNumber: log.blockNumber })
        const price = priceFromSell(log.args.nativeOut, log.args.tokensIn)
        return {
          time: Number(block.timestamp),
          price,
          mcap: price * TOTAL_SUPPLY,
          amountNative: Number(formatEther(log.args.nativeOut)),
          amountToken: Number(formatEther(log.args.tokensIn)),
          side: 'sell' as const,
          trader: log.args.seller,
          txHash: log.transactionHash,
          blockNumber: Number(log.blockNumber),
          logIndex: log.logIndex == null ? undefined : Number(log.logIndex),
        }
      })).then((rows) => addLiveTrades(rows.filter((row): row is TradePoint => row != null)))
        .catch(() => undefined)
    },
  })

  return query
}
