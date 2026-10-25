import { jsonCors, optionsOk } from '../../src/edge-cors.js'
export const config = { runtime: 'edge' }

export default async function handler(req?: Request) {
  if (req?.method === 'OPTIONS') return optionsOk()
  let libsql = 'not_loaded'
  try {
    await import('@libsql/client/web')
    libsql = 'ok'
  } catch (e) {
    libsql = e instanceof Error ? e.message : String(e)
  }
  return jsonCors({ ok: true, libsql })
}
