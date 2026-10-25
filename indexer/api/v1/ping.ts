export const config = { runtime: 'edge' }

export default async function handler() {
  let libsql = 'not_loaded'
  try {
    await import('@libsql/client/web')
    libsql = 'ok'
  } catch (e) {
    libsql = e instanceof Error ? e.message : String(e)
  }
  return Response.json({ ok: true, libsql })
}
