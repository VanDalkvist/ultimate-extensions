import { DatabaseSync } from 'node:sqlite'
import { chmodSync, closeSync, mkdirSync, openSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_PINS } from './types.ts'
import type { ProviderUsage } from './types.ts'

export function openDatabase(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  closeSync(openSync(path, 'a', 0o600))
  chmodSync(path, 0o600)
  const db = new DatabaseSync(path)
  db.exec(`
      CREATE TABLE IF NOT EXISTS usage (
        key TEXT PRIMARY KEY, snapshot TEXT, checked INTEGER NOT NULL DEFAULT 0,
        next INTEGER NOT NULL DEFAULT 0, retry INTEGER NOT NULL DEFAULT 0,
        lease TEXT, leaseUntil INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS pins (key TEXT PRIMARY KEY, enabled INTEGER NOT NULL);
    `)
  return db
}

export class UsageCache {
  private db: DatabaseSync

  constructor(db: DatabaseSync) {
    this.db = db
  }

  read(key: string): ProviderUsage | undefined {
    const row = this.db.prepare('SELECT snapshot FROM usage WHERE key = ?').get(key)
    return typeof row?.snapshot === 'string'
      ? (JSON.parse(row.snapshot) as ProviderUsage)
      : undefined
  }

  claim(key: string, now: number, force: boolean): string | undefined {
    const lease = randomUUID()
    const row = this.db
      .prepare(`
      INSERT INTO usage(key, lease, leaseUntil) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET lease = excluded.lease, leaseUntil = excluded.leaseUntil
      WHERE usage.leaseUntil <= ? AND usage.retry <= ?
        AND CASE WHEN ? THEN usage.checked + 30000 <= ? ELSE usage.next <= ? END
      RETURNING lease
    `)
      .get(key, lease, now + 30000, now, now, force ? 1 : 0, now, now)
    return row ? lease : undefined
  }

  finish(key: string, lease: string, snapshot: ProviderUsage, now: number, retryAt = 0) {
    this.db
      .prepare(`UPDATE usage SET snapshot = ?, checked = ?, next = ?, retry = ?,
      lease = NULL, leaseUntil = 0 WHERE key = ? AND lease = ?`)
      .run(JSON.stringify(snapshot), now, now + 300000, retryAt, key, lease)
  }

  release(key: string, lease: string) {
    this.db
      .prepare('UPDATE usage SET lease = NULL, leaseUntil = 0 WHERE key = ? AND lease = ?')
      .run(key, lease)
  }

  pins(): string[] {
    const pins = new Set(DEFAULT_PINS)
    for (const row of this.db.prepare('SELECT key, enabled FROM pins').all()) {
      if (row.enabled) pins.add(String(row.key))
      else pins.delete(String(row.key))
    }
    return [...pins]
  }

  pin(key: string, on: boolean) {
    this.db
      .prepare(
        'INSERT INTO pins(key, enabled) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled',
      )
      .run(key, on ? 1 : 0)
  }

  close() {
    this.db.close()
  }
}
