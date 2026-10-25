export const config = { runtime: 'edge' }

export default async function handler(req: Request) {
  try {
    const parts = new URL(req.url).pathname.split('/').filter(Boolean)
    const address = parts[parts.indexOf('wallets') + 1]
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return Response.json({ error: 'invalid_address' }, { status: 400 })
    }
    const { getPortfolio } = await import('../../../../src/portfolio.js')
    const data = await getPortfolio(address)
    return Response.json({
      ...data,
      source: 'curve_trades',
      note: 'PnL uses average cost basis; mark price is last curve trade.',
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
