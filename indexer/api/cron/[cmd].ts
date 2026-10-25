export const config = { runtime: 'edge' }

export default async function handler(req: Request) {
  try {
    const { handle } = await import('hono/vercel')
    const { createApp } = await import('../../src/api.js')
    const app = createApp({ basePath: '/api' })
    return handle(app)(req)
  } catch (e) {
    return Response.json(
      { error: 'boot_failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
