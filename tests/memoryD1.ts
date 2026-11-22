import { Database } from 'bun:sqlite'

/**
 * A small D1-compatible adapter over bun:sqlite. The production allocator is
 * an atomic counter UPDATE, so tests exercise the real SQL and the real
 * createProject path rather than a reimplementation.
 *
 * `batch` runs its statements in one SQLite transaction, matching D1's
 * all-or-nothing semantics for the multi-statement writes (ownership transfer,
 * plan change) that rely on it.
 */
export class MemoryD1 {
  private db = new Database(':memory:')

  prepare(sql: string) {
    const run = (params: unknown[]) => {
      const result = this.db.prepare(sql).run(...(params as never[]))
      // Most legacy tests create a build and immediately exercise the customer
      // surface. In this disposable database only, fixtures are published by
      // default; the publication gate has a dedicated test that clears this flag.
      if (/CREATE TABLE IF NOT EXISTS projects\b/.test(sql)) {
        this.db.exec(`CREATE TRIGGER IF NOT EXISTS test_publish_fixture
          AFTER INSERT ON projects
          BEGIN
            UPDATE projects SET published_at = '2026-01-01T00:00:00.000Z' WHERE id = NEW.id;
          END`)
      }
      return { success: true, meta: { changes: Number(result.changes) } }
    }
    const first = (params: unknown[]) => this.db.prepare(sql).get(...(params as never[])) ?? null
    const all = (params: unknown[]) => ({ results: this.db.prepare(sql).all(...(params as never[])) })
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
}
