import { useQuery } from '@tanstack/react-query'
import { usePublicClient, useWatchContractEvent } from 'wagmi'
import { formatEther, type Address } from 'viem'
import { vyntraMarketAbi } from '../lib/abis'
import type { TradePoint } from './useTradeHistory'

const TOTAL_SUPPLY = 1_000_000_000

async function fetchPlatformTrades(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  market: Address,
): Promise<TradePoint[]> {
  const [buys, sells] = await Promise.all([
    publicClient.getContractEvents({
      address: market,
      abi: vyntraMarketAbi,
      eventName: 'BuyVyntra',
      fromBlock: 0n,
      toBlock: 'latest',
    }),
    publicClient.getContractEvents({
      address: market,
      abi: vyntraMarketAbi,
      eventName: 'SellVyntra',
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

/** Trade history for the seeded HYPE/VYNTRA market (chart + tape). */
export function usePlatformTrades(market?: Address) {
  const publicClient = usePublicClient()
  const enabled = Boolean(market && publicClient)

  const query = useQuery({
    queryKey: ['platform-trades', market],
    enabled,
    staleTime: 12_000,
    refetchInterval: 20_000,
    queryFn: () => fetchPlatformTrades(publicClient!, market!),
  })

  useWatchContractEvent({
    address: market,
    abi: vyntraMarketAbi,
    eventName: 'BuyVyntra',
    enabled,
    onLogs: () => {
      void query.refetch()
    },
  })

  useWatchContractEvent({
    address: market,
    abi: vyntraMarketAbi,
    eventName: 'SellVyntra',
    enabled,
    onLogs: () => {
      void query.refetch()
    },
  })

  return query
}
