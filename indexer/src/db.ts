import { createClient, type Client, type InArgs } from '@libsql/client'
import { DATABASE_URL, DATABASE_AUTH_TOKEN, hasRemoteDatabase } from './config.js'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS launches (
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL,
  curve TEXT NOT NULL,
  splitter TEXT NOT NULL,
  creator TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  image_uri TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  created_block INTEGER NOT NULL DEFAULT 0,
  graduated INTEGER NOT NULL DEFAULT 0,
  migrated INTEGER NOT NULL DEFAULT 0,
  external_pair TEXT NOT NULL DEFAULT '',
  progress_bps INTEGER NOT NULL DEFAULT 0,
  raised_bot REAL NOT NULL DEFAULT 0,
  buy_tax_bps INTEGER NOT NULL DEFAULT 0,
  sell_tax_bps INTEGER NOT NULL DEFAULT 0,
  trade_count INTEGER NOT NULL DEFAULT 0,
  volume_bot REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id INTEGER NOT NULL,
  curve TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  trader TEXT NOT NULL,
  bot_amount REAL NOT NULL,
  token_amount REAL NOT NULL,
  fee REAL NOT NULL DEFAULT 0,
  price REAL NOT NULL,
  mcap REAL NOT NULL,
  block_number INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  UNIQUE (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_trades_launch_time ON trades(launch_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_curve ON trades(curve);
CREATE INDEX IF NOT EXISTS idx_trades_trader ON trades(trader);
CREATE INDEX IF NOT EXISTS idx_trades_launch_trader ON trades(launch_id, trader);

CREATE TABLE IF NOT EXISTS replies (
  launch_id INTEGER NOT NULL,
  reply_index INTEGER NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  tx_hash TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (launch_id, reply_index)
);
`

let _client: Client | null = null
let _ready: Promise<void> | null = null

export function getClient(): Client {
  if (_client) return _client
  if (!DATABASE_URL) {
    throw new Error(
      'Database URL missing. On Vercel set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.',
    )
  }
  if (process.env.VERCEL && !hasRemoteDatabase) {
    throw new Error(
      'file: SQLite is not supported on Vercel. Set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.',
    )
  }
  _client = createClient({
    url: DATABASE_URL,
    authToken: DATABASE_AUTH_TOKEN,
  })
  return _client
}

/** Ensure schema exists (safe to call often). */
export async function ensureSchema(): Promise<void> {
  if (_ready) return _ready
  _ready = (async () => {
    const db = getClient()
    // libsql execute supports multiple statements in some drivers; run chunked for safety
    for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) {
      await db.execute(stmt)
    }
  })()
  return _ready
}

export async function queryAll<T extends Record<string, unknown>>(
  sql: string,
  args: InArgs = [],
): Promise<T[]> {
  await ensureSchema()
  const rs = await getClient().execute({ sql, args: args as InArgs })
  return rs.rows.map((row) => {
    const out: Record<string, unknown> = {}
    for (const col of rs.columns) {
      out[col] = row[col]
    }
    return out as T
  })
}

export async function queryOne<T extends Record<string, unknown>>(
  sql: string,
  args: InArgs = [],
): Promise<T | undefined> {
  const rows = await queryAll<T>(sql, args)
  return rows[0]
}

export async function execute(
  sql: string,
  args: InArgs = [],
): Promise<{ rowsAffected: number }> {
  await ensureSchema()
  const rs = await getClient().execute({ sql, args: args as InArgs })
  return { rowsAffected: rs.rowsAffected }
}

export async function getMeta(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])
  return row?.value ?? null
}

export async function setMeta(key: string, value: string): Promise<void> {
  await execute(
    `INSERT INTO meta(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  )
}

export type LaunchRow = {
  id: number
  token: string
  curve: string
  splitter: string
  creator: string
  name: string
  symbol: string
  image_uri: string
  description: string
  created_at: number
  created_block: number
  graduated: number
  migrated: number
  external_pair: string
  progress_bps: number
  raised_bot: number
  buy_tax_bps: number
  sell_tax_bps: number
  trade_count: number
  volume_bot: number
  updated_at: number
}

export type TradeRow = {
  id: number
  launch_id: number
  curve: string
  side: 'buy' | 'sell'
  trader: string
  bot_amount: number
  token_amount: number
  fee: number
  price: number
  mcap: number
  block_number: number
  tx_hash: string
  log_index: number
  timestamp: number
}
