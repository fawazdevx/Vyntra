import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient, useWatchContractEvent } from 'wagmi'
import { formatEther, type Address, zeroAddress } from 'viem'
import { bondingCurveAbi, erc20Abi, spawnFactoryAbi } from '../lib/abis'
import { FACTORY_ADDRESS, isAppConfigured, isHiddenLaunchId, type LaunchView } from '../lib/config'
import {
  fetchLaunchFromIndexer,
  fetchLaunchesFromIndexer,
  isIndexerConfigured,
} from '../lib/indexer'

async function fetchLaunch(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  id: bigint,
): Promise<LaunchView> {
  const raw = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: spawnFactoryAbi,
    functionName: 'getLaunch',
    args: [id],
  })

  const launch = Array.isArray(raw)
    ? {
        token: raw[0] as Address,
        curve: raw[1] as Address,
        creator: raw[2] as Address,
        splitter: raw[3] as Address,
        name: raw[4] as string,
        symbol: raw[5] as string,
        createdAt: raw[6] as bigint,
      }
    : (raw as {
        token: Address
        curve: Address
        creator: Address
        splitter: Address
        name: string
        symbol: string
        createdAt: bigint
      })

  const [
    progressBps,
    graduated,
    realNativeReserves,
    creatorFees,
    buyTaxBps,
    sellTaxBps,
    migrated,
    externalPair,
    imageURI,
    description,
  ] = await Promise.all([
    publicClient.readContract({
      address: launch.curve,
      abi: bondingCurveAbi,
      functionName: 'getProgressBps',
    }),
    publicClient.readContract({
      address: launch.curve,
      abi: bondingCurveAbi,
      functionName: 'graduated',
    }),
    publicClient.readContract({
      address: launch.curve,
      abi: bondingCurveAbi,
      functionName: 'realNativeReserves',
    }),
    publicClient.readContract({
      address: launch.curve,
      abi: bondingCurveAbi,
      functionName: 'creatorFees',
    }),
    publicClient
      .readContract({
        address: launch.curve,
        abi: bondingCurveAbi,
        functionName: 'buyTaxBps',
      })
      .catch(() => 0n),
    publicClient
      .readContract({
        address: launch.curve,
        abi: bondingCurveAbi,
        functionName: 'sellTaxBps',
      })
      .catch(() => 0n),
    publicClient
      .readContract({
        address: launch.curve,
        abi: bondingCurveAbi,
        functionName: 'migrated',
      })
      .catch(() => false),
    publicClient
      .readContract({
        address: launch.curve,
        abi: bondingCurveAbi,
        functionName: 'externalPair',
      })
      .catch(() => zeroAddress),
    publicClient
      .readContract({
        address: launch.token,
        abi: erc20Abi,
        functionName: 'imageURI',
      })
      .catch(() => ''),
    publicClient
      .readContract({
        address: launch.token,
        abi: erc20Abi,
        functionName: 'description',
      })
      .catch(() => ''),
  ])

  return {
    id: Number(id),
    token: launch.token,
    curve: launch.curve,
    creator: launch.creator,
    splitter: launch.splitter || zeroAddress,
    name: launch.name,
    symbol: launch.symbol,
    imageURI: imageURI || '',
    description: description || '',
    createdAt: Number(launch.createdAt) * 1000,
    progressBps: Number(progressBps),
    raisedNative: Number(formatEther(realNativeReserves)),
    graduated: Boolean(graduated),
    migrated: Boolean(migrated),
    externalPair: (externalPair as Address) || zeroAddress,
    creatorFees,
    buyTaxBps: Number(buyTaxBps),
    sellTaxBps: Number(sellTaxBps),
  }
}

export function useLaunches() {
  const publicClient = usePublicClient()

  const query = useQuery({
    queryKey: [
      'vyntra',
      'launches',
      FACTORY_ADDRESS,
      publicClient?.chain?.id,
      isIndexerConfigured,
    ],
    enabled: (Boolean(publicClient) && isAppConfigured) || isIndexerConfigured,
    refetchInterval: 12_000,
    queryFn: async () => {
      // Indexer can lag (Hobby cron is daily). Always merge missing on-chain IDs from RPC
      // so Markets shows a brand-new spawn immediately after create/buy.
      const indexed =
        isIndexerConfigured ? await fetchLaunchesFromIndexer() : null
      const visibleIndexed = indexed?.filter((launch) => !isHiddenLaunchId(launch.id))

      if (!publicClient || !isAppConfigured) {
        return (visibleIndexed ?? []) as LaunchView[]
      }

      const count = await publicClient.readContract({
        address: FACTORY_ADDRESS,
        abi: spawnFactoryAbi,
        functionName: 'launchCount',
      })
      const n = Number(count)
      if (n === 0) return [] as LaunchView[]

      const byId = new Map<number, LaunchView>()
      for (const launch of visibleIndexed ?? []) byId.set(launch.id, launch)

      const missing = Array.from({ length: n }, (_, i) => i + 1).filter(
        (id) => !isHiddenLaunchId(id) && !byId.has(id),
      )
      if (missing.length > 0) {
        const fetched = await Promise.all(
          missing.map((id) => fetchLaunch(publicClient, BigInt(id))),
        )
        for (const launch of fetched) byId.set(launch.id, launch)
      }

      return Array.from(byId.values())
        .filter((launch) => !isHiddenLaunchId(launch.id))
        .sort((a, b) => b.createdAt - a.createdAt)
    },
  })

  useWatchContractEvent({
    address: FACTORY_ADDRESS,
    abi: spawnFactoryAbi,
    eventName: 'TokenSpawned',
    enabled: isAppConfigured,
    onLogs() {
      query.refetch()
    },
  })

  return query
}

export function useLaunch(id?: string | number) {
  const publicClient = usePublicClient()
  const numericId = id != null && id !== '' ? Number(id) : NaN

  return useQuery({
    queryKey: [
      'vyntra',
      'launch',
      FACTORY_ADDRESS,
      numericId,
      publicClient?.chain?.id,
      isIndexerConfigured,
    ],
    enabled:
      Number.isFinite(numericId) &&
      numericId > 0 &&
      !isHiddenLaunchId(numericId) &&
      ((Boolean(publicClient) && isAppConfigured) || isIndexerConfigured),
    refetchInterval: 8_000,
    queryFn: async () => {
      if (isIndexerConfigured) {
        const indexed = await fetchLaunchFromIndexer(numericId)
        if (indexed) return indexed
      }
      if (!publicClient) throw new Error('Wallet or network not ready')
      return fetchLaunch(publicClient, BigInt(numericId))
    },
  })
}

export function useCreatorLaunches(creator?: Address) {
  const { data: all = [], ...rest } = useLaunches()
  const mine = useMemo(() => {
    if (!creator) return [] as LaunchView[]
    return all.filter((l) => l.creator.toLowerCase() === creator.toLowerCase())
  }, [all, creator])
  return { ...rest, data: mine, all }
}
