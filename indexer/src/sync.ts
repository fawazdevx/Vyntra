import { createPublicClient, formatEther, http, type Address } from 'viem'
import { boardAbi, curveAbi, erc20MetaAbi, factoryAbi, reserveVaultAbi, vyntraMarketAbi } from './abis.js'
import {
  BOARD_ADDRESS,
  CHAIN_ID,
  CONFIRMATIONS,
  INDEXER_CATCHUP_CHUNKS,
  LOG_CHUNK,
  RPC_URL,
  START_BLOCK,
  VYNTRA_MARKET_ADDRESS,
  VYNTRA_MARKET_CATCHUP_CHUNKS,
  VYNTRA_MARKET_START_BLOCK,
  VYNTRA_RESERVE_CATCHUP_CHUNKS,
  VYNTRA_RESERVE_START_BLOCK,
  VYNTRA_RESERVE_VAULT_ADDRESS,
  requireFactory,
} from './config.js'
import { execute, getMeta, queryAll, queryOne, setMeta, type LaunchRow } from './db.js'

const TOTAL_SUPPLY = 1_000_000_000

const client = createPublicClient({
  chain: {
    id: CHAIN_ID,
    name: 'HYPE',
    nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
  },
  transport: http(RPC_URL),
})

/** A new deployment block setting must take effect even when Turso has an older cursor. */
function nextBlock(last: string | null, configuredStart: bigint): bigint {
  const checkpoint = last ? BigInt(last) + 1n : configuredStart
  return checkpoint > configuredStart ? checkpoint : configuredStart
}

async function upsertLaunchFromSpawn(args: {
  id: number
  token: Address
  curve: Address
  creator: Address
  splitter: Address
  name: string
  symbol: string
  imageURI: string
  createdAt: number
  createdBlock: number
}) {
  await execute(
    `INSERT INTO launches (
      id, token, curve, splitter, creator, name, symbol, image_uri, created_at, created_block, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      token=excluded.token, curve=excluded.curve, splitter=excluded.splitter,
      creator=excluded.creator, name=excluded.name, symbol=excluded.symbol,
      image_uri=excluded.image_uri, created_at=excluded.created_at,
      created_block=excluded.created_block, updated_at=excluded.updated_at`,
    [
      args.id,
      args.token,
      args.curve,
      args.splitter,
      args.creator,
      args.name,
      args.symbol,
      args.imageURI || '',
      args.createdAt,
      args.createdBlock,
      Math.floor(Date.now() / 1000),
    ],
  )
}

async function refreshLaunchState(id: number, token: Address, curve: Address) {
  const [
    progressBps,
    graduated,
    migrated,
    externalPair,
    realNativeReserves,
    buyTaxBps,
    sellTaxBps,
    imageURI,
    description,
  ] = await Promise.all([
    client.readContract({ address: curve, abi: curveAbi, functionName: 'getProgressBps' }),
    client.readContract({ address: curve, abi: curveAbi, functionName: 'graduated' }),
    client.readContract({ address: curve, abi: curveAbi, functionName: 'migrated' }).catch(() => false),
    client
      .readContract({ address: curve, abi: curveAbi, functionName: 'externalPair' })
      .catch(() => '0x0000000000000000000000000000000000000000' as Address),
    client.readContract({ address: curve, abi: curveAbi, functionName: 'realNativeReserves' }),
    client.readContract({ address: curve, abi: curveAbi, functionName: 'buyTaxBps' }).catch(() => 0n),
    client.readContract({ address: curve, abi: curveAbi, functionName: 'sellTaxBps' }).catch(() => 0n),
    client
      .readContract({ address: token, abi: erc20MetaAbi, functionName: 'imageURI' })
      .catch(() => ''),
    client
      .readContract({ address: token, abi: erc20MetaAbi, functionName: 'description' })
      .catch(() => ''),
  ])

  await execute(
    `UPDATE launches SET
      progress_bps=?, graduated=?, migrated=?, external_pair=?, raised_native=?,
      buy_tax_bps=?, sell_tax_bps=?, image_uri=COALESCE(NULLIF(?, ''), image_uri),
      description=?, updated_at=?
     WHERE id=?`,
    [
      Number(progressBps),
      graduated ? 1 : 0,
      migrated ? 1 : 0,
      externalPair,
      Number(formatEther(realNativeReserves)),
      Number(buyTaxBps),
      Number(sellTaxBps),
      imageURI || '',
      description || '',
      Math.floor(Date.now() / 1000),
      id,
    ],
  )
}

