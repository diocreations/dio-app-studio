#!/usr/bin/env bun
/**
 * A tiny HTTP receiver for acceptance tests: it records what an alert webhook
 * or a backup heartbeat actually sent, so "an alert fired" is evidence instead
 * of a claim.
 *
 *   bun scripts/qa/webhook-sink.mjs [--port 8788] [--log /tmp/plattr-hooks.jsonl]
 *
 * Every request appends one JSON line with the method, path, headers of interest
 * and body. It answers 200 to everything.
 */
import fs from 'node:fs'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}
const port = Number(flag('port', '8788'))
const log = flag('log', '/tmp/plattr-hooks.jsonl')
fs.writeFileSync(log, '')

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url)
    const body = await request.text()
    fs.appendFileSync(
      log,
      JSON.stringify({
        at: new Date().toISOString(),
        method: request.method,
        path: url.pathname,
        search: url.search,
        contentType: request.headers.get('content-type'),
        body: body.slice(0, 2000),
      }) + '\n',
    )
    return new Response('ok')
  },
})

console.log(`webhook sink listening on http://127.0.0.1:${port}, logging to ${log}`)
