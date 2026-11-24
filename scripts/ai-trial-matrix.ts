/**
 * The nine-generation matrix, run in order and stopped at the first failure.
 *
 * A generation either finishes (`status === 'ai'`) or ends the matrix. That is
 * deliberate: a bad key, a refused schema or an exhausted budget must not be
 * repeated across the remaining eight cells, where each failure would still
 * book its own charge or retained reservation. The failed generation is kept
 * with its accounting, and every later cell is recorded as skipped, so a
 * partial report can never be read as a complete run.
 *
 * This module only decides order and stopping. The caller owns what a
 * generation is, what it costs and what it returns; the harness passes the
 * record it already builds for the report.
 */

export type MatrixBusiness = { id: string }

export type MatrixProvider = { id: string }

/** The minimum a generation record must carry for the matrix to judge it. */
export type MatrixRecord = { generation: number; status: string }

export type MatrixSkip = {
  generation: number
  business: string
  provider: string
  reason: 'matrix_stopped_after_failure'
}

export type MatrixResult<R extends MatrixRecord> = {
  /** Completed generations plus the one that failed, in run order. */
  runs: R[]
  /** The first generation that did not finish, or null for a complete run. */
  failed: R | null
  /** Cells that were never sent because an earlier generation failed. */
  skipped: MatrixSkip[]
  complete: boolean
  /** Cells the matrix was asked to run: businesses × providers. */
  planned: number
}

export async function runMatrix<
  B extends MatrixBusiness,
  P extends MatrixProvider,
  R extends MatrixRecord,
>(input: {
  businesses: B[]
  providers: P[]
  runGeneration: (business: B, provider: P, generation: number) => Promise<R>
}): Promise<MatrixResult<R>> {
  const runs: R[] = []
  const skipped: MatrixSkip[] = []
  let failed: R | null = null
  let generation = 0

  for (const business of input.businesses) {
    for (const provider of input.providers) {
      generation += 1
      if (failed) {
        skipped.push({
          generation,
          business: business.id,
          provider: provider.id,
          reason: 'matrix_stopped_after_failure',
        })
        continue
      }
      const record = await input.runGeneration(business, provider, generation)
      runs.push(record)
      if (record.status !== 'ai') failed = record
    }
  }

  return {
    runs,
    failed,
    skipped,
    complete: failed === null,
    planned: input.businesses.length * input.providers.length,
  }
}

/** 0 for a complete matrix, 1 for one stopped by a failed generation. */
export function exitCodeFor(complete: boolean): number {
  return complete ? 0 : 1
}
