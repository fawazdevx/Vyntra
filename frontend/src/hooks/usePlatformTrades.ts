import { useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePublicClient, useWatchContractEvent } from 'wagmi'
import { formatEther, type Address } from 'viem'
import { vyntraMarketAbi } from '../lib/abis'
import { fetchPlatformTradesFromIndexer, isIndexerConfigured } from '../lib/indexer'
import { mergeTradePoints, type TradePoint } from '../lib/tradeHistory'

const TOTAL_SUPPLY = 1_000_000_000

async function fetchPlatformTrades(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  market: Address,
  fromBlock = 0n,
  toBlock: bigint | 'latest' = 'latest',
): Promise<TradePoint[]> {
  const [buys, sells] = await Promise.all([
    publicClient.getContractEvents({
      address: market,
      abi: vyntraMarketAbi,
      eventName: 'BuyVyntra',
      fromBlock,
      toBlock,
    }),
    publicClient.getContractEvents({
      address: market,
      abi: vyntraMarketAbi,
      eventName: 'SellVyntra',
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
    if (!ts || !e.transactionHash || e.args.nativeIn == null || e.args.vyntraOut == null) continue
    const native = Number(formatEther(e.args.nativeIn))
    const tok = Number(formatEther(e.args.vyntraOut))
    if (tok <= 0) continue
    const price = native / tok
    trades.push({
      time: ts,
      price,
      mcap: price * TOTAL_SUPPLY,
      amountNative: native,
      amountToken: tok,
      side: 'buy',
      trader: (e.args.buyer || '0x0000000000000000000000000000000000000000') as Address,
      txHash: e.transactionHash,
      blockNumber: e.blockNumber == null ? undefined : Number(e.blockNumber),
      logIndex: e.logIndex == null ? undefined : Number(e.logIndex),
    })
  }

  for (const e of sells) {
    const ts = e.blockNumber != null ? timestamps.get(e.blockNumber) : undefined
    if (!ts || !e.transactionHash || e.args.vyntraIn == null || e.args.nativeOut == null) continue
    const native = Number(formatEther(e.args.nativeOut))
    const tok = Number(formatEther(e.args.vyntraIn))
    if (tok <= 0) continue
    const price = native / tok
    trades.push({
      time: ts,
      price,
      mcap: price * TOTAL_SUPPLY,
      amountNative: native,
      amountToken: tok,
      side: 'sell',
      trader: (e.args.seller || '0x0000000000000000000000000000000000000000') as Address,
      txHash: e.transactionHash,
      blockNumber: e.blockNumber == null ? undefined : Number(e.blockNumber),
      logIndex: e.logIndex == null ? undefined : Number(e.logIndex),
    })
  }

  trades.sort((a, b) => a.time - b.time || a.txHash.localeCompare(b.txHash))
  // lightweight-charts needs unique ascending times
  let last = 0
  for (const t of trades) {
    if (t.time <= last) t.time = last + 1
    last = t.time
  }
  return trades
}

/** Trade history for the buyer-funded HYPE/VYNTRA market (chart + tape). */
export function usePlatformTrades(market?: Address) {
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  const liveTradesRef = useRef<{ scope: string; trades: TradePoint[] }>({ scope: '', trades: [] })
  const enabled = Boolean(market && publicClient)
  const tradeScope = `${publicClient?.chain?.id ?? ''}:${market?.toLowerCase() ?? ''}`
  const getLiveTrades = () => liveTradesRef.current.scope === tradeScope ? liveTradesRef.current.trades : []
  const queryKey = ['platform-trades', market] as const

  const query = useQuery({
    queryKey,
    enabled,
    staleTime: 12_000,
    refetchInterval: 10_000,
    queryFn: async () => {
      if (isIndexerConfigured) {
        const indexedTrades = await fetchPlatformTradesFromIndexer(market)
        if (indexedTrades !== null) {
          try {
            const latest = await publicClient!.getBlockNumber()
            const recentFromBlock = latest > 128n ? latest - 128n : 0n
            const recent = await fetchPlatformTrades(publicClient!, market!, recentFromBlock, latest)
            return mergeTradePoints(indexedTrades, [...recent, ...getLiveTrades()])
          } catch {
            return mergeTradePoints(indexedTrades, getLiveTrades())
          }
        }
      }
      const onChain = await fetchPlatformTrades(publicClient!, market!)
      return mergeTradePoints(onChain, getLiveTrades())
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
    address: market,
    abi: vyntraMarketAbi,
    eventName: 'BuyVyntra',
    enabled,
    onLogs: (logs) => {
      if (!publicClient) return
      void Promise.all(logs.map(async (log) => {
        if (
          log.blockNumber == null || !log.transactionHash || log.args.buyer == null ||
          log.args.nativeIn == null || log.args.vyntraOut == null
        ) return null
        const block = await publicClient.getBlock({ blockNumber: log.blockNumber })
        const native = Number(formatEther(log.args.nativeIn))
        const tokens = Number(formatEther(log.args.vyntraOut))
        if (tokens <= 0) return null
        const price = native / tokens
        return {
          time: Number(block.timestamp),
          price,
          mcap: price * TOTAL_SUPPLY,
          amountNative: native,
          amountToken: tokens,
          side: 'buy' as const,
          trader: log.args.buyer,
          txHash: log.transactionHash,
          blockNumber: Number(log.blockNumber),
          logIndex: log.logIndex == null ? undefined : Number(log.logIndex),
        }
      })).then((rows) => addLiveTrades(rows.filter((row): row is TradePoint => row != null)))
        .catch((error) => console.warn('[Vyntra] VYNTRA buy event could not be added:', error instanceof Error ? error.name : 'unknown error'))
    },
    onError(error) {
      console.warn('[Vyntra] VYNTRA buy event stream error:', error.name)
    },
  })

  useWatchContractEvent({
    address: market,
    abi: vyntraMarketAbi,
    eventName: 'SellVyntra',
    enabled,
    onLogs: (logs) => {
      if (!publicClient) return
      void Promise.all(logs.map(async (log) => {
        if (
          log.blockNumber == null || !log.transactionHash || log.args.seller == null ||
          log.args.vyntraIn == null || log.args.nativeOut == null
        ) return null
        const block = await publicClient.getBlock({ blockNumber: log.blockNumber })
        const native = Number(formatEther(log.args.nativeOut))
        const tokens = Number(formatEther(log.args.vyntraIn))
        if (tokens <= 0) return null
        const price = native / tokens
        return {
          time: Number(block.timestamp),
          price,
          mcap: price * TOTAL_SUPPLY,
          amountNative: native,
          amountToken: tokens,
          side: 'sell' as const,
          trader: log.args.seller,
          txHash: log.transactionHash,
          blockNumber: Number(log.blockNumber),
          logIndex: log.logIndex == null ? undefined : Number(log.logIndex),
        }
      })).then((rows) => addLiveTrades(rows.filter((row): row is TradePoint => row != null)))
        .catch((error) => console.warn('[Vyntra] VYNTRA sell event could not be added:', error instanceof Error ? error.name : 'unknown error'))
    },
    onError(error) {
      console.warn('[Vyntra] VYNTRA sell event stream error:', error.name)
    },
  })

  return query
}
