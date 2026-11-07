import 'dotenv/config'
import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import * as z from 'zod/v4'
import {
  createPublicClient,
  defineChain,
  encodeFunctionData,
  formatEther,
  getAddress,
  http,
  parseEther,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem'

const CHAIN_ID = 99801
const EXPLORER = 'https://explorer-elysium-testnet.t.conduit.xyz'
const DEFAULT_RPC = 'https://testnet-rpc.elysium.kinetiq.xyz'
const rpcUrl = process.env.VYNTRA_RPC_URL || DEFAULT_RPC
const indexerUrl = process.env.VYNTRA_INDEXER_URL?.replace(/\/$/, '')
const factoryAddress = process.env.VYNTRA_FACTORY_ADDRESS
  ? getAddress(process.env.VYNTRA_FACTORY_ADDRESS)
  : undefined
const platformMarketAddress = process.env.VYNTRA_MARKET_ADDRESS
  ? getAddress(process.env.VYNTRA_MARKET_ADDRESS)
  : undefined
const platformTokenAddress = process.env.VYNTRA_TOKEN_ADDRESS
  ? getAddress(process.env.VYNTRA_TOKEN_ADDRESS)
  : undefined

const chain = defineChain({
  id: CHAIN_ID,
  name: 'Kinetiq Elysium Testnet',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: { default: { name: 'Elysium Explorer', url: EXPLORER } },
  testnet: true,
})

const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })

const factoryAbi = [
  {
    type: 'function',
    name: 'launchCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tokenId',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getLaunch',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'token', type: 'address' },
        { name: 'curve', type: 'address' },
        { name: 'creator', type: 'address' },
        { name: 'splitter', type: 'address' },
        { name: 'name', type: 'string' },
        { name: 'symbol', type: 'string' },
        { name: 'createdAt', type: 'uint256' },
      ],
    }],
  },
  {
    type: 'function',
    name: 'findVanitySalt',
    stateMutability: 'view',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'imageURI', type: 'string' },
      { name: 'description', type: 'string' },
    ],
    outputs: [
      { name: 'salt', type: 'bytes32' },
      { name: 'predictedToken', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'isNameTaken',
    stateMutability: 'view',
    inputs: [{ name: 'name', type: 'string' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isSymbolTaken',
    stateMutability: 'view',
    inputs: [{ name: 'symbol', type: 'string' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'spawn',
    stateMutability: 'payable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'imageURI', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'referrer', type: 'address' },
      { name: 'buyTaxBps', type: 'uint256' },
      { name: 'sellTaxBps', type: 'uint256' },
      { name: 'fundsBps', type: 'uint256' },
      { name: 'buybackBps', type: 'uint256' },
      { name: 'dividendsBps', type: 'uint256' },
      { name: 'liquidityBps', type: 'uint256' },
      { name: 'tokenSalt', type: 'bytes32' },
    ],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'curve', type: 'address' },
    ],
  },
] as const

const curveAbi = [
  {
    type: 'function', name: 'getProgressBps', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'getReserves', stateMutability: 'view',
    inputs: [], outputs: [{ name: 'nativeReserves', type: 'uint256' }, { name: 'tokenReserves', type: 'uint256' }],
  },
  {
    type: 'function', name: 'graduated', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'bool' }],
  },
  {
    type: 'function', name: 'quoteBuy', stateMutability: 'view',
    inputs: [{ name: 'nativeIn', type: 'uint256' }],
    outputs: [{ name: 'tokensOut', type: 'uint256' }, { name: 'fee', type: 'uint256' }],
  },
  {
    type: 'function', name: 'quoteSell', stateMutability: 'view',
    inputs: [{ name: 'tokensIn', type: 'uint256' }],
    outputs: [{ name: 'nativeOut', type: 'uint256' }, { name: 'fee', type: 'uint256' }],
  },
  {
    type: 'function', name: 'buy', stateMutability: 'payable',
    inputs: [{ name: 'minTokensOut', type: 'uint256' }, { name: 'referrer', type: 'address' }],
    outputs: [{ name: 'tokensOut', type: 'uint256' }],
  },
  {
    type: 'function', name: 'sell', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokensIn', type: 'uint256' }, { name: 'minNativeOut', type: 'uint256' }],
    outputs: [{ name: 'nativeOut', type: 'uint256' }],
  },
  {
    type: 'function', name: 'claimCreatorFees', stateMutability: 'nonpayable',
    inputs: [], outputs: [],
  },
  {
    type: 'function', name: 'creatorFees', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
] as const

