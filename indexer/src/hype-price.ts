// Hyperliquid's HYPE token on HyperEVM is the reference price for Elysium's
// native HYPE. Elysium testnet HYPE itself is a faucet token with no market price.
const HYPE_REFERENCE_ADDRESS = '0x0d01dc56dcaaca66ad901c959b4011ec'
const CACHE_TTL_MS = 60_000
const STALE_TTL_MS = 10 * 60_000

export type HypeUsdPrice = {
  priceUsd: number
  source: 'geckoterminal'
  referenceToken: 'HYPE'
  referenceNetwork: 'Hyperliquid'
  updatedAt: number
}

let cached: HypeUsdPrice | null = null
let inFlight: Promise<HypeUsdPrice> | null = null

/** Fetch the Hyperliquid mainnet HYPE/USD reference price, cached per process. */
export async function getHypeUsdPrice(): Promise<HypeUsdPrice> {
  const now = Date.now()
  if (cached && now - cached.updatedAt < CACHE_TTL_MS) return cached
  if (inFlight) return inFlight

  inFlight = (async () => {
    const endpoint = `https://api.geckoterminal.com/api/v2/simple/networks/hyperliquid/token_price/${HYPE_REFERENCE_ADDRESS}`
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json;version=20230203' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error(`GeckoTerminal returned ${response.status}`)

    const body = (await response.json()) as {
      data?: { attributes?: { token_prices?: Record<string, string> } }
    }
    const raw = body.data?.attributes?.token_prices?.[HYPE_REFERENCE_ADDRESS]
    const priceUsd = Number(raw)
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
      throw new Error('GeckoTerminal returned no valid HYPE price')
    }

    cached = {
      priceUsd,
      source: 'geckoterminal',
      referenceToken: 'HYPE',
      referenceNetwork: 'Hyperliquid',
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
