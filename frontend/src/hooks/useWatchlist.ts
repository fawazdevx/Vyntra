import { useCallback, useEffect, useState } from 'react'

const KEY = 'vyntra.watchlist.v1'

function readIds(): number[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(Number).filter((n) => Number.isFinite(n) && n > 0)
  } catch {
    return []
  }
}

function writeIds(ids: number[]) {
  localStorage.setItem(KEY, JSON.stringify([...new Set(ids)]))
}

/** Browser-local watchlist of launch ids. */
export function useWatchlist() {
  const [ids, setIds] = useState<number[]>([])

  useEffect(() => {
    setIds(readIds())
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setIds(readIds())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const isWatched = useCallback((id: number) => ids.includes(id), [ids])

  const toggle = useCallback((id: number) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      writeIds(next)
      return next
    })
  }, [])

  const add = useCallback((id: number) => {
    setIds((prev) => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      writeIds(next)
      return next
    })
  }, [])

  const remove = useCallback((id: number) => {
    setIds((prev) => {
      const next = prev.filter((x) => x !== id)
      writeIds(next)
      return next
    })
  }, [])

  return { ids, isWatched, toggle, add, remove, count: ids.length }
}
