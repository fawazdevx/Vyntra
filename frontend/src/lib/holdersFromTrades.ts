import type { TradePoint } from '../hooks/useTradeHistory'
import type { HoldersPayload, SnipersPayload } from './indexer'

function classify(pctOfCirc: number): 'whale' | 'dolphin' | 'shrimp' {
  if (pctOfCirc >= 1) return 'whale'
  if (pctOfCirc >= 0.1) return 'dolphin'
  return 'shrimp'
}

function emptyCluster() {
  return { count: 0, balance: 0, pct: 0 }
}

function concentration(balances: number[], circ: number, n: number) {
  if (circ <= 0) return 0
  return (balances.slice(0, n).reduce((a, b) => a + b, 0) / circ) * 100
}

/** Build holder / sniper analytics from a trade tape (curve or platform market). */
export function holdersFromTrades(
  trades: TradePoint[],
  limit = 100,
): HoldersPayload {
  type Acc = {
    address: string
    bought: number
    sold: number
    spentBot: number
    receivedBot: number
    tradeCount: number
    firstTradeAt: number
    lastTradeAt: number
  }
  const by = new Map<string, Acc>()

  for (const t of trades) {
    const key = t.trader.toLowerCase()
    let acc = by.get(key)
    if (!acc) {
      acc = {
        address: t.trader,
        bought: 0,
        sold: 0,
        spentBot: 0,
        receivedBot: 0,
        tradeCount: 0,
        firstTradeAt: t.time,
        lastTradeAt: t.time,
      }
      by.set(key, acc)
    }
    acc.tradeCount += 1
    acc.lastTradeAt = Math.max(acc.lastTradeAt, t.time)
    acc.firstTradeAt = Math.min(acc.firstTradeAt, t.time)
    if (t.side === 'buy') {
      acc.bought += t.amountToken
      acc.spentBot += t.amountBot
    } else {
      acc.sold += t.amountToken
      acc.receivedBot += t.amountBot
    }
  }

  const nets = [...by.values()]
    .map((a) => ({
      ...a,
      balance: Math.max(a.bought - a.sold, 0),
    }))
    .filter((a) => a.balance > 1e-12)
    .sort((a, b) => b.balance - a.balance)

  const circulating = nets.reduce((s, n) => s + n.balance, 0)
  const balances = nets.map((n) => n.balance)
  const clusters = {
    whale: emptyCluster(),
    dolphin: emptyCluster(),
    shrimp: emptyCluster(),
  }

  const holders = nets.map((n) => {
    const pct = circulating > 0 ? (n.balance / circulating) * 100 : 0
    const cluster = classify(pct)
    clusters[cluster].count += 1
    clusters[cluster].balance += n.balance
    return {
      address: n.address,
      balance: n.balance,
      bought: n.bought,
      sold: n.sold,
      spentBot: n.spentBot,
      receivedBot: n.receivedBot,
      tradeCount: n.tradeCount,
      firstTradeAt: n.firstTradeAt,
      lastTradeAt: n.lastTradeAt,
      pct,
      cluster,
    }
  })

  for (const key of Object.keys(clusters) as Array<keyof typeof clusters>) {
    clusters[key].pct = circulating > 0 ? (clusters[key].balance / circulating) * 100 : 0
  }

  return {
    launchId: 0,
    source: 'market_trades',
    note: 'Balances are net buys − sells on this market (wallet transfers ignored).',
    holders: holders.slice(0, Math.min(Math.max(limit, 1), 500)),
    summary: {
      holderCount: holders.length,
      circulating,
      top1Pct: concentration(balances, circulating, 1),
      top5Pct: concentration(balances, circulating, 5),
      top10Pct: concentration(balances, circulating, 10),
      top20Pct: concentration(balances, circulating, 20),
      clusters,
    },
  }
}

export function snipersFromTrades(
  trades: TradePoint[],
  limit = 20,
): SnipersPayload {
  const buys = [...trades]
    .filter((t) => t.side === 'buy')
    .sort((a, b) => a.time - b.time || a.txHash.localeCompare(b.txHash))

  const seen = new Set<string>()
  const early: string[] = []
  for (const t of buys) {
    const k = t.trader.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    early.push(t.trader)
    if (early.length >= limit) break
  }

  const holders = holdersFromTrades(trades, 500)
  const circulating = holders.summary.circulating
  const byAddr = new Map(holders.holders.map((h) => [h.address.toLowerCase(), h]))

  // Also include snipers who fully dumped (not in holders list)
  type Agg = {
    bought: number
    sold: number
    spent: number
    received: number
    firstBuyAt: number
  }
  const agg = new Map<string, Agg>()
  for (const t of trades) {
    const k = t.trader.toLowerCase()
    let a = agg.get(k)
    if (!a) {
      a = { bought: 0, sold: 0, spent: 0, received: 0, firstBuyAt: Number.MAX_SAFE_INTEGER }
      agg.set(k, a)
    }
    if (t.side === 'buy') {
      a.bought += t.amountToken
      a.spent += t.amountBot
      a.firstBuyAt = Math.min(a.firstBuyAt, t.time)
    } else {
      a.sold += t.amountToken
      a.received += t.amountBot
    }
  }

  const snipers = early.map((address, i) => {
    const a = agg.get(address.toLowerCase())
    const boughtToken = a?.bought || 0
    const soldToken = a?.sold || 0
    const heldToken = Math.max(boughtToken - soldToken, 0)
    const dumpBps =
      boughtToken > 0 ? Math.min(10_000, Math.round((soldToken / boughtToken) * 10_000)) : 0
    const h = byAddr.get(address.toLowerCase())
    return {
      address,
      rank: i + 1,
      firstBuyAt: a?.firstBuyAt === Number.MAX_SAFE_INTEGER ? 0 : a?.firstBuyAt || 0,
      firstBuyBlock: 0,
      boughtToken,
      soldToken,
      heldToken,
      spentBot: a?.spent || 0,
      receivedBot: a?.received || 0,
      dumpBps,
      stillHolding: heldToken > 1e-12,
      pctOfCirculating: circulating > 0 ? (heldToken / circulating) * 100 : h?.pct || 0,
    }
  })

  const totalSpentBot = snipers.reduce((s, x) => s + x.spentBot, 0)
  const totalHeldToken = snipers.reduce((s, x) => s + x.heldToken, 0)

  return {
    launchId: 0,
    source: 'market_trades',
    note: 'Snipers = first N unique buyers by time. Dump rate uses later sells.',
    window: { uniqueBuyers: limit, earlySeconds: 0 },
    snipers,
    summary: {
      sniperCount: snipers.length,
      stillHolding: snipers.filter((s) => s.stillHolding).length,
      fullyDumped: snipers.filter((s) => !s.stillHolding && s.boughtToken > 0).length,
      totalSpentBot,
      totalHeldToken,
      heldPctOfCirculating: circulating > 0 ? (totalHeldToken / circulating) * 100 : 0,
      avgDumpBps:
        snipers.length > 0
          ? Math.round(snipers.reduce((s, x) => s + x.dumpBps, 0) / snipers.length)
          : 0,
    },
  }
}
