# Final human-testing report

Date: 22 November 2026
Build: `plattr-pilot-2026-11-22-50ed8bf-2331b6369062-dirty`
Protocol: `MODERATED-SESSION-PROTOCOL.md`

## Status and decision

**No moderated owner session has been run.**

| Session | Business | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Yarmouth Oilskins | **not run** | No owner recruited |
| 2 | Padella | **not run** | No owner recruited |
| 3 | Blue Tit London | **not run** | No owner recruited |
| 4 | Architecture for London | **not run** | No owner recruited |

**Decision: do not expand the pilot.** This is not a failure of the product and
not a pass. It means there is zero human evidence on which to base an expansion.

The correct statement is:

> Plattr has a frozen baseline and a prepared moderated test. Owner usability is
> **unverified**. Automated browser checks and the implementer's walkthrough are
> not owner evidence.

## Task completion per owner

No task results exist.

| Task | Yarmouth | Padella | Blue Tit | AFL |
| --- | --- | --- | --- | --- |
| 1. Start from entry point | — | — | — | — |
| 2. Review discovered information | — | — | — | — |
| 3. Compare three concepts | — | — | — | — |
| 4. Select preferred concept | — | — | — | — |
| 5. Identify missing/uncertain information | — | — | — | — |
| 6. Edit a business field | — | — | — | — |
| 7. Edit a visual element | — | — | — | — |
| 8. Save the application | — | — | — | — |
| 9. Leave and return in a fresh session | — | — | — | — |
| 10. Preview the customer application | — | — | — | — |

`—` means **not run**, not failed.

## Time per task

**No timings recorded.** `session-results.csv` has four rows with status
`not_run` and empty timing fields. Do not fill these from a moderator rehearsal,
an automated script, or an imagined owner.

Target hypotheses (not results) are in the protocol:

- discovery review ≤ 8 minutes;
- concept choice ≤ 8 minutes from reveal;
- publish-ready ≤ 25 minutes from concept choice;
- entry, business edit, save, fresh session and preview: 4/4 independent.

## Assistance required

**No assistance observations.** No hints, pointers, named controls or moderator
take-overs have occurred with an owner.

The protocol requires every intervention to be logged. Because there are no
sessions, the assistance count is not zero-with-success; it is **unmeasured**.

## Critical and non-critical usability issues

**No owner-observed issues exist.** This report does not convert the earlier
internal expert review into usability issues.

Known product constraints that a moderator must not mistake for new findings:

- Padella has no dishes, so its catalogue/detail journey is intentionally empty.
- Blue Tit has 75 unpriced treatments and no treatment photographs.
- Yarmouth's product images are loaded from its CDN, not bundled.
- AFL has one unpriced service and seven unpublished portfolio suggestions.
- The editor autosaves; there is a saved-status indicator rather than a
  conventional Save button. Whether an owner understands that is exactly what
  Task 8 must test.

These are baseline conditions, not session results.

## Accuracy corrections requested

**None — no owner has reviewed the projects.**

The outstanding owner inputs remain those recorded in
`docs/qa/supervised-pilot-2026-11-22/REPORT.md`:

- Yarmouth: name confirmation, contact details, image rights.
- Padella: dishes/prices, contact details, menu source.
- Blue Tit: email/address/hours, 75 prices, 82 photos, phone confirmation.
- AFL: address, Build price, weekend hours, case studies, public contact.

No correction may be marked “owner-confirmed” until the owner supplies it in a
session or in writing.

## Preferred concepts and reasons

**No preference recorded.** There are no votes for minimal, editorial, lifestyle,
modern, luxe or classic.

A preference is a design choice, not proof that the workflow worked. The report
must record the owner's reason next to the choice and keep it separate from task
completion.

## Feature requests

**None recorded.** The protocol sends requests to session notes and this report;
none may be implemented during the frozen testing phase without the change-log
exception process.

## Independent completion

| Owner | Could complete the journey independently? | Evidence |
| --- | --- | --- |
| Yarmouth | **unknown** | No session |
| Padella | **unknown** | No session |
| Blue Tit | **unknown** | No session |
| AFL | **unknown** | No session |

“Unknown” is the only defensible answer. Do not replace it with “yes” because
the app rendered, the automated matrix passed, or the moderator can use it.

## Recommended fixes before expansion

No usability fixes can be recommended from zero sessions. The blockers to
starting the sessions are operational, not design opinions:

1. Recruit four real owners (one per trade) and two reserves.
2. Run the four sessions with the frozen build and this protocol.
3. Fix only critical defects found; log every change and re-freeze.
4. Complete the safeguards gate in `PILOT-SAFEGUARDS.md` before any external
   hosted onboarding.
5. Re-run affected tasks with at least one owner after a critical fix.
6. Only then decide whether to expand.

The prior non-usability blockers still stand: no production-like environment,
no offsite/scheduled backup or restore rehearsal in production, no named alert
owner, no retention/erasure decision, and no deployment approval.

## What has been verified (not owner usability)

- 12 clean projects fingerprinted; 3 concepts each.
- Baseline dataset hash:
  `bad9e57a526ce3132928123ac32c25e39ef1b62b8abbf8c2d25e9bedea6bf471`.
- Backup restored into a disposable copy; dataset hash matched; 162/162
  referenced media objects present.
- 759 automated tests passed, typecheck and build passed, 87-screen matrix had
  0 network/console failures.
- All 12 projects remain private and `in_review`; no customer records, payments,
  publication or deployment.

See `FREEZE.md` for the build/backup/restore evidence and
`../supervised-pilot-2026-11-22/` for the pre-freeze acceptance evidence.

## Completion rule

This report becomes a human-testing result only when:

- all four business sheets contain observed task rows;
- timings and assistance are filled from the sessions;
- every owner's concept choice and reason are recorded separately from workflow
  success;
- critical issues are listed with evidence;
- every edited project has been restored and the baseline hash rechecked;
- the report explicitly states which tasks were independent and which were not.

Until then, the verdict remains: **owner usability not tested; no expansion.**
