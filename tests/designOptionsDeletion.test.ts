import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import {
  createProject,
  deleteProject,
  getDesignOption,
  replaceDesignOptions,
  type NewProjectInput,
} from '../src/worker/db'

type Statement = {
  __run?: () => unknown
  run: () => Promise<unknown>
}

/**
 * The real SQLite path behind the D1-shaped API. This is deliberately not a
 * mock: the deletion has to work in the same SQL engine the local app uses,
 * including the batch that `deleteProject` relies on.
 */
function sqliteD1(db: Database) {
  const prepare = (sql: string) => {
    let values: unknown[] = []
    const run = () => {
      const result = db.prepare(sql).run(...(values as never[]))
      return { success: true, meta: { changes: Number(result.changes) } }
    }
    const api = {
      bind(...args: unknown[]) {
        values = args
        return api
      },
      first: async () => db.prepare(sql).get(...(values as never[])) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...(values as never[])) }),
      run: async () => run(),
      __run: run,
    }
    return api
  }
  return {
    prepare,
    async batch(statements: Statement[]) {
      db.exec('BEGIN')
      try {
        const results = statements.map((statement) =>
          statement.__run ? statement.__run() : statement.run(),
        )
        db.exec('COMMIT')
        return results
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
  }
}

function input(name: string): NewProjectInput {
  return {
    name,
    contact: '',
    email: '',
    vertical: 'shop',
    accent: '#b8863f',
    logo: 'GS',
    features: ['catalog'],
    platforms: ['pwa'],
    plan: 'onetime',
  }
}

function options(project: Awaited<ReturnType<typeof createProject>>, suffix: string) {
  return ['editorial', 'utility', 'campaign'].map((direction) => ({
    id: `${direction}-${suffix}`,
    name: direction,
    direction,
    spec: project.spec,
    doc: { screens: [], initialScreen: 'home' } as never,
  }))
}

describe('deleting a project removes its design options', () => {
  test('the real SQLite path deletes only the deleted project options', async () => {
    const db = new Database(':memory:')
    const d1 = sqliteD1(db)
    const first = await createProject(d1 as never, input('First Build'))
    const second = await createProject(d1 as never, input('Second Build'))

    await replaceDesignOptions(d1 as never, first.id, options(first, 'first'))
    await replaceDesignOptions(d1 as never, second.id, options(second, 'second'))

    expect(await getDesignOption(d1 as never, first.id, 'editorial-first')).not.toBeNull()
    expect(await getDesignOption(d1 as never, second.id, 'editorial-second')).not.toBeNull()

    await deleteProject(d1 as never, first.id)

    const firstRows = db
      .prepare('SELECT COUNT(*) AS count FROM design_options WHERE project_id = ?')
      .get(first.id) as { count: number }
    const secondRows = db
      .prepare('SELECT COUNT(*) AS count FROM design_options WHERE project_id = ?')
      .get(second.id) as { count: number }

    expect(firstRows.count).toBe(0)
    expect(secondRows.count).toBe(3)
    expect(await getDesignOption(d1 as never, first.id, 'editorial-first')).toBeNull()
    expect(await getDesignOption(d1 as never, second.id, 'editorial-second')).not.toBeNull()
  })
})
