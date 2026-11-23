# Moderated owner session protocol

Prepared: 22 November 2026
Status: **PREPARED — NO SESSION HAS BEEN RUN**

This protocol does not contain owner results. The four per-business sheets are
blank until a real owner completes a session with a moderator.

## Purpose and scope

Test whether a real owner can start from Plattr's owner entry point, understand
what was discovered, compare concepts, correct the build and preview it without
routine guidance.

One moderator and one owner per session; a silent observer is optional. Sessions
are 45–60 minutes. This is formative research with four businesses, not a
statistical benchmark.

The product is frozen at:

`plattr-pilot-2026-11-22-50ed8bf-2331b6369062-dirty`

Do not add features during a session. Record requests for the final report.

## Participants

- The actual owner/operator of the business, not an agency or a technically
  confident stand-in.
- One from each trade: Yarmouth (retail), Padella (restaurant), Blue Tit
  (salon), AFL (professional services).
- Two reserves.
- Exclude anyone who worked on Plattr or saw the review screens before.

Collect only: role, business size, device, app confidence 1–5, prior website
involvement. Do not collect passwords, payment data or customer records.

## Before the owner arrives

1. Confirm the frozen build ID and that no product change is pending.
2. Confirm the baseline's 12-project dataset hash is
   `bad9e57a526ce3132928123ac32c25e39ef1b62b8abbf8c2d25e9bedea6bf471`.
   A previous session's edits must already be restored.
3. Start Plattr on loopback only (`bunx vite --host 127.0.0.1`) and confirm the
   listener is `127.0.0.1:5173`, not the LAN. Open no operator Studio tab,
   payment page, other owner's project or public deployment.
4. Prepare **only this business's** concept sheet:
   `.chrome-qa/pilot-concepts-<business>.html`.
   It shows the three builds for this owner, not the other three businesses.
5. Have the owner's private project link and owner key ready in separate places:
   a password manager/in person for the key, and a private browser bookmark for
   the link. Do not put the key in a URL, chat, email, slide or recording.
6. Confirm the project is private, `noindex`, in review, payments off. Do not
   press **Approve build**.
7. Have the consent form, timer, this protocol and the business session sheet.
8. Set the browser to a clean profile if possible so no other owner session is
   present.

## Moderator rules

- Read each task once, in plain language. Do not name the control unless the
  owner is blocked.
- Do not point at the next link, explain a term, or complete a routine step.
- If the owner asks “where do I click?”, first ask what they are looking for.
  If they still cannot proceed after a genuine attempt, assist and log it.
- Never say “this is easy”, “just”, “obviously”, or “most people”.
- Do not defend the product or explain why it was designed that way.
- Silence is allowed. Let the owner struggle briefly; that is the data.
- Log every intervention, including a pointed finger or a named label.
- Stop if the owner is distressed, a credential is exposed, or private data
  appears in the wrong place.

## Entry point

The owner entry point is the **private owner project link** Plattr issued for
this business. It opens the owner sign-in page. The public marketing home and the
operator Studio are not the entry point for this test.

If the owner starts at the public home and cannot find a way in, record that as
a navigation finding. Do not teach a generic owner login that does not exist.

## The ten tasks

Give the prompt exactly once. Start the timer when the owner begins the action.
Stop when the success condition is met, they abandon, or five minutes pass.

| # | Task | Prompt | Success condition |
| --- | --- | --- | --- |
| 1 | Start from the Plattr entry point | “Please start here and get into your business.” | Opens the private owner link, understands it is sign-in, enters the key and reaches the owner workspace |
| 2 | Review discovered information | “Show me what Plattr says it found about your business, and tell me what came from your website, what it is unsure about, and what is missing.” | Opens the review and distinguishes found / uncertain / missing without being told the headings |
| 3 | Compare three concepts | Reveal the business-only concept sheet. “Compare these three and tell me how they differ.” | Opens at least two previews and describes a real difference, not only colour |
| 4 | Select a preferred concept | “Which one would you want customers to see, and why?” | Makes a clear choice and gives a reason |
| 5 | Identify missing or uncertain information | “What would you need to supply or confirm before this could go live?” | Names at least two items that match the review, without reading the moderator list |
| 6 | Edit a business field | “Change one business detail you know is wrong or missing. Save it and check it stayed.” | Edits a real field, saves, reloads and sees the value persist |
| 7 | Edit a visual element | “Make one visual change you would want a customer to see.” | Changes a heading, background, photo or comparable visible element in the editor |
| 8 | Save the application | “Save your changes and confirm they are saved.” | Waits for the saved state, reloads and confirms the visual change is still there |
| 9 | Leave and return in a fresh session | “Leave Plattr now, then come back as if you were returning tomorrow.” | Signs out or closes the browser, reopens the entry link, signs in again, and finds the saved changes |
| 10 | Preview the customer application | “Show me what the customer would see now.” | Opens the customer app unaided and finds the visual change; understands the app is still private |

