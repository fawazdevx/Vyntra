import { explorerTx, formatBot, shortAddr } from '../lib/config'
import type { TradePoint } from '../hooks/useTradeHistory'
import { botTestnet } from '../lib/chains'

type Props = {
  trades: TradePoint[]
  symbol: string
}

export function TradeTape({ trades, symbol }: Props) {
  const rows = [...trades].reverse().slice(0, 24)

  return (
    <div className="overflow-hidden rounded-xl border border-cyan-500/15 bg-[#08080c]">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3.5 sm:px-5">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-400/90">
          Recent trades
        </div>
        <div className="font-mono text-sm text-zinc-500">{rows.length} latest</div>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-12 text-center text-base text-zinc-500">No trades yet</div>
      ) : (
        <div className="max-h-[340px] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#0b0b10] text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-semibold sm:px-5">Side</th>
                <th className="px-2 py-3 font-semibold">BOT</th>
                <th className="px-2 py-3 font-semibold">{symbol}</th>
                <th className="px-2 py-3 font-semibold">Market cap</th>
                <th className="px-4 py-3 font-semibold text-right sm:px-5">Who</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  key={`${t.txHash}-${t.side}-${t.time}`}
                  className="border-t border-white/[0.05] hover:bg-white/[0.025]"
                >
                  <td
                    className={`px-4 py-3 text-sm font-semibold capitalize sm:px-5 ${
                      t.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {t.side}
                  </td>
                  <td className="px-2 py-3 font-mono text-zinc-200">{formatBot(t.amountBot)}</td>
                  <td className="px-2 py-3 font-mono text-zinc-400">{formatBot(t.amountToken)}</td>
                  <td className="px-2 py-3 font-mono text-zinc-400">{formatBot(t.mcap)}</td>
                  <td className="px-4 py-3 text-right sm:px-5">
                    <a
                      href={explorerTx(t.txHash, botTestnet.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-zinc-500 hover:text-violet-300"
                    >
                      {shortAddr(t.trader)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
