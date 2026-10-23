import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { DB_PATH } from './config.js'

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

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.exec(SCHEMA)
  return _db
}

export function getMeta(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setMeta(key: string, value: string) {
  getDb()
    .prepare(
      `INSERT INTO meta(key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value)
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
