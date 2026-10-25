import { createPublicClient, formatEther, http, type Address } from 'viem'
import { boardAbi, curveAbi, erc20MetaAbi, factoryAbi } from './abis.js'
import {
  BOARD_ADDRESS,
  CHAIN_ID,
  CONFIRMATIONS,
  LOG_CHUNK,
  RPC_URL,
  START_BLOCK,
  requireFactory,
} from './config.js'
import { execute, getMeta, queryAll, queryOne, setMeta, type LaunchRow } from './db.js'

const TOTAL_SUPPLY = 1_000_000_000

const client = createPublicClient({
  chain: {
    id: CHAIN_ID,
    name: 'BOT',
    nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
  },
  transport: http(RPC_URL),
})

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
    realBotReserves,
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
    client.readContract({ address: curve, abi: curveAbi, functionName: 'realBotReserves' }),
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
      progress_bps=?, graduated=?, migrated=?, external_pair=?, raised_bot=?,
      buy_tax_bps=?, sell_tax_bps=?, image_uri=COALESCE(NULLIF(?, ''), image_uri),
      description=?, updated_at=?
     WHERE id=?`,
    [
      Number(progressBps),
      graduated ? 1 : 0,
      migrated ? 1 : 0,
      externalPair,
      Number(formatEther(realBotReserves)),
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
  botAmount: number
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
      launch_id, curve, side, trader, bot_amount, token_amount, fee, price, mcap,
      block_number, tx_hash, log_index, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.launchId,
      row.curve,
      row.side,
      row.trader,
      row.botAmount,
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
        volume_bot = volume_bot + ?,
        updated_at = ?
       WHERE id = ?`,
      [row.botAmount, Math.floor(Date.now() / 1000), row.launchId],
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

export async function syncOnce(): Promise<{ from: bigint; to: bigint; launches: number; trades: number }> {
  const factory = requireFactory()
  const latest = await client.getBlockNumber()
  const chainSafeTo = latest > BigInt(CONFIRMATIONS) ? latest - BigInt(CONFIRMATIONS) : 0n

  const last = await getMeta('last_block')
  let from = last ? BigInt(last) + 1n : START_BLOCK
  if (from > chainSafeTo) {
    await setMeta('last_sync_at', String(Math.floor(Date.now() / 1000)))
    return { from, to: chainSafeTo, launches: 0, trades: 0 }
  }

  // Keep each RPC log query within the configured provider range limit. Persist
  // the checkpoint after this batch so a large initial backfill can resume.
  const chunkSize = BigInt(Math.max(1, Math.floor(LOG_CHUNK || 2_000)))
  const safeTo = chainSafeTo < from + chunkSize - 1n ? chainSafeTo : from + chunkSize - 1n

  await setMeta('factory', factory)
  await setMeta('chain_id', String(CHAIN_ID))

  const tsCache = new Map<string, number>()
  let newLaunches = 0
  let newTrades = 0

  // 1) Factory TokenSpawned
  const spawnLogs = await client.getContractEvents({
    address: factory,
    abi: factoryAbi,
    eventName: 'TokenSpawned',
    fromBlock: from,
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

  // Also bootstrap any launches missing from DB (e.g. indexer started mid-life)
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
        fromBlock: from,
        toBlock: safeTo,
      }),
      client.getContractEvents({
        address: curve,
        abi: curveAbi,
        eventName: 'Sell',
        fromBlock: from,
        toBlock: safeTo,
      }),
      client.getContractEvents({
        address: curve,
        abi: curveAbi,
        eventName: 'Graduated',
        fromBlock: from,
        toBlock: safeTo,
      }),
      client.getContractEvents({
        address: curve,
        abi: curveAbi,
        eventName: 'MigratedToBdex',
        fromBlock: from,
        toBlock: safeTo,
      }),
    ])

    for (const e of buys) {
      if (!e.blockNumber || !e.transactionHash || e.args.botIn == null || e.args.tokensOut == null) continue
      const ts = await blockTs(e.blockNumber, tsCache)
      const fee = Number(formatEther(e.args.fee ?? 0n))
      const bot = Number(formatEther(e.args.botIn))
      const tok = Number(formatEther(e.args.tokensOut))
      const net = Math.max(bot - fee, 0)
      const price = tok > 0 ? net / tok : 0
      await insertTrade({
        launchId: L.id,
        curve,
        side: 'buy',
        trader: e.args.buyer!,
        botAmount: bot,
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
      if (!e.blockNumber || !e.transactionHash || e.args.botOut == null || e.args.tokensIn == null) continue
      const ts = await blockTs(e.blockNumber, tsCache)
      const fee = Number(formatEther(e.args.fee ?? 0n))
      const bot = Number(formatEther(e.args.botOut))
      const tok = Number(formatEther(e.args.tokensIn))
      const price = tok > 0 ? bot / tok : 0
      await insertTrade({
        launchId: L.id,
        curve,
        side: 'sell',
        trader: e.args.seller!,
        botAmount: bot,
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

    if (grads.length || migs.length) {
      await refreshLaunchState(L.id, L.token as Address, curve)
    } else if (buys.length || sells.length) {
      // cheap refresh of reserves/progress after activity
      await refreshLaunchState(L.id, L.token as Address, curve)
    }
  }

  // 3) Board replies
  if (BOARD_ADDRESS) {
    const replies = await client.getContractEvents({
      address: BOARD_ADDRESS,
      abi: boardAbi,
      eventName: 'ReplyPosted',
      fromBlock: from,
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

  await setMeta('last_block', safeTo.toString())
  await setMeta('last_sync_at', String(Math.floor(Date.now() / 1000)))

  return { from, to: safeTo, launches: newLaunches, trades: newTrades }
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
