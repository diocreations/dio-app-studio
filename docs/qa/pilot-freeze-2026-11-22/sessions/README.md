# Four moderated sessions

Status: **not scheduled / not run**

| Session | Business | Sheet | Concept options |
| --- | --- | --- | --- |
| 1 | Yarmouth Oilskins | `SESSION-1-YARMOUTH.md` | minimal, editorial, lifestyle |
| 2 | Padella | `SESSION-2-PADELLA.md` | editorial, modern, luxe |
| 3 | Blue Tit London | `SESSION-3-BLUETIT.md` | minimal, editorial, luxe |
| 4 | Architecture for London | `SESSION-4-AFL.md` | classic, minimal, editorial |

Use the common `MODERATED-SESSION-PROTOCOL.md`, `SESSION-CHECKLIST.md`,
`CONSENT-FORM.md` and `SESSION-NOTES-TEMPLATE.md` (one level up).

## Private access

Generate/refresh the access pack with:

```bash
bun scripts/pilot-access-pack.mjs
```

It writes, under the gitignored `.chrome-qa/session-access/` directory:

- `<business>-links.txt` — that business's three owner links and customer
  previews;
- `<business>-keys.txt` — that business's owner keys, mode 600.

Keep links and keys separate. Transfer one key to the owner's password manager
or type it in person; never put it in the link, notes, chat, email, screenshot or
recording. The concept sheet is also business-specific:
`.chrome-qa/pilot-concepts-<business>.html`.

## Result capture

- Per-business markdown sheet: observations, exact quotes, assistance.
- `../session-results.csv`: one machine-readable row per session.
- `../HUMAN-TESTING-REPORT.md`: remains “not run” until all four rows are filled.

Do not fill any result from a moderator rehearsal or automated browser test.
