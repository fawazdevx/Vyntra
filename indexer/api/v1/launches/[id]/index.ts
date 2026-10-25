import { qOne } from '../../../../src/edge-db.js'

export const config = { runtime: 'edge' }

function launchJson(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    token: row.token,
    curve: row.curve,
    splitter: row.splitter,
    creator: row.creator,
    name: row.name,
    symbol: row.symbol,
    imageURI: row.image_uri,
    description: row.description,
    createdAt: Number(row.created_at) * 1000,
    progressBps: Number(row.progress_bps),
    raisedBot: Number(row.raised_bot),
    graduated: Boolean(Number(row.graduated)),
    migrated: Boolean(Number(row.migrated)),
    externalPair: row.external_pair,
    buyTaxBps: Number(row.buy_tax_bps),
    sellTaxBps: Number(row.sell_tax_bps),
    tradeCount: Number(row.trade_count),
    volumeBot: Number(row.volume_bot),
    updatedAt: Number(row.updated_at),
  }
}

export default async function handler(req: Request) {
  try {
    const parts = new URL(req.url).pathname.split('/').filter(Boolean)
    const id = Number(parts[parts.indexOf('launches') + 1])
    const row = await qOne('SELECT * FROM launches WHERE id = ?', [id])
    if (!row) return Response.json({ error: 'not_found' }, { status: 404 })
    return Response.json({ launch: launchJson(row) })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
