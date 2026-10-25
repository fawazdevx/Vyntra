const WBOT_ADDRESS = '0xd5452816194a3784dba983426cce7c122f4abd30'
const CACHE_TTL_MS = 60_000
const STALE_TTL_MS = 10 * 60_000

export type BotUsdPrice = {
  priceUsd: number
  source: 'geckoterminal'
  referenceToken: 'WBOT'
  referenceChainId: 677
  updatedAt: number
}

let cached: BotUsdPrice | null = null
let inFlight: Promise<BotUsdPrice> | null = null

/** Fetch the BOT Chain mainnet WBOT/USD reference price, cached per process. */
export async function getBotUsdPrice(): Promise<BotUsdPrice> {
  const now = Date.now()
  if (cached && now - cached.updatedAt < CACHE_TTL_MS) return cached
  if (inFlight) return inFlight

  inFlight = (async () => {
    const endpoint = `https://api.geckoterminal.com/api/v2/simple/networks/bot-chain/token_price/${WBOT_ADDRESS}`
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json;version=20230203' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error(`GeckoTerminal returned ${response.status}`)

    const body = (await response.json()) as {
      data?: { attributes?: { token_prices?: Record<string, string> } }
    }
    const raw = body.data?.attributes?.token_prices?.[WBOT_ADDRESS]
    const priceUsd = Number(raw)
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
      throw new Error('GeckoTerminal returned no valid WBOT price')
    }

    cached = {
      priceUsd,
      source: 'geckoterminal',
      referenceToken: 'WBOT',
      referenceChainId: 677,
      updatedAt: Date.now(),
    }
    return cached
  })()

  try {
    return await inFlight
  } catch (error) {
    if (cached && Date.now() - cached.updatedAt < STALE_TTL_MS) return cached
    throw error
  } finally {
    inFlight = null
  }
}
