/**
 * A spend ledger for one process. Reservations are taken before a call and
 * settled to the provider's actual charge afterwards, so a run can never spend
 * past its cap even if a call returns more tokens than estimated.
 *
 * The trial runs in one process, so a memory ledger is enough and is auditable.
 * Production activation needs the same rules on D1, keyed by day and scope;
 * that is a separate approval and is not wired into this trial.
 */

export type LedgerEntry = {
  reservedUsd: number
  /** Confirmed charge. */
  actualUsd: number
  /** Reservation kept because the charge could not be established. */
  retainedUsd: number
}

export type Ledger = {
  /** Take a reservation. False means the call must not be made. */
  reserve(usd: number): boolean
  /** Release a reservation and record what was actually spent. */
  settle(reservedUsd: number, actualUsd: number): void
  /** Release a reservation and keep it as spent because the provider may have
   *  billed it. Used for timeouts, dropped connections and answers without
   *  usable billing information: an unknown charge is never a free one. */
  retain(reservedUsd: number): void
  spentUsd(): number
  /** Of `spentUsd`, how much is an uncertain reservation rather than a charge. */
  retainedUsd(): number
  reservedUsd(): number
  remainingUsd(): number
  capUsd(): number
  entries(): LedgerEntry[]
}

export function createLedger(capUsd: number): Ledger {
  let spent = 0
  let retained = 0
  let reserved = 0
  const log: LedgerEntry[] = []
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
      log.push({ reservedUsd, actualUsd: actual, retainedUsd: 0 })
    },
    retain(reservedUsd: number): void {
      reserved = Math.max(0, reserved - reservedUsd)
      const kept = Number.isFinite(reservedUsd) && reservedUsd > 0 ? reservedUsd : 0
      spent += kept
      retained += kept
      log.push({ reservedUsd, actualUsd: 0, retainedUsd: kept })
    },
    spentUsd: () => spent,
    retainedUsd: () => retained,
    reservedUsd: () => reserved,
    remainingUsd: () => Math.max(0, capUsd - spent - reserved),
    capUsd: () => capUsd,
    entries: () => [...log],
  }
}
