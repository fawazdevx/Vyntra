export const config = { runtime: 'edge' }

export default async function handler(req: Request) {
  try {
    const u = new URL(req.url)
    const parts = u.pathname.split('/').filter(Boolean)
    const address = parts[parts.indexOf('wallets') + 1]
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return Response.json({ error: 'invalid_address' }, { status: 400 })
    }
    const limit = Math.min(Number(u.searchParams.get('limit') || 200), 2000)
    const { getWalletTrades } = await import('../../../../src/portfolio.js')
    return Response.json(await getWalletTrades(address, limit))
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
