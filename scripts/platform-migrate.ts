#!/usr/bin/env bun
/**
 * M0–M2 migration runner and evidence collector.
 *
 * Runs against a local SQLite file (the Miniflare D1 database) so the whole
 * rehearsal can happen without touching production: back up, snapshot, apply
 * M1, backfill M2, verify, roll back a copy, restore the backup.
 *
 * Production D1 uses the same statements through `ensureSchema`; this script
 * exists to run them deliberately, in order, with evidence, instead of on the
 * first request after a deploy.
 *
 * Usage:
 *   bun scripts/platform-migrate.ts backup [--dir <dir>]
 *   bun scripts/platform-migrate.ts snapshot --out <file>
 *   bun scripts/platform-migrate.ts apply
 *   bun scripts/platform-migrate.ts backfill
 *   bun scripts/platform-migrate.ts verify
 *   bun scripts/platform-migrate.ts rollback --db <file>
 *   bun scripts/platform-migrate.ts restore --from <dir> [--copy <file>]
 *   bun scripts/platform-migrate.ts r2 --out <file>
 */

import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { ensureSchema } from '../src/worker/db'
import {
  ensurePlatformSchema,
  platformSchemaState,
  rollbackPlatformSchema,
} from '../src/worker/platform/schema'
import {
  backfillProjectOrganizations,
  reconcileBackfill,
} from '../src/worker/platform/backfill'
import { verifyPlatformIntegrity } from '../src/worker/platform/integrity'
import { diffSnapshots, legacySnapshot, type LegacySnapshot } from '../src/worker/platform/snapshot'

const ROOT = resolve(import.meta.dir, '..')
const DEFAULT_DB = join(
  ROOT,
  '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/017f96ff90c988f5b934d2789b404a0a0f513de2918297f1afba6b3581b20f80.sqlite',
)
const R2_ROOT = join(ROOT, '.wrangler/state/v3/r2')

type Args = Record<string, string | boolean>

function args(argv: string[]): Args {
  const out: Args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!
    if (!value.startsWith('--')) continue
    const name = value.slice(2)
    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      out[name] = next
      index += 1
    } else {
      out[name] = true
    }
  }
  return out
}

/** Minimal D1 adapter over a SQLite file, matching the production binding. */
class FileD1 {
  readonly db: Database

  constructor(path: string) {
    this.db = new Database(path)
    this.db.exec('PRAGMA busy_timeout = 5000')
  }

  prepare(sql: string) {
    const run = (params: unknown[]) => {
      const result = this.db.prepare(sql).run(...(params as never[]))
      return { success: true, meta: { changes: Number(result.changes) } }
    }
    const first = (params: unknown[]) => this.db.prepare(sql).get(...(params as never[])) ?? null
    const all = (params: unknown[]) => ({
      results: this.db.prepare(sql).all(...(params as never[])),
    })
    const bound = (params: unknown[]) => ({
      __run: () => run(params),
      run: async () => run(params),
      first: async () => first(params),
      all: async () => all(params),
    })
    return {
      bind: (...params: unknown[]) => bound(params),
      __run: () => run([]),
      run: async () => run([]),
      first: async () => first([]),
      all: async () => all([]),
    }
  }

