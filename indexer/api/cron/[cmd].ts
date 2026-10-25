import { jsonCors, optionsOk } from '../../src/edge-cors.js'
export const config = { runtime: 'edge' }

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return optionsOk()
  const url = new URL(req.url)
  if (!url.pathname.endsWith('/sync') && !url.pathname.endsWith('/cron/sync')) {
    // /api/cron/sync
  }
  const auth = req.headers.get('authorization') || ''
  const secret = process.env.CRON_SECRET || ''
  if (secret && auth !== `Bearer ${secret}`) {
    // Vercel Cron does not send Bearer by default on Hobby — allow if CRON_SECRET unset
    if (secret) return new Response('Unauthorized', { status: 401 })
  }
  try {
    const { ensureSchema } = await import('../../src/db.js')
    const { syncOnce } = await import('../../src/sync.js')
    await ensureSchema()
    const r = await syncOnce()
    return jsonCors({
      ok: true,
      from: r.from.toString(),
      to: r.to.toString(),
      launches: r.launches,
      trades: r.trades,
    })
  } catch (e) {
    return jsonCors(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