const marketAbi = [
  {
    type: 'function', name: 'quoteBuyVyntra', stateMutability: 'view',
    inputs: [{ name: 'nativeIn', type: 'uint256' }], outputs: [{ name: 'vyntraOut', type: 'uint256' }],
  },
  {
    type: 'function', name: 'quoteSellVyntra', stateMutability: 'view',
    inputs: [{ name: 'vyntraIn', type: 'uint256' }], outputs: [{ name: 'nativeOut', type: 'uint256' }],
  },
  {
    type: 'function', name: 'buyVyntra', stateMutability: 'payable',
    inputs: [{ name: 'minVyntraOut', type: 'uint256' }], outputs: [{ name: 'vyntraOut', type: 'uint256' }],
  },
  {
    type: 'function', name: 'sellVyntra', stateMutability: 'nonpayable',
    inputs: [{ name: 'vyntraIn', type: 'uint256' }, { name: 'minNativeOut', type: 'uint256' }],
    outputs: [{ name: 'nativeOut', type: 'uint256' }],
  },
] as const

const erc20Abi = [
  {
    type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
] as const

type LaunchRecord = {
  token: Address
  curve: Address
  creator: Address
  splitter: Address
  name: string
  symbol: string
  createdAt: bigint
}

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, jsonReplacer, 2) }] }
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

function jsonReplacer(_key: string, value: unknown) {
  return typeof value === 'bigint' ? value.toString() : value
}

function requireFactory(): Address {
  if (!factoryAddress) throw new Error('Set VYNTRA_FACTORY_ADDRESS to the deployed Elysium factory.')
  return factoryAddress
}

function requireIndexer(): string {
  if (!indexerUrl) throw new Error('Set VYNTRA_INDEXER_URL to use indexed history and portfolio tools.')
  return indexerUrl
}

function parseAmount(amount: string, label: string): bigint {
  try {
    const parsed = parseEther(amount)
    if (parsed <= 0n) throw new Error()
    return parsed
  } catch {
    throw new Error(`${label} must be a positive decimal amount with at most 18 decimal places.`)
  }
}

function minimumOutput(quote: bigint, slippageBps: number): bigint {
  if (quote <= 0n) throw new Error('The on-chain quote is zero; the trade is unavailable at this size.')
  const minimum = (quote * BigInt(10_000 - slippageBps)) / 10_000n
  return minimum > 0n ? minimum : 1n
}

function normalizeLaunch(raw: unknown): LaunchRecord {
  if (Array.isArray(raw)) {
    return {
      token: getAddress(String(raw[0])),
      curve: getAddress(String(raw[1])),
      creator: getAddress(String(raw[2])),
      splitter: getAddress(String(raw[3])),
      name: String(raw[4]),
      symbol: String(raw[5]),
      createdAt: BigInt(raw[6] as bigint),
    }
  }
  if (!raw || typeof raw !== 'object') throw new Error('Factory returned an invalid launch record.')
  const item = raw as Record<string, unknown>
  return {
    token: getAddress(String(item.token)),
    curve: getAddress(String(item.curve)),
    creator: getAddress(String(item.creator)),
    splitter: getAddress(String(item.splitter)),
    name: String(item.name),
    symbol: String(item.symbol),
    createdAt: BigInt(item.createdAt as bigint),
  }
}

