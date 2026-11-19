# Manual ownership-dispute recovery

A person claims a business and someone else says it is theirs. This is the manual
path for that, written so a support operator can resolve it without a database
console, without seeing anyone's credentials, and without the app going offline.

**Freeze rule:** a dispute freezes *ownership changes only*. The app keeps serving,
orders keep arriving, bookings and payments keep working. Nothing is suspended while
a claim is contested.

---

## 1. Who can act

| Step | Allowed role |
| --- | --- |
| Open a dispute | `support` (on a reported issue) or the claimant themselves |
| Gather evidence | `support` |
| Decide (uphold / reject) | `admin` |
| Reverse a transfer | `admin` |
| Read the audit trail | `admin`, or `owner` for their own organisation |

`billing` has no part in this. No role may read an owner key, a claim token or a
password hash: the operator interface shows claim status, timestamps and the evidence
text only.

## 2. What the system guarantees during a dispute

- `project_claims.status = 'disputed'` — the unique partial index means no new claim
  can be opened for that project while it is disputed.
- `transferProjectOwnership` throws `claim_disputed`; no code path other than an
  explicit reversal can move `projects.org_id`.
- The current owner keeps working. The app, orders, bookings, payments and media are
  untouched.
- The claim, the transfer and every operator decision are in `audit_events` with actor
  and reason.

## 3. Procedure

1. **Record the report.** Who is disputing, which app (token prefix is enough to
   identify, never paste the full token into notes), what they say happened. Open the
   dispute with `disputeClaim({ claimId, actorId, note })`. The note is the audit
   record — keep it factual, no allegations.
2. **Confirm the state.** Check `claim_status`, whether an `ownership_transfers` row
   exists, and whether the app is claimed. Do not change anything yet. If the project
   is still `unclaimed`, nothing has moved and the dispute is only about a pending
   claim.
3. **Collect evidence out of band.** Accepted routes, in descending strength:
   - an email from the address registered on the project (before the claim) that
     acknowledges the claim;
   - a studio contract or invoice naming the business;
   - a domain-registrant or business-registration record matching the app's contact
     details;
   - a call-back to the phone number already on the project, logged with the time and
     the person's name.
   Evidence never includes an owner key or a claim token. Record a short, redacted
   summary in `ownership_transfers.evidence` or the resolution note.
4. **Decide, as `admin`.**
   - *Uphold the current owner:* reject the dispute with a note. The freeze is lifted;
     the claim returns to `approved` and the project stays where it is.
   - *Uphold the challenger:* reverse the transfer with
     `reverseTransfer({ transferId, reason, actorId })`. The project returns to its
     previous organisation (its own synthetic organisation if it was claimed after
     M2), the transfer row keeps `reversed_at` and the reason, and a new claim by the
     challenger must still pass the email proof. A reversal does **not** hand the
     project to whoever complained — it only undoes the disputed move.
5. **Close the loop.** Both parties get the outcome and the reason in plain language.
   Do not disclose the other party's email address, evidence or account details. If
   the app's registered email is wrong and cannot receive mail, that is a separate
   operator-verified change with its own audit record.
6. **Verify.** After the decision: `claim_status`, `projects.org_id`, the transfer
   row's `reversed_at`, and one `audit_events` row per action. Confirm the app still
   answers 200 for its normal route.

## 4. Hard limits

- No direct database edits. Every change goes through the audited code path.
- No operator may approve a claim that has not proven the registered email. If the
  email is dead, the override is an explicit, recorded decision (`email_source =
  'operator_override'`), never a silent bypass.
- No operator may target their own account, their own organisation or a relative's
  business; those cases escalate to a second `admin`.
- Never reveal or regenerate an owner key to "settle" a dispute. Ownership is proven
  by the email token, not by possession of a key that operators, staff and old
  contractors may all hold.
- Deleting an app during a dispute is not allowed. Resolve first; deletion afterward
  follows the retention job, not the dispute path.

## 5. If the evidence is inconclusive

The dispute stays open and the freeze stays in place — nothing is transferred on a
guess. The current owner keeps operating the app; that is the safest failure mode.
Escalate to the product owner for a commercial decision, record it, and only then act.
