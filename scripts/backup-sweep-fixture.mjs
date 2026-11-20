#!/usr/bin/env bun
/**
 * Rehearse `scripts/backup-sweep.mjs` against a local bucket.
 *
 *   bun scripts/backup-sweep-fixture.mjs     # or: bun run backup:sweep:fixture
 *
 * The sweep deletes bytes, so its rules are worth re-running whenever it
 * changes. This builds a throwaway bucket holding one run per case, runs the
 * sweeper the way the workflow does (`--execute`, 360-minute window), and
 * asserts what survived. Nothing touches a remote bucket: the state lives under
 * `.wrangler/state`, and the fixture bucket is emptied before every run, so a
 * re-run starts from the same place.
 *
 * The cases:
 *
 *   A  a run whose index entry recorded `expected`, one of which was never
 *      uploaded. Only the uploaded keys go; the run is marked abandoned
 *   B  a run younger than the window: skipped, it may still be uploading
 *   C  a verified run: never touched
 *   D  a run already marked abandoned: never touched again
 *   E  a prefix the index does not name: never touched
 *   F  a run with no recorded list: only the fixed names go, and an object the
 *      run never claimed stays behind — the documented cost of not guessing
 *   G  a run claiming another run's key, a traversal key and the index: nothing
 *      is deleted, because a key must live under the claiming run's prefix
 *
 * A second sweep of the same bucket must delete nothing.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { findLocalBucket, readBucketObject, readBucketObjects } from './backup/lib.mjs'
import { createR2, wranglerMode } from './backup/r2.mjs'

const root = path.resolve(import.meta.dir, '..')
const stateDir = path.join(root, '.wrangler/state')
const bucket = 'plattr-sweep-fixture'
const work = path.join(os.tmpdir(), 'plattr-sweep-fixture')
const sweeper = path.join(root, 'scripts/backup-sweep.mjs')
const r2 = createR2({ bucket, mode: wranglerMode(false, stateDir) })

const at = (iso) => new Date(iso).toISOString()
const P = (id) => `plattr/runs/${id}`
const media = 'media/objects/projects/p1/media/aaa/320.webp'

const ids = {
  a: '20261101T000000Z-aaaaaaaa',
  young: '20261120T000000Z-bbbbbbbb',
  verified: '20261103T000000Z-cccccccc',
  swept: '20261104T000000Z-dddddddd',
  unindexed: '20261105T000000Z-eeeeeeee',
  bare: '20261106T000000Z-ffffffff',
  hostile: '20261107T000000Z-99999999',
}

function put(key, text) {
  const file = path.join(work, 'seed', key.replace(/[^a-z0-9]+/gi, '_'))
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  r2.put(key, file)
}

function bucketState() {
  try {
    return findLocalBucket(stateDir, bucket)
  } catch {
    return null
  }
}

fs.rmSync(work, { recursive: true, force: true })
fs.mkdirSync(work, { recursive: true })
const before = bucketState()
if (before) {
  const rows = readBucketObjects(before)
  // findLocalBucket scores buckets by whether a row's blob is in this bucket's
  // directory. That is what keeps an empty fixture bucket from being confused
  // with another local bucket, and it is also the check before deleting.
  const ours = rows.filter((row) => row.blob_id && fs.existsSync(path.join(before.blobs, row.blob_id)))
  if (ours.length === rows.length) {
    for (const row of rows) r2.remove(row.key)
    if (rows.length) console.log(`emptied ${bucket}: ${rows.length} objects from a previous run`)
  } else {
    console.log(`${bucket} holds no objects of its own; nothing to clear`)
  }
}

// A: the index names four keys; media/manifest.json was never reached. The run
// document deliberately carries no list, so only the index can sweep this.
const aExpected = [
  `${P(ids.a)}/run.json`,
  `${P(ids.a)}/database.sqlite`,
  `${P(ids.a)}/media/manifest.json`,
  `${P(ids.a)}/${media}`,
]
for (const key of [aExpected[0], aExpected[1], aExpected[3]])
  put(key, key.endsWith('run.json') ? JSON.stringify({ id: ids.a, status: 'pending' }) : `A ${key}`)

// B: still uploading as far as the age rule is concerned.
put(`${P(ids.young)}/database.sqlite`, 'B db')

// C: a verified run, which must never be touched.
const cFiles = [`${P(ids.verified)}/run.json`, `${P(ids.verified)}/database.sqlite`, `${P(ids.verified)}/${media}`]
for (const key of cFiles) put(key, `C ${key}`)

// D: already swept, so it must be ignored.
const dFiles = [`${P(ids.swept)}/run.json`, `${P(ids.swept)}/database.sqlite`]
for (const key of dFiles) put(key, `D ${key}`)

// E: a run prefix the index does not know about. Nothing may delete it.
const eFiles = [`${P(ids.unindexed)}/run.json`, `${P(ids.unindexed)}/database.sqlite`]
for (const key of eFiles) put(key, `E ${key}`)

// F: no recorded list. The fixed names exist, and so does an object only a
// layout guess could have found.
const fStray = `${P(ids.bare)}/${media}`
for (const key of [`${P(ids.bare)}/database.sqlite`, `${P(ids.bare)}/media/manifest.json`, fStray])
  put(key, `F ${key}`)

const createdAt = at('2026-11-01T00:00:00Z')
const index = {
  version: 1,
  runs: [
    { id: ids.young, createdAt: new Date().toISOString(), status: 'pending', expected: [`${P(ids.young)}/database.sqlite`], files: [] },
    { id: ids.a, createdAt: createdAt, status: 'pending', expected: aExpected, files: [] },
    { id: ids.verified, createdAt: createdAt, verifiedAt: createdAt, status: 'verified', files: cFiles },
    { id: ids.swept, createdAt: createdAt, status: 'abandoned', abandonedAt: at('2026-11-10T00:00:00Z'), files: dFiles },
    { id: ids.bare, createdAt: createdAt, status: 'pending', files: [] },
    {
      id: ids.hostile,
      createdAt: createdAt,
      status: 'pending',
      expected: [`${P(ids.verified)}/database.sqlite`, `${P(ids.hostile)}/../${ids.verified}/run.json`, 'plattr/index.json'],
      files: [],
    },
  ],
}
put('plattr/index.json', JSON.stringify(index, null, 2) + '\n')
console.log(`fixture written to ${bucket}`)

function sweep() {
  const result = spawnSync(
    'bun',
    [sweeper, '--local', '--persist-to', stateDir, '--backup-bucket', bucket, '--older-than', '360', '--execute'],
    { cwd: root, encoding: 'utf8' },
  )
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.status !== 0)
    throw new Error(`the sweeper exited ${result.status}: ${output.trim().split('\n').slice(-5).join(' ')}`)
  const start = (result.stdout ?? '').lastIndexOf('\n{\n  "bucket"')
  if (start < 0) throw new Error(`the sweeper printed no summary: ${output.trim().slice(-400)}`)
  return JSON.parse(result.stdout.slice(start + 1))
}

function state() {
  const found = bucketState()
  if (!found) throw new Error(`${bucket} is not in the local state directory`)
  const document = readBucketObject(found, 'plattr/index.json')
  return {
    keys: new Set(readBucketObjects(found).map((row) => row.key)),
    index: document?.bytes ? JSON.parse(document.bytes.toString('utf8')) : null,
  }
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail })
}

const first = sweep()
const swept = state()
const entry = (id) => swept.index?.runs.find((run) => run.id === id)

check(
  'A: every key it recorded is gone',
  aExpected.every((key) => !swept.keys.has(key)),
  'including the one it never uploaded',
)
check(
  'A: deletions and misses match the record',
  entry(ids.a)?.swept?.deleted === 3 && entry(ids.a)?.swept?.missing === 1,
  JSON.stringify(entry(ids.a)?.swept),
)
check('A: marked abandoned and kept in the index', entry(ids.a)?.status === 'abandoned')

check('B: young pending left alone', swept.keys.has(`${P(ids.young)}/database.sqlite`) && entry(ids.young)?.status === 'pending')
check('C: verified run untouched', cFiles.every((key) => swept.keys.has(key)) && entry(ids.verified)?.status === 'verified')
check('D: already-abandoned run untouched', dFiles.every((key) => swept.keys.has(key)))
check('D: its abandonedAt was not rewritten', entry(ids.swept)?.abandonedAt === at('2026-11-10T00:00:00Z'))
check('E: unindexed prefix untouched', eFiles.every((key) => swept.keys.has(key)))

check(
  'F: fixed names deleted',
  !swept.keys.has(`${P(ids.bare)}/database.sqlite`) && !swept.keys.has(`${P(ids.bare)}/media/manifest.json`),
)
check('F: the unclaimed object stayed', swept.keys.has(fStray))
check('F: marked abandoned, nothing guessed', entry(ids.bare)?.status === 'abandoned' && entry(ids.bare)?.swept?.deleted === 2)

check('G: nothing deleted outside the claiming prefix', entry(ids.hostile)?.swept?.deleted === 0)
check('G: the other run kept its database', swept.keys.has(`${P(ids.verified)}/database.sqlite`))
check('G: the index was not deleted', swept.keys.has('plattr/index.json'))
check('total deletions', first.deleted === 5, `summary.deleted = ${first.deleted}`)

const second = sweep()
const after = state()
check('second sweep deletes nothing', second.deleted === 0 && second.runs.length === 0)
check('second sweep leaves every survivor in place', [...after.keys].sort().join('\n') === [...swept.keys].sort().join('\n'))
check('the index still holds every attempt', after.index?.runs.length === 6)

for (const result of results)
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.detail ? `  (${result.detail})` : ''}`)
const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed in ${bucket}`)
if (failed.length) {
  console.error(`${failed.length} check(s) failed`)
  process.exitCode = 1
}