async function readLaunch(id: bigint) {
  const raw = await publicClient.readContract({
    address: requireFactory(), abi: factoryAbi, functionName: 'getLaunch', args: [id],
  })
  if (Array.isArray(raw) && (raw[0] === zeroAddress || raw[0] === undefined)) {
    throw new Error(`No launch exists with id ${id}.`)
  }
  const launch = normalizeLaunch(raw)
  if (launch.token === zeroAddress) throw new Error(`No launch exists with id ${id}.`)
  const [progressBps, graduated, reserves] = await Promise.all([
    publicClient.readContract({ address: launch.curve, abi: curveAbi, functionName: 'getProgressBps' }),
    publicClient.readContract({ address: launch.curve, abi: curveAbi, functionName: 'graduated' }),
    publicClient.readContract({ address: launch.curve, abi: curveAbi, functionName: 'getReserves' }),
  ])
  return {
    id: Number(id),
    token: launch.token,
    curve: launch.curve,
    creator: launch.creator,
    name: launch.name,
    symbol: launch.symbol,
    createdAt: new Date(Number(launch.createdAt) * 1000).toISOString(),
    progressPercent: Number(progressBps) / 100,
    graduated,
    reserves: { hype: formatEther(reserves[0]), token: formatEther(reserves[1]) },
    explorer: `${EXPLORER}/address/${launch.token}`,
  }
}

async function findLaunch(token: string) {
  const address = getAddress(token)
  const id = await publicClient.readContract({
    address: requireFactory(), abi: factoryAbi, functionName: 'tokenId', args: [address],
  })
  if (id === 0n) throw new Error(`Token ${address} is not registered by this Vyntra factory.`)
  const record = await readLaunch(id)
  const raw = await publicClient.readContract({
    address: requireFactory(), abi: factoryAbi, functionName: 'getLaunch', args: [id],
  })
  return { record, launch: normalizeLaunch(raw) }
}