Do not ask the owner to press **Approve build**; approval is their real sign-off,
not a test step. Do not submit an order, booking or enquiry with personal data.

### Assistance classification

- **Independent:** completed without the moderator naming a control or path.
- **Assisted:** completed after a hint, pointer, named label, or moderator action.
- **Failed:** not completed within five minutes, abandoned, or completed by the
  moderator.
- Reading the prompt, providing the entry link and revealing the concept sheet
  are setup, not assistance.
- A repeated attempt after a wrong turn is a mistake, not automatically
  assistance.

## What to record

For every task:

- start/end time and duration;
- independent / assisted / failed;
- what the owner tried;
- exact question or request for help;
- what the moderator did;
- mistakes, wrong turns and repeated attempts;
- confusion and technical words the owner did not understand;
- exact quotes for important moments.

Do not paraphrase a quote into a compliment or complaint. Keep observation and
interpretation separate: “opened Catalogue, then went back twice” is observation;
“the catalogue is confusing” is interpretation.

## Feedback: usability is not design preference

Record these separately:

| Dimension | Evidence |
| --- | --- |
| Understood the workflow | Can explain found/uncertain/missing and the next step in their own words |
| Completed independently | Task result without assistance, not the owner's self-rating alone |
| Imported information accurate | Corrections requested, wrong facts/prices/contacts found |
| Concepts useful | Could compare and choose for a stated business reason; this is **preference**, not workflow success |
| Editor understandable | Found business and visual editing, saved, reloaded and saw the change |
| Trusted review/approval | Understood what is private, what approval means, and what remains missing |

A participant choosing the “editorial” concept is a design preference. It does
**not** prove the workflow succeeded. A participant who cannot find the preview
has a usability failure even if they love the colours.

Post-session statements (1 strongly disagree – 5 strongly agree):

1. I understood what Plattr found on my website.
2. I could tell what was missing or uncertain.
3. I knew where to edit each thing.
4. The three concepts were meaningfully different.
5. I could preview the customer app without help.
6. I would be comfortable showing this app to a customer after my edits.
7. I could run this without someone sitting next to me.

## Metrics and hypotheses

| Metric | Definition | Hypothesis |
| --- | --- | --- |
| Entry | Reaches workspace with key, unaided | 4/4 independent |
| Discovery review | Correctly separates found / uncertain / missing | ≤ 8 min; 4/4 |
| Concept choice | Clear choice and reason | ≤ 8 min from reveal; 4/4 |
| Business edit | Save + reload proves persistence | 4/4 independent |
| Visual edit | Visible change in editor and customer app | 4/4 independent or one assist |
| Fresh session | Sign out, return, sign in, edits intact | 4/4 |
| Publish-ready | “I would approve this” after checks | median ≤ 25 min from concept choice |
| Assistance | Interventions per participant | ≤ 2; no repeated blocker in 3 sessions |
| Trust | Statement 6 | median ≥ 4 |
| Accuracy | Wrong facts/prices/contacts noticed | 0 invented facts; all corrections logged |

If two owners hit the same blocker, pause the cohort and fix it before the next
session. Do not average a blocker away or call a failed task “mostly complete”.

## After the owner leaves

1. Record whether any customer records were created (expected: none).
2. Stop the dev server before touching the live database.
3. Restore every affected project for that business from the frozen backup with
   `scripts/restore-project.mjs`; do not edit the backup.
4. Start the server and confirm all 12 project rows still exist.
5. Recompute the dataset fingerprint. The pristine hash must return to
   `bad9e57a526ce3132928123ac32c25e39ef1b62b8abbf8c2d25e9bedea6bf471`.
6. Remove the owner's session (the restore already does this); the next owner
   signs in with a different project key.
7. Remove or lock the recording, notes and contact details per consent.
8. Add a session row to `CHANGELOG.md`; if any product change was made, add its
   reason, impact, verification and new build ID.
9. Update the business sheet and `SESSION-RESULTS.csv`.
10. Only then prepare the next business.

## Stop and escalate

- An owner cannot find where to edit or preview.
- An owner believes the private build is public.
- The key or another owner's project appears.
- A wrong price/contact or invented fact is visible.
- Two owners abandon the same task.
- Any payment or real customer data appears.

Stop conditions are findings, not moderator failures.

## Explicit non-claims

This protocol and the automated QA evidence do **not** establish owner usability.
Until four real owners complete the sessions, the correct status is
**unverified with owners**.
