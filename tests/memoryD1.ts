import { Database } from 'bun:sqlite'

/**
 * A small D1-compatible adapter over bun:sqlite. The production allocator is
 * an atomic counter UPDATE, so tests exercise the real SQL and the real
 * createProject path rather than a reimplementation.
 */
export class MemoryD1 {
  private db = new Database(':memory:')

  prepare(sql: string) {
    const run = (params: unknown[]) => {
      this.db.prepare(sql).run(...(params as never[]))
      return { success: true, meta: {} }
    }
    const first = (params: unknown[]) => this.db.prepare(sql).get(...(params as never[])) ?? null
    const all = (params: unknown[]) => ({ results: this.db.prepare(sql).all(...(params as never[])) })
    const bound = (params: unknown[]) => ({
      run: async () => run(params),
      first: async () => first(params),
      all: async () => all(params),
    })
    return {
      bind: (...params: unknown[]) => bound(params),
      run: async () => run([]),
      first: async () => first([]),
      all: async () => all([]),
    }
  }
}