async function fetchIndexer<T>(path: string): Promise<T> {
  const base = requireIndexer()
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Indexer request failed (${response.status}) at ${path}.`)
  return await response.json() as T
}

function txPayload(to: Address, data: Hex, value: bigint, summary: string) {
  return {
    chainId: CHAIN_ID,
    network: 'Kinetiq Elysium Testnet',
    to,
    data,
    value: `0x${value.toString(16)}`,
    valueHype: formatEther(value),
    summary,
    unsigned: true,
    requiresWalletReviewAndSignature: true,
    explorer: `${EXPLORER}/address/${to}`,
  }
}

function createServer() {
  const server = new McpServer(
    { name: 'vyntra', version: '0.1.0' },
    {
      instructions:
        'Vyntra tools read Elysium Testnet data and prepare unsigned transaction payloads. ' +
        'Never claim a transaction was sent. Before any wallet signs, show the user the network, ' +
        'recipient, amount, minimum output, and calldata summary. This server cannot access keys, ' +
        'sign, submit, or fund a wallet.',
    },
  )

  server.registerTool(
    'vyntra_search_launches',
    {
      description: 'Search Vyntra launches by name, ticker, or token address. Uses the indexer when configured and falls back to recent on-chain factory records.',
      inputSchema: z.object({
        query: z.string().min(1).max(128),
        limit: z.number().int().min(1).max(50).default(10),
        sort: z.enum(['new', 'trending', 'volume']).default('new'),
      }),
    },
    async ({ query, limit, sort }) => {
      try {
        let launches: Array<Record<string, unknown>>
        let source: string
        if (indexerUrl) {
          const data = await fetchIndexer<{ launches: Array<Record<string, unknown>> }>(
            `/v1/launches?sort=${sort}&limit=500`,
          )
          launches = data.launches
          source = 'vyntra-indexer'
        } else {
          const count = await publicClient.readContract({
            address: requireFactory(), abi: factoryAbi, functionName: 'launchCount',
          })
          const first = count > 50n ? count - 49n : 1n
          launches = await Promise.all(
            Array.from({ length: Number(count - first + 1n) }, async (_, index) => {
              const launch = normalizeLaunch(await publicClient.readContract({
                address: requireFactory(), abi: factoryAbi, functionName: 'getLaunch', args: [first + BigInt(index)],
              }))
              return {
                id: Number(first + BigInt(index)), token: launch.token, curve: launch.curve,
                creator: launch.creator, name: launch.name, symbol: launch.symbol,
                createdAt: Number(launch.createdAt) * 1000,
              }
            }),
          )
          source = 'recent on-chain factory records'
        }
        const needle = query.toLowerCase()
        const matches = launches.filter((item) =>
          [item.name, item.symbol, item.token, item.creator]
            .some((field) => String(field ?? '').toLowerCase().includes(needle)),
        ).slice(0, limit)
        return textResult({ chainId: CHAIN_ID, source, query, count: matches.length, launches: matches })
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'vyntra_get_launch',
    {
      description: 'Read a registered launch from the Elysium Testnet factory, including progress, graduation status, and live pool reserves.',
      inputSchema: z.object({
        id: z.number().int().positive().optional(),
        token: z.string().optional(),
      }).refine((input) => input.id !== undefined || input.token !== undefined, {
        message: 'Provide either a launch id or token address.',
      }),
    },
    async ({ id, token }) => {
      try {
        const launch = token
          ? (await findLaunch(token)).record
          : await readLaunch(BigInt(id!))
        return textResult(launch)
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'vyntra_get_stats',
    {
      description: 'Read indexed Vyntra launch, trade, and native HYPE volume totals.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const stats = await fetchIndexer<Record<string, unknown>>('/v1/stats')
        return textResult({ chainId: CHAIN_ID, source: 'vyntra-indexer', ...stats })
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'vyntra_get_launch_trades',
    {
      description: 'Read the indexed trade tape for a launch. Data can lag the latest block; check the explorer for transaction finality.',
      inputSchema: z.object({
        launchId: z.number().int().positive(),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    },
    async ({ launchId, limit }) => {
      try {
        const trades = await fetchIndexer<{ trades: unknown[] }>(
          `/v1/launches/${launchId}/trades?limit=${limit}`,
        )
        return textResult({ chainId: CHAIN_ID, launchId, ...trades })
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'vyntra_get_wallet_activity',
    {
      description: 'Read indexed Vyntra launch and platform-token positions, PnL, and wallet trades. Transfers are not included in trade-derived positions.',
      inputSchema: z.object({
        wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        includeTrades: z.boolean().default(true),
      }),
    },
    async ({ wallet, includeTrades }) => {
      try {
        const address = getAddress(wallet)
        const [portfolio, trades] = await Promise.all([
          fetchIndexer<Record<string, unknown>>(`/v1/wallets/${address}/portfolio`),
          includeTrades
            ? fetchIndexer<Record<string, unknown>>(`/v1/wallets/${address}/trades?limit=100`)
            : Promise.resolve(null),
        ])
        return textResult({ chainId: CHAIN_ID, portfolio, trades })
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'vyntra_get_trade_quote',
    {
      description: 'Get a live on-chain quote for a launch token or $VYNTRA against HYPE. A quote is not a price guarantee.',
      inputSchema: z.object({
        market: z.enum(['launch', 'platform']).default('launch'),
        token: z.string().optional(),
        side: z.enum(['buy', 'sell']),
        amount: z.string().min(1),
      }),
    },
    async ({ market, token, side, amount }) => {
      try {
        const amountWei = parseAmount(amount, 'Amount')
        if (market === 'platform') {
          if (!platformMarketAddress) throw new Error('Set VYNTRA_MARKET_ADDRESS to quote the $VYNTRA platform market.')
          const amountOut = await publicClient.readContract({
            address: platformMarketAddress,
            abi: marketAbi,
            functionName: side === 'buy' ? 'quoteBuyVyntra' : 'quoteSellVyntra',
            args: [amountWei],
          })
          return textResult({
            chainId: CHAIN_ID, market: 'platform', side,
            amountIn: formatEther(amountWei), inputAsset: side === 'buy' ? 'HYPE' : 'VYNTRA',
            amountOut: formatEther(amountOut), outputAsset: side === 'buy' ? 'VYNTRA' : 'HYPE',
            quoteOnly: true,
          })
        }
        if (!token) throw new Error('Provide a launch token address when market is launch.')
        const { record, launch } = await findLaunch(token)
        const [amountOut, fee] = await publicClient.readContract({
          address: launch.curve,
          abi: curveAbi,
          functionName: side === 'buy' ? 'quoteBuy' : 'quoteSell',
          args: [amountWei],
        })
        return textResult({
          chainId: CHAIN_ID, market: 'launch', launchId: record.id, token: launch.token,
          side, amountIn: formatEther(amountWei), inputAsset: side === 'buy' ? 'HYPE' : launch.symbol,
          amountOut: formatEther(amountOut), outputAsset: side === 'buy' ? launch.symbol : 'HYPE',
          fee: formatEther(fee), feeAsset: 'HYPE', quoteOnly: true,
        })
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'vyntra_prepare_launch',
    {
      description: 'Prepare (but do not sign or submit) a token launch transaction with a factory-verified 0x7f7 address suffix.',
      inputSchema: z.object({
        name: z.string().trim().min(1).max(32),
        symbol: z.string().trim().min(1).max(10),
        imageURI: z.string().trim().min(1).max(2048),
        description: z.string().trim().min(1).max(2000),
        initialLiquidityHype: z.string().min(1),
      }),
    },
    async ({ name, symbol, imageURI, description, initialLiquidityHype }) => {
      try {
        const factory = requireFactory()
        const liquidity = parseAmount(initialLiquidityHype, 'Initial HYPE liquidity')
        if (liquidity < parseEther('5') || liquidity > parseEther('100')) {
          throw new Error('Initial liquidity must be between 5 and 100 HYPE.')
        }
        const normalizedSymbol = symbol.toUpperCase()
        const [nameTaken, symbolTaken, vanity] = await Promise.all([
          publicClient.readContract({ address: factory, abi: factoryAbi, functionName: 'isNameTaken', args: [name] }),
          publicClient.readContract({ address: factory, abi: factoryAbi, functionName: 'isSymbolTaken', args: [normalizedSymbol] }),
          publicClient.readContract({
            address: factory, abi: factoryAbi, functionName: 'findVanitySalt',
            args: [name, normalizedSymbol, imageURI, description],
          }),
        ])
        if (nameTaken) throw new Error(`The name "${name}" is already registered.`)
        if (symbolTaken) throw new Error(`The ticker $${normalizedSymbol} is already registered.`)
        const [salt, predictedToken] = vanity
        const data = encodeFunctionData({
          abi: factoryAbi,
          functionName: 'spawn',
          args: [name, normalizedSymbol, imageURI, description, zeroAddress, 0n, 0n, 0n, 0n, 0n, 0n, salt],
        })
        return textResult({
          transaction: txPayload(factory, data, liquidity, `Launch ${name} ($${normalizedSymbol})`),
          predictedToken,
          vanitySuffix: '7f7',
          initialLiquidityHype: formatEther(liquidity),
          checkBeforeSigning: 'Confirm name, ticker, image URI, description, 5–100 HYPE seed, and predicted token address.',
        })
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'vyntra_prepare_trade',
    {
      description: 'Prepare unsigned buy or sell transaction data for a launch market or the $VYNTRA/HYPE platform market. Sells include a separate approval step when needed.',
      inputSchema: z.object({
        market: z.enum(['launch', 'platform']).default('launch'),
        token: z.string().optional(),
        side: z.enum(['buy', 'sell']),
        amount: z.string().min(1),
        wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
        slippageBps: z.number().int().min(50).max(500).default(100),
      }),
    },
    async ({ market, token, side, amount, wallet, slippageBps }) => {
      try {
        const amountWei = parseAmount(amount, 'Amount')
        let tradeTo: Address
        let tokenAddress: Address
        let tokenSymbol: string
        let quote: bigint
        let fee = 0n
        let tradeData: Hex
        let spender: Address

        if (market === 'platform') {
          if (!platformMarketAddress || !platformTokenAddress) {
            throw new Error('Set VYNTRA_MARKET_ADDRESS and VYNTRA_TOKEN_ADDRESS for platform trades.')
          }
          tradeTo = platformMarketAddress
          tokenAddress = platformTokenAddress
          tokenSymbol = 'VYNTRA'
          spender = platformMarketAddress
          quote = await publicClient.readContract({
            address: tradeTo, abi: marketAbi,
            functionName: side === 'buy' ? 'quoteBuyVyntra' : 'quoteSellVyntra', args: [amountWei],
          })
          if (side === 'buy') {
            tradeData = encodeFunctionData({
              abi: marketAbi, functionName: 'buyVyntra',
              args: [minimumOutput(quote, slippageBps)],
            })
          } else {
            tradeData = encodeFunctionData({
              abi: marketAbi, functionName: 'sellVyntra',
              args: [amountWei, minimumOutput(quote, slippageBps)],
            })
          }
        } else {
          if (!token) throw new Error('Provide a launch token address for a launch trade.')
          const { launch } = await findLaunch(token)
          tradeTo = launch.curve
          tokenAddress = launch.token
          tokenSymbol = launch.symbol
          spender = launch.curve
          const quoted = await publicClient.readContract({
            address: tradeTo, abi: curveAbi,
            functionName: side === 'buy' ? 'quoteBuy' : 'quoteSell', args: [amountWei],
          })
          quote = quoted[0]
          fee = quoted[1]
          if (side === 'buy') {
            tradeData = encodeFunctionData({
              abi: curveAbi, functionName: 'buy',
              args: [minimumOutput(quote, slippageBps), zeroAddress],
            })
          } else {
            tradeData = encodeFunctionData({
              abi: curveAbi, functionName: 'sell',
              args: [amountWei, minimumOutput(quote, slippageBps)],
            })
          }
        }

        const steps: ReturnType<typeof txPayload>[] = []
        if (side === 'sell') {
          if (!wallet) throw new Error('Provide your wallet address to prepare a sell and check its token allowance.')
          const owner = getAddress(wallet)
          const allowance = await publicClient.readContract({
            address: tokenAddress, abi: erc20Abi, functionName: 'allowance', args: [owner, spender],
          })
          if (allowance < amountWei) {
            const approvalData = encodeFunctionData({
              abi: erc20Abi, functionName: 'approve', args: [spender, amountWei],
            })
            steps.push(txPayload(tokenAddress, approvalData, 0n, `Approve ${formatEther(amountWei)} ${tokenSymbol} for this market`))
          }
        }

        const value = side === 'buy' ? amountWei : 0n
        steps.push(txPayload(tradeTo, tradeData, value, `${side === 'buy' ? 'Buy' : 'Sell'} ${tokenSymbol}`))
        return textResult({
          chainId: CHAIN_ID,
          market,
          token: tokenAddress,
          side,
          quote: {
            amountIn: formatEther(amountWei),
            amountOut: formatEther(quote),
            outputAsset: side === 'buy' ? tokenSymbol : 'HYPE',
            feeHype: market === 'launch' ? formatEther(fee) : undefined,
            slippageBps,
            minimumOutput: formatEther(minimumOutput(quote, slippageBps)),
          },
          steps,
          unsigned: true,
          warning: 'Quotes can change before signing. Review each transaction in your wallet; this server cannot submit or sign it.',
        })
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'vyntra_prepare_creator_fee_claim',
    {
      description: 'Prepare an unsigned claimCreatorFees transaction after verifying the wallet is the launch creator.',
      inputSchema: z.object({ token: z.string(), wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/) }),
    },
    async ({ token, wallet }) => {
      try {
        const { launch } = await findLaunch(token)
        const owner = getAddress(wallet)
        if (launch.creator.toLowerCase() !== owner.toLowerCase()) {
          throw new Error('Only the launch creator can claim these fees.')
        }
        const claimable = await publicClient.readContract({
          address: launch.curve, abi: curveAbi, functionName: 'creatorFees',
        })
        const data = encodeFunctionData({ abi: curveAbi, functionName: 'claimCreatorFees' })
        return textResult({
          previouslyRecordedCreatorFeesHype: formatEther(claimable),
          claimCollectsNewPositionFees: true,
          transaction: txPayload(launch.curve, data, 0n, `Claim creator fees for ${launch.name} ($${launch.symbol})`),
          signerMustBe: launch.creator,
          unsigned: true,
        })
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  return server
}

if (!factoryAddress) {
  console.error('Vyntra MCP: set VYNTRA_FACTORY_ADDRESS before connecting an MCP client.')
}

void serveStdio(createServer)