async function insertTrade(row: {
  launchId: number
  curve: string
  side: 'buy' | 'sell'
  trader: string
  nativeAmount: number
  tokenAmount: number
  fee: number
  price: number
  mcap: number
  blockNumber: number
  txHash: string
  logIndex: number
  timestamp: number
}) {
  const info = await execute(
    `INSERT OR IGNORE INTO trades (
      launch_id, curve, side, trader, native_amount, token_amount, fee, price, mcap,
      block_number, tx_hash, log_index, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.launchId,
      row.curve,
      row.side,
      row.trader,
      row.nativeAmount,
      row.tokenAmount,
      row.fee,
      row.price,
      row.mcap,
      row.blockNumber,
      row.txHash,
      row.logIndex,
      row.timestamp,
    ],
  )

  if (info.rowsAffected > 0) {
    await execute(
      `UPDATE launches SET
        trade_count = trade_count + 1,
        volume_native = volume_native + ?,
        updated_at = ?
       WHERE id = ?`,
      [row.nativeAmount, Math.floor(Date.now() / 1000), row.launchId],
    )
  }
}

async function blockTs(blockNumber: bigint, cache: Map<string, number>) {
  const key = blockNumber.toString()
  const hit = cache.get(key)
  if (hit) return hit
  const block = await client.getBlock({ blockNumber })
  const ts = Number(block.timestamp)
  cache.set(key, ts)
  return ts
}

async function insertPlatformTrade(row: {
  side: 'buy' | 'sell'
  trader: string
  nativeAmount: number
  tokenAmount: number
  price: number
  mcap: number
  blockNumber: number
  txHash: string
  logIndex: number
  timestamp: number
}) {
  const info = await execute(
    `INSERT OR IGNORE INTO platform_trades (
      side, trader, native_amount, token_amount, fee, price, mcap,
      block_number, tx_hash, log_index, timestamp
    ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
    [
      row.side,
      row.trader,
      row.nativeAmount,
      row.tokenAmount,
      row.price,
      row.mcap,
      row.blockNumber,
      row.txHash,
      row.logIndex,
      row.timestamp,
    ],
  )
  return info.rowsAffected > 0
}

async function syncVyntraMarketTrades(
  chainSafeTo: bigint,
  tsCache: Map<string, number>,
): Promise<number> {
  if (!VYNTRA_MARKET_ADDRESS) return 0

  const last = await getMeta('last_vyntra_market_block')
  const from = nextBlock(last, VYNTRA_MARKET_START_BLOCK)
  if (from > chainSafeTo) return 0

  const chunkSize = BigInt(Math.max(1, Math.floor(LOG_CHUNK || 2_000)))
  let inserted = 0
  let cursor = from
  let chunks = 0
  while (cursor <= chainSafeTo && chunks < VYNTRA_MARKET_CATCHUP_CHUNKS) {
    const safeTo = chainSafeTo < cursor + chunkSize - 1n ? chainSafeTo : cursor + chunkSize - 1n
    const [buys, sells] = await Promise.all([
      client.getContractEvents({
        address: VYNTRA_MARKET_ADDRESS,
        abi: vyntraMarketAbi,
        eventName: 'BuyVyntra',
        fromBlock: cursor,
        toBlock: safeTo,
      }),
      client.getContractEvents({
        address: VYNTRA_MARKET_ADDRESS,
        abi: vyntraMarketAbi,
        eventName: 'SellVyntra',
        fromBlock: cursor,
        toBlock: safeTo,
      }),
    ])

    for (const event of buys) {
      if (
        event.blockNumber == null ||
        !event.transactionHash ||
        event.args.nativeIn == null ||
        event.args.vyntraOut == null
      ) continue
      const nativeAmount = Number(formatEther(event.args.nativeIn))
      const tokenAmount = Number(formatEther(event.args.vyntraOut))
      const price = tokenAmount > 0 ? nativeAmount / tokenAmount : 0
      const added = await insertPlatformTrade({
        side: 'buy',
        trader: event.args.buyer!,
        nativeAmount,
        tokenAmount,
        price,
        mcap: price * TOTAL_SUPPLY,
        blockNumber: Number(event.blockNumber),
        txHash: event.transactionHash,
        logIndex: event.logIndex ?? 0,
        timestamp: await blockTs(event.blockNumber, tsCache),
      })
      if (added) inserted++
    }

    for (const event of sells) {
      if (
        event.blockNumber == null ||
        !event.transactionHash ||
        event.args.nativeOut == null ||
        event.args.vyntraIn == null
      ) continue
      const nativeAmount = Number(formatEther(event.args.nativeOut))
      const tokenAmount = Number(formatEther(event.args.vyntraIn))
      const price = tokenAmount > 0 ? nativeAmount / tokenAmount : 0
      const added = await insertPlatformTrade({
        side: 'sell',
        trader: event.args.seller!,
        nativeAmount,
        tokenAmount,
        price,
        mcap: price * TOTAL_SUPPLY,
        blockNumber: Number(event.blockNumber),
        txHash: event.transactionHash,
        logIndex: event.logIndex ?? 0,
        timestamp: await blockTs(event.blockNumber, tsCache),
      })
      if (added) inserted++
    }

    // Persist each chunk so a provider error can resume from the last completed range.
    await setMeta('last_vyntra_market_block', safeTo.toString())
    cursor = safeTo + 1n
    chunks++
  }

  if (chunks > 0) {
    console.log(`[indexer] VYNTRA market indexed ${from}→${cursor - 1n} (+${inserted} trades)`)
  }
  return inserted
}

async function syncReserveEvents(chainSafeTo: bigint, tsCache: Map<string, number>): Promise<number> {
  if (!VYNTRA_RESERVE_VAULT_ADDRESS) return 0

  const last = await getMeta('last_reserve_block')
  const from = nextBlock(last, VYNTRA_RESERVE_START_BLOCK)
  if (from > chainSafeTo) return 0

  const eventNames = [
    'BucketReallocated',
    'CampaignCreated',
    'CampaignClaimed',
    'CampaignExpired',
    'ReserveReleaseRecorded',
  ] as const
  const chunkSize = BigInt(Math.max(1, Math.floor(LOG_CHUNK || 2_000)))
  let cursor = from
  let chunks = 0
  let inserted = 0

  while (cursor <= chainSafeTo && chunks < VYNTRA_RESERVE_CATCHUP_CHUNKS) {
    const safeTo = chainSafeTo < cursor + chunkSize - 1n ? chainSafeTo : cursor + chunkSize - 1n
    const logsByEvent = await Promise.all(
      eventNames.map((eventName) =>
        client.getContractEvents({
          address: VYNTRA_RESERVE_VAULT_ADDRESS,
          abi: reserveVaultAbi,
          eventName,
          fromBlock: cursor,
          toBlock: safeTo,
        }),
      ),
    )

    for (const logs of logsByEvent) {
      for (const log of logs) {
        if (log.blockNumber == null || !log.transactionHash) continue
        const args = log.args as unknown as Record<string, unknown>
        const campaignId = args.campaignId == null ? null : String(args.campaignId)
        const bucketValue = args.bucket ?? args.toBucket
        const bucket = bucketValue == null ? null : Number(bucketValue)
        const amountValue = args.amount ?? args.unclaimedReturned
        const amount = amountValue == null ? null : String(amountValue)
        const recipient = typeof args.recipient === 'string' ? args.recipient : null
        const payload = JSON.stringify(args, (_key, value) =>
          typeof value === 'bigint' ? value.toString() : value,
        )
        const result = await execute(
          `INSERT OR IGNORE INTO reserve_events (
            event_name, campaign_id, bucket, amount, recipient, block_number,
            tx_hash, log_index, timestamp, payload_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            log.eventName,
            campaignId,
            bucket,
            amount,
            recipient,
            Number(log.blockNumber),
            log.transactionHash,
            log.logIndex ?? 0,
            await blockTs(log.blockNumber, tsCache),
            payload,
          ],
        )
        if (result.rowsAffected > 0) inserted++
      }
    }

    await setMeta('last_reserve_block', safeTo.toString())
    cursor = safeTo + 1n
    chunks++
  }

  if (chunks > 0) {
    console.log(`[indexer] reserve events indexed ${from}→${cursor - 1n} (+${inserted} events)`)
  }
  return inserted
}

export async function syncOnce(): Promise<{ from: bigint; to: bigint; launches: number; trades: number }> {
  const factory = requireFactory()
  const latest = await client.getBlockNumber()
  const chainSafeTo = latest > BigInt(CONFIRMATIONS) ? latest - BigInt(CONFIRMATIONS) : 0n

  const last = await getMeta('last_block')
  const from = nextBlock(last, START_BLOCK)
  await setMeta('factory', factory)
  await setMeta('chain_id', String(CHAIN_ID))

  const tsCache = new Map<string, number>()
  let newLaunches = 0
  let newTrades = 0
  if (VYNTRA_MARKET_ADDRESS) {
    try {
      newTrades = await syncVyntraMarketTrades(chainSafeTo, tsCache)
    } catch (error) {
      // The optional platform index must not stall the launch-curve indexer.
      console.error('[indexer] VYNTRA market sync error', error)
    }
  }
  if (VYNTRA_RESERVE_VAULT_ADDRESS) {
    try {
      await syncReserveEvents(chainSafeTo, tsCache)
    } catch (error) {
      // Reserve indexing is optional and must not stall trading data.
      console.error('[indexer] reserve event sync error', error)
    }
  }

  if (from > chainSafeTo) {
    await setMeta('last_sync_at', String(Math.floor(Date.now() / 1000)))
    return { from, to: chainSafeTo, launches: 0, trades: newTrades }
  }

  // Bootstrap any launches missing from DB (e.g. indexer started mid-life).
  const onchainCount = Number(
    await client.readContract({ address: factory, abi: factoryAbi, functionName: 'launchCount' }),
  )
  const countRow = await queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM launches')
  const dbCount = Number(countRow?.c ?? 0)
  if (dbCount < onchainCount) {
    for (let id = 1; id <= onchainCount; id++) {
      const exists = await queryOne<{ ok: number }>('SELECT 1 AS ok FROM launches WHERE id = ?', [id])
      if (exists) continue
      const launch = await client.readContract({
        address: factory,
        abi: factoryAbi,
        functionName: 'getLaunch',
        args: [BigInt(id)],
      })
      await upsertLaunchFromSpawn({
        id,
        token: launch.token,
        curve: launch.curve,
        creator: launch.creator,
        splitter: launch.splitter,
        name: launch.name,
        symbol: launch.symbol,
        imageURI: '',
        createdAt: Number(launch.createdAt),
        createdBlock: 0,
      })
      await refreshLaunchState(id, launch.token, launch.curve)
      newLaunches++
    }
  }

  // Keep each RPC log query within the configured provider range limit. Several
  // bounded chunks per Vercel invocation let a delayed indexer catch up sooner.
  const chunkSize = BigInt(Math.max(1, Math.floor(LOG_CHUNK || 2_000)))
  const maxChunks = Math.max(1, Math.floor(INDEXER_CATCHUP_CHUNKS || 1))
  let cursor = from
  let chunks = 0
  while (cursor <= chainSafeTo && chunks < maxChunks) {
    const safeTo = chainSafeTo < cursor + chunkSize - 1n ? chainSafeTo : cursor + chunkSize - 1n

    // 1) Factory TokenSpawned
    const spawnLogs = await client.getContractEvents({
      address: factory,
      abi: factoryAbi,
      eventName: 'TokenSpawned',
      fromBlock: cursor,
      toBlock: safeTo,
    })

    for (const log of spawnLogs) {
      const id = Number(log.args.id)
      const ts = log.blockNumber != null ? await blockTs(log.blockNumber, tsCache) : Math.floor(Date.now() / 1000)
      await upsertLaunchFromSpawn({
        id,
        token: log.args.token!,
        curve: log.args.curve!,
        creator: log.args.creator!,
        splitter: log.args.splitter!,
        name: log.args.name!,
        symbol: log.args.symbol!,
        imageURI: log.args.imageURI || '',
        createdAt: ts,
        createdBlock: Number(log.blockNumber ?? 0n),
      })
      await refreshLaunchState(id, log.args.token!, log.args.curve!)
      newLaunches++
    }

    // 2) Trades + graduate/migrate per known curve
    const launches = await queryAll<Pick<LaunchRow, 'id' | 'token' | 'curve'>>(
      'SELECT id, token, curve FROM launches',
    )

    for (const L of launches) {
      const curve = L.curve as Address
      const [buys, sells, grads, migs] = await Promise.all([
        client.getContractEvents({
          address: curve,
          abi: curveAbi,
          eventName: 'Buy',
          fromBlock: cursor,
          toBlock: safeTo,
        }),
        client.getContractEvents({
          address: curve,
          abi: curveAbi,
          eventName: 'Sell',
          fromBlock: cursor,
          toBlock: safeTo,
        }),
        client.getContractEvents({
          address: curve,
          abi: curveAbi,
          eventName: 'Graduated',
          fromBlock: cursor,
          toBlock: safeTo,
        }),
        client.getContractEvents({
          address: curve,
          abi: curveAbi,
          eventName: 'MigratedToUniswap',
          fromBlock: cursor,
          toBlock: safeTo,
        }),
      ])

      for (const e of buys) {
        if (!e.blockNumber || !e.transactionHash || e.args.nativeIn == null || e.args.tokensOut == null) continue
        const ts = await blockTs(e.blockNumber, tsCache)
        const fee = Number(formatEther(e.args.fee ?? 0n))
        const native = Number(formatEther(e.args.nativeIn))
        const tok = Number(formatEther(e.args.tokensOut))
        const net = Math.max(native - fee, 0)
        const price = tok > 0 ? net / tok : 0
        await insertTrade({
          launchId: L.id,
          curve,
          side: 'buy',
          trader: e.args.buyer!,
          nativeAmount: native,
          tokenAmount: tok,
          fee,
          price,
          mcap: price * TOTAL_SUPPLY,
          blockNumber: Number(e.blockNumber),
          txHash: e.transactionHash,
          logIndex: e.logIndex ?? 0,
          timestamp: ts,
        })
        newTrades++
      }

      for (const e of sells) {
        if (!e.blockNumber || !e.transactionHash || e.args.nativeOut == null || e.args.tokensIn == null) continue
        const ts = await blockTs(e.blockNumber, tsCache)
        const fee = Number(formatEther(e.args.fee ?? 0n))
        const native = Number(formatEther(e.args.nativeOut))
        const tok = Number(formatEther(e.args.tokensIn))
        const price = tok > 0 ? native / tok : 0
        await insertTrade({
          launchId: L.id,
          curve,
          side: 'sell',
          trader: e.args.seller!,
          nativeAmount: native,
          tokenAmount: tok,
          fee,
          price,
          mcap: price * TOTAL_SUPPLY,
          blockNumber: Number(e.blockNumber),
          txHash: e.transactionHash,
          logIndex: e.logIndex ?? 0,
          timestamp: ts,
        })
        newTrades++
      }

      if (grads.length || migs.length || buys.length || sells.length) {
        await refreshLaunchState(L.id, L.token as Address, curve)
      }
    }

    // 3) Board replies
    if (BOARD_ADDRESS) {
      const replies = await client.getContractEvents({
        address: BOARD_ADDRESS,
        abi: boardAbi,
        eventName: 'ReplyPosted',
        fromBlock: cursor,
        toBlock: safeTo,
      })
      for (const e of replies) {
        if (e.args.launchId == null || e.args.replyIndex == null) continue
        const ts = e.blockNumber != null ? await blockTs(e.blockNumber, tsCache) : Math.floor(Date.now() / 1000)
        await execute(
          `INSERT OR REPLACE INTO replies (launch_id, reply_index, author, body, timestamp, tx_hash)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            Number(e.args.launchId),
            Number(e.args.replyIndex),
            e.args.author!,
            e.args.body || '',
            ts,
            e.transactionHash || '',
          ],
        )
      }
    }

    // Persist each completed chunk so a later timeout resumes without re-scanning it.
    await setMeta('last_block', safeTo.toString())
    cursor = safeTo + 1n
    chunks++
  }

  await setMeta('last_sync_at', String(Math.floor(Date.now() / 1000)))

  return { from, to: cursor - 1n, launches: newLaunches, trades: newTrades }
}

export async function runLoop(pollMs: number) {
  console.log(`[indexer] rpc=${RPC_URL} chain=${CHAIN_ID} factory=${requireFactory()}`)
  for (;;) {
    try {
      const r = await syncOnce()
      console.log(
        `[indexer] synced ${r.from}→${r.to} launches+${r.launches} trades+${r.trades}`,
      )
    } catch (e) {
      console.error('[indexer] sync error', e)
    }
    await new Promise((r) => setTimeout(r, pollMs))
  }
}
