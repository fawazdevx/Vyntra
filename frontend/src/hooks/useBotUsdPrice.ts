import { useQuery } from '@tanstack/react-query'
import { fetchBotUsdPriceFromIndexer, isIndexerConfigured } from '../lib/indexer'

export function useBotUsdPrice() {
  return useQuery({
    queryKey: ['vyntra', 'bot-usd-price'],
    queryFn: fetchBotUsdPriceFromIndexer,
    enabled: isIndexerConfigured,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  })
}
