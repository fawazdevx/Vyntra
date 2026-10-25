import { FACTORY_ADDRESS, SYNC_STALE_SEC } from './config.js'
import { ensureSchema, getMeta } from './db.js'

let syncInFlight: Promise<void> | null = null

/** Refresh the shared index from Vercel's direct Edge API routes when stale. */
export async function maybeSyncEdge(): Promise<void> {
  if (!FACTORY_ADDRESS) return
  try {
    await ensureSchema()
  } catch (error) {
    // Let the API handler return its normal database-unavailable response.
    console.error('[indexer] edge schema error', error)
    return
  }

  if (syncInFlight) {
    await syncInFlight
    return
  }

  const last = await getMeta('last_sync_at')
  const lastAt = Number(last)
  const now = Math.floor(Date.now() / 1000)
  if (last && Number.isFinite(lastAt) && now - lastAt < SYNC_STALE_SEC) return

  syncInFlight = (async () => {
    try {
      const { syncOnce } = await import('./sync.js')
      await syncOnce()
    } catch (error) {
      // Keep read APIs available if the RPC provider is temporarily unhealthy.
      console.error('[indexer] edge maybeSync error', error)
    } finally {
      syncInFlight = null
    }
  })()

  await syncInFlight
}
