# Pilot freeze and moderated owner testing

Status: **FROZEN · 0 of 4 owner sessions run**

This folder preserves the four-business pilot baseline and prepares four
moderated sessions. It contains **no owner-usability results**.

| Document | Purpose |
| --- | --- |
| `FREEZE.md` | Build ID, 12-project fingerprint, backup/archive, restore proof, freeze rules |
| `BASELINE.json` | Machine-readable project and integrity manifest |
| `CHANGELOG.md` | Change-control log for the testing phase |
| `MODERATED-SESSION-PROTOCOL.md` | The ten tasks, moderator rules, metrics, privacy |
| `SESSION-CHECKLIST.md` | Session-day pre/during/post checklist |
| `CONSENT-FORM.md` | Recording and quote consent |
| `SESSION-NOTES-TEMPLATE.md` | Observation record and feedback separation |
| `sessions/` | One blank sheet per business |
| `session-results.csv` | Four rows, all `not_run` |
| `HUMAN-TESTING-REPORT.md` | Final report; currently reports no sessions |

## Current build

`plattr-pilot-2026-11-22-50ed8bf-2331b6369062-dirty`

## Current decision

Owner usability is **unverified**. Do not expand the pilot and do not claim
owner testing has passed. Complete the four sessions with real owners first.

## Quick start

```bash
bun scripts/pilot-access-pack.mjs      # private links/keys, gitignored
bun scripts/pilot-access-verify.mjs    # 12/12 access smoke check
bunx vite --host 127.0.0.1             # loopback only, not the LAN
```

Read `SESSION-CHECKLIST.md` before every owner. Restore the baseline after every
session; see `FREEZE.md`.
