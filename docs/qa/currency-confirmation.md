# The brief's currency answer

An imported shop can state its currency in ways that do not prove what its
prices mean. This is what the brief shows, what it saves, and what the build
does with the answer. No live site was read for this work: the saved
Present & Correct feed is the fixture, and the brief was driven in a local
development browser.

## What the owner sees

The receipt lists every candidate the reader collected, each with its source:

- a human name for the method (page metadata, structured data, a money format,
  the shop's own option labels, or the storefront currency);
- a note when the candidate is **what visitors are shown** (Shopify Markets
  presentment), which follows the visitor's country and is not the shop's price;
- the raw statement that produced it, e.g. `£10 matched against its option price`.

The panel explains why it is asking, differently for each case:

| Evidence | Heading | What the owner can do |
| --- | --- | --- |
| GBP page metadata only | Currency confirmed by you: GBP | Keep, change or clear it |
| INR presentment only | The shop currency is not proven | Choose the shop's currency |
| USD presentment only | The shop currency is not proven | Choose the shop's currency |
| EUR labels from one product | The shop currency is not proven | Choose the shop's currency |
| GBP metadata and EUR labels | Two currencies were declared — which is right? | Choose one; neither is assumed |
| Nothing stated | Confirm the shop currency | Choose a code or leave it unlabelled |

The selector always includes GBP, EUR, USD, INR plus any candidate code, and a
`Not confirmed` option that leaves amounts bare. Choosing a code replaces the
question with `Currency confirmed by you: CODE`, keeps the candidate list and
its sources on screen, and saves immediately to the brief draft.

## What is saved, and for how long

- `site.currency` — the answer.
- `site.currencyEvidence` — `{ code, method: "owner", source: "confirmed by the
  owner in the brief", raw }`.
- `site.currencyCandidates` — the untouched evidence that produced the question,
  including the refused presentment code and its source URL.
- The brief draft (cookie-addressed, 30 days) restores all three on refresh; the
  project stores them in `spec.currency`, `spec.currencySource` and
  `spec.currencyCandidates`.

## What the build does with it

The confirmed code is used by the customer app cards and detail, the bag and its
totals, order creation and retrieval, the owner dashboard and the hosted payment
page. An unconfirmed or rejected code prints bare amounts; only a build that
states a code prints a symbol.

A later re-import applies only the categories the owner approved to the
catalogue. It never rewrites currency, its source or its candidates, so an
answered currency survives `import/apply` (covered by
`tests/currencyBrief.test.ts`).

## Verified

**Fixture-tested** (`tests/currencyBrief.test.ts`, `tests/checkoutAcceptance.test.ts`):

- GBP/INR/USD/EUR print `£`/`₹`/`$`/`€` and keep `method: owner`;
- candidates and their sources survive the answer, the project save, a reload
  and a re-import;
- conflict and no-evidence cases publish no code and print bare amounts;
- orders carry the answered currency and re-sending one attempt returns one order.

**Browser-tested** (local dev, real brief page, saved fixture import restored
from the draft):

- candidate list showed `INR — the currency the storefront shows visitors (what
  visitors are shown, not what the shop prices in)` and `GBP — the shop own
  option labels · £10 matched against its option price`;
- selecting GBP, then clearing, then INR, USD, EUR and GBP again redrew the
  panel and row each time; clearing returned to the question;
- the saved draft held `currency: GBP`, `method: owner`, and both candidates;
- a reload restored the panel, the row `Currency GBP (confirmed by you)` and the
  selected option;
- conflict evidence showed both statements with their sources and no preselected
  answer; no-evidence showed only the selector.

**Not verified:** a live crawl that produces these candidates (the last
authorised read is spent), and the owner flow on a deployed build.
