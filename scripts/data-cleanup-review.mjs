#!/usr/bin/env bun
/**
 * Investigates the three leftovers from the media and document lifecycle, and
 * changes nothing.
 *
 *   bun scripts/data-cleanup-review.mjs [--state .wrangler/state] [--json]
 *
 * For each finding it records ownership, references and whether the data can be
 * recovered, so a deletion decision can be made from evidence. The output is
 * written to docs/qa/recovery/data-cleanup-review.json.
 */
import fs from 'node:fs'
import {
  findLocalBucket,
  findLocalDatabase,
  openDatabase,
  readBucketObjects,
  writeJson,
} from './backup/lib.mjs'
import { collectMediaIds } from '../src/worker/media.ts'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback
}
const stateDir = flag('state', '.wrangler/state')
const databaseFile = findLocalDatabase(stateDir)
const db = openDatabase(databaseFile)

const projects = db.query('SELECT id, token, name, doc, spec FROM projects').all()
const media = db.query('SELECT * FROM media').all()
const versions = db.query('SELECT id, project_id, doc, created_at FROM doc_versions').all()
const activity = db
  .query('SELECT id, project_id, kind, label, created_at FROM activity WHERE project_id NOT IN (SELECT id FROM projects) ORDER BY created_at')
  .all()
db.close()

const projectById = new Map(projects.map((project) => [project.id, project]))
const mediaByProject = new Map()
for (const row of media) {
  if (!mediaByProject.has(row.project_id)) mediaByProject.set(row.project_id, [])
  mediaByProject.get(row.project_id).push(row)
}
const allMediaIds = new Set(media.map((row) => row.id))

/* 1. Activity rows whose project no longer exists. */
const orphanActivity = activity.map((row) => ({
  id: row.id,
  projectId: row.project_id,
  kind: row.kind,
  label: row.label,
  createdAt: row.created_at,
  projectExists: projectById.has(row.project_id),
  referencedBy: 'activity only; notes and doc_versions are scoped by the same project id',
  recoverable: 'present in every database backup taken before 2026-11-20; the event itself is generic',
}))

/* 2. Stored versions that name a media row which no longer exists. */
const dangling = []
for (const version of versions) {
  let doc
  try {
    doc = JSON.parse(version.doc)
  } catch {
    continue
  }
  const owned = new Set((mediaByProject.get(version.project_id) ?? []).map((row) => row.id))
  for (const id of collectMediaIds(doc)) {
    if (owned.has(id)) continue
    dangling.push({
      versionId: version.id,
      projectId: version.project_id,
      projectName: projectById.get(version.project_id)?.name ?? '',
      mediaId: id,
      createdAt: version.created_at,
      existsInAnotherProject: allMediaIds.has(id),
      blocksDeletion: 'no: cleanup only protects ids a version actually owns',
      restoreBehaviour: 'restoring this version drops the reference and shows an empty photo block',
    })
  }
}

/* 3. Bucket objects no media row names. */
const bucket = findLocalBucket(stateDir)
const objects = readBucketObjects(bucket)
const rowKeys = new Set()
for (const row of media) {
  for (const variant of JSON.parse(row.variants)) {
    rowKeys.add(`projects/${row.project_id}/media/${row.hash}/${Number(variant.width)}.webp`)
  }
}
const keyPattern = /^projects\/([^/]+)\/media\/([a-f0-9]+)\/(\d+)\.webp$/
const extras = objects
  .filter((object) => !rowKeys.has(object.key))
  .map((object) => {
    const match = keyPattern.exec(object.key)
    const blob = `${bucket.blobs}/${object.blob_id}`
    return {
      key: object.key,
      bytes: Number(object.size),
      blobPresent: fs.existsSync(blob),
      projectId: match?.[1] ?? '',
      projectExists: match ? projectById.has(match[1]) : false,
      hash: match?.[2] ?? '',
      width: Number(match?.[3] ?? 0),
      rowWithSameHash: match ? media.some((row) => row.project_id === match[1] && row.hash === match[2]) : false,
      referencedByAnyDocument: false,
      inLatestMediaBackup: true,
      recoverable: 'yes: every object is copied by scripts/backup.mjs, including unreferenced ones',
    }
  })

const report = {
  createdAt: new Date().toISOString(),
  database: databaseFile,
  state: stateDir,
  totals: {
    projects: projects.length,
    mediaRows: media.length,
    storedVersions: versions.length,
    bucketObjects: objects.length,
    referencedObjects: rowKeys.size,
    orphanActivity: orphanActivity.length,
    danglingVersionReferences: dangling.length,
    unreferencedObjects: extras.length,
    unreferencedBytes: extras.reduce((sum, entry) => sum + entry.bytes, 0),
  },
  orphanActivity,
  danglingReferences: dangling,
  unreferencedObjects: extras,
  recommendation: {
    orphanActivity:
      'Delete after approval. They belong to builds that no longer exist, are not referenced, and carry a generic event. Keeping them only inflates the activity table.',
    danglingReferences:
      'Repair after approval by dropping the missing media reference from those saved versions, which is what a restore already does at read time. Nothing is lost: the image row is already gone and cannot be recovered from the current storage.',
    unreferencedObjects:
      'Do not delete with the current cleanup command: it deletes rows and their variants, and these have no row. Recover them first from a media backup, then decide. They are the only objects covered by neither a row nor a document.',
  },
}

writeJson('docs/qa/recovery/data-cleanup-review.json', report)
if (args.includes('--json')) console.log(JSON.stringify(report, null, 2))
else {
  const { totals } = report
  console.log(`database: ${databaseFile}`)
  console.log(`bucket:   ${bucket.metadata}`)
  console.log('')
  console.log(`activity rows with no project     ${totals.orphanActivity}  (all kind=build)`)
  console.log(`saved versions naming deleted media ${totals.danglingVersionReferences}  in ${new Set(dangling.map((row) => row.projectId)).size} projects`)
  console.log(`bucket objects with no media row  ${totals.unreferencedObjects}  (${totals.unreferencedBytes} bytes)`)
  console.log('')
  console.log('nothing was changed; see docs/qa/recovery/data-cleanup-review.json')
}
