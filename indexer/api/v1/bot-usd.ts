import { getBotUsdPrice } from '../../src/bot-price.js'
import { jsonCors, optionsOk } from '../../src/edge-cors.js'

export const config = { runtime: 'edge' }

export default async function handler(req?: Request) {
  if (req?.method === 'OPTIONS') return optionsOk()

  try {
    const price = await getBotUsdPrice()
    return jsonCors(price, {
      headers: {
        'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    return jsonCors(
      { error: 'bot_price_unavailable', detail: error instanceof Error ? error.message : String(error) },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