  async batch(statements: { __run?: () => unknown; run: () => Promise<unknown> }[]) {
    this.db.exec('BEGIN')
    try {
      const results = statements.map((statement) =>
        statement.__run ? statement.__run() : statement.run(),
      )
      this.db.exec('COMMIT')
      return results
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  close() {
    this.db.close()
  }
}

function open(dbPath: string): { file: FileD1; db: D1Database } {
  const file = new FileD1(dbPath)
  return { file, db: file as unknown as D1Database }
}

function print(value: unknown) {
  console.log(JSON.stringify(value, null, 2))
}

function dbPath(parsed: Args): string {
  return typeof parsed.db === 'string' ? resolve(parsed.db) : DEFAULT_DB
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function walk(dir: string, base = dir): { path: string; bytes: number; sha256: string }[] {
  if (!existsSync(dir)) return []
  const out: { path: string; bytes: number; sha256: string }[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, base))
    else {
      const stat = statSync(full)
      out.push({ path: full.slice(base.length + 1), bytes: stat.size, sha256: sha256File(full) })
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

function r2Manifest() {
  const objects = walk(join(R2_ROOT, 'plattr-media', 'blobs'))
  return {
    at: new Date().toISOString(),
    root: '.wrangler/state/v3/r2/plattr-media/blobs',
    objects: objects.length,
    bytes: objects.reduce((total, entry) => total + entry.bytes, 0),
    digest: createHash('sha256')
      .update(objects.map((entry) => `${entry.path}:${entry.sha256}`).join('|'))
      .digest('hex'),
    files: objects,
  }
}

async function snapshotFile(db: D1Database): Promise<LegacySnapshot> {
  return legacySnapshot(db)
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const parsed = args(rest)

  if (command === 'backup') {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const dir =
      typeof parsed.dir === 'string'
        ? resolve(parsed.dir)
        : join(ROOT, '.wrangler/backups', `platform-m0-m2-${stamp}`)
    mkdirSync(dir, { recursive: true })

    const source = dbPath(parsed)
    for (const suffix of ['', '-wal', '-shm']) {
      const from = `${source}${suffix}`
      if (existsSync(from)) copyFileSync(from, join(dir, `d1.sqlite${suffix}`))
    }
    const r2 = r2Manifest()
    writeFileSync(join(dir, 'r2.json'), JSON.stringify(r2, null, 2))

    // Snapshot the copy as-is. Running the schema step here would migrate the
    // backup, which is exactly what a restore point must not be.
    const { db, file } = open(join(dir, 'd1.sqlite'))
    const snapshot = await snapshotFile(db)
    file.close()

    const manifest = { at: new Date().toISOString(), source, dir, snapshot, r2: { objects: r2.objects, bytes: r2.bytes, digest: r2.digest } }
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
    print({ dir, counts: snapshot.counts, combined: snapshot.combined, r2: manifest.r2 })
    return
  }

  if (command === 'snapshot') {
    const { db, file } = open(dbPath(parsed))
    const snapshot = await snapshotFile(db)
    file.close()
    if (typeof parsed.out === 'string') writeFileSync(resolve(parsed.out), JSON.stringify(snapshot, null, 2))
    print(snapshot)
    return
  }

  if (command === 'apply') {
    const { db, file } = open(dbPath(parsed))
    const before = await platformSchemaState(db)
    await ensureSchema(db)
    const after = await platformSchemaState(db)
    file.close()
    print({ before, after })
    return
  }

  if (command === 'backfill') {
    const { db, file } = open(dbPath(parsed))
    await ensurePlatformSchema(db)
    const report = await backfillProjectOrganizations(db)
    const reconciliation = await reconcileBackfill(db)
    file.close()
    print({ report, reconciliation })
    return
  }

  if (command === 'verify') {
    const { db, file } = open(dbPath(parsed))
    const report = await verifyPlatformIntegrity(db)
    file.close()
    print(report)
    return
  }

  if (command === 'rollback') {
    const { db, file } = open(dbPath(parsed))
    const result = await rollbackPlatformSchema(db)
    const state = await platformSchemaState(db)
    file.close()
    print({ result, state })
    return
  }

  if (command === 'restore') {
    const from = typeof parsed.from === 'string' ? resolve(parsed.from) : ''
    if (!from) throw new Error('restore needs --from <backup dir>')
    const manifest = JSON.parse(readFileSync(join(from, 'manifest.json'), 'utf8')) as {
      snapshot: LegacySnapshot
      r2: { objects: number; bytes: number; digest: string }
    }
    const copy =
      typeof parsed.copy === 'string' ? resolve(parsed.copy) : join(from, 'restore-rehearsal.sqlite')
    copyFileSync(join(from, 'd1.sqlite'), copy)

    const { db, file } = open(copy)
    const integrity = await file.db.prepare('PRAGMA integrity_check').all()
    const fkViolations = await file.db.prepare('PRAGMA foreign_key_check').all()
    const restored = await snapshotFile(db)
    const diff = diffSnapshots(manifest.snapshot, restored)
    const r2 = r2Manifest()
    file.close()
    print({
      copy,
      integrity,
      foreignKeyViolations: fkViolations.length,
      countsMatch: diff.countChanges.length === 0,
      digestMatch: diff.preserved,
      diff,
      r2Matches: r2.digest === manifest.r2.digest && r2.objects === manifest.r2.objects,
      r2: { objects: r2.objects, bytes: r2.bytes, digest: r2.digest },
    })
    return
  }

  if (command === 'r2') {
    const manifest = r2Manifest()
    if (typeof parsed.out === 'string') writeFileSync(resolve(parsed.out), JSON.stringify(manifest, null, 2))
    print(manifest)
    return
  }

  if (command === 'compare') {
    const before = JSON.parse(readFileSync(resolve(String(parsed.before)), 'utf8')) as LegacySnapshot
    const after = JSON.parse(readFileSync(resolve(String(parsed.after)), 'utf8')) as LegacySnapshot
    print({ before: before.counts, after: after.counts, diff: diffSnapshots(before, after) })
    return
  }

  throw new Error(
    `unknown command: ${command ?? '(none)'} — use backup|snapshot|apply|backfill|verify|rollback|restore|r2|compare`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
