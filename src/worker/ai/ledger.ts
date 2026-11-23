/**
 * A spend ledger for one process. Reservations are taken before a call and
 * settled to the provider's actual charge afterwards, so a run can never spend
 * past its cap even if a call returns more tokens than estimated.
 *
 * The trial runs in one process, so a memory ledger is enough and is auditable.
 * Production activation needs the same rules on D1, keyed by day and scope;
 * that is a separate approval and is not wired into this trial.
 */

export type Ledger = {
  /** Take a reservation. False means the call must not be made. */
  reserve(usd: number): boolean
  /** Release a reservation and record what was actually spent. */
  settle(reservedUsd: number, actualUsd: number): void
  spentUsd(): number
  reservedUsd(): number
  remainingUsd(): number
  capUsd(): number
  entries(): { reservedUsd: number; actualUsd: number }[]
}

export function createLedger(capUsd: number): Ledger {
  let spent = 0
  let reserved = 0
  const log: { reservedUsd: number; actualUsd: number }[] = []
  return {
    reserve(usd: number): boolean {
      if (!Number.isFinite(usd) || usd < 0) return false
      if (spent + reserved + usd > capUsd + 1e-9) return false
      reserved += usd
      return true
    },
    settle(reservedUsd: number, actualUsd: number): void {
      reserved = Math.max(0, reserved - reservedUsd)
      const actual = Number.isFinite(actualUsd) && actualUsd > 0 ? actualUsd : 0
      spent += actual
      log.push({ reservedUsd, actualUsd: actual })
    },
    spentUsd: () => spent,
    reservedUsd: () => reserved,
    remainingUsd: () => Math.max(0, capUsd - spent - reserved),
    capUsd: () => capUsd,
    entries: () => [...log],
  }
}
