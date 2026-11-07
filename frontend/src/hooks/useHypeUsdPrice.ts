import { useQuery } from '@tanstack/react-query'
import { fetchHypeUsdPriceFromIndexer, isIndexerConfigured } from '../lib/indexer'

export function useHypeUsdPrice() {
  return useQuery({
    queryKey: ['vyntra', 'hype-usd-price'],
    queryFn: fetchHypeUsdPriceFromIndexer,
    enabled: isIndexerConfigured,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  })
}
