# Trade data models — schema design for the five approved domains

Approved in stages. This document is the design; **no table in it is created yet**
except where noted. Nothing here changes an existing column, drops a table or
rewrites owner data.

Design rules that apply to all five:

1. **Rows belong to a project**, never to a trade in the abstract:
   `project_id TEXT NOT NULL` on every table, indexed with `project_id, sort`.
2. **Money is integer minor units** (`price_cents`), with the project's
   `currency` stored on the row so a later currency change cannot silently
   reinterpret history.
3. **Stable ids**, generated on insert (`crypto.randomUUID()`), never derived from
   position, so an owner's edit survives reorder, re-import and version restore.
4. **Deletion is soft** (`archived_at`), because order history and bookings point
   at these rows.
5. **The catalogue stays the fallback.** If a domain table has no rows for a
   project, the app renders from the spec catalogue exactly as today. That is how
   existing projects keep working with no migration and no rewrite.
6. **Every write is validated server-side** and rejects foreign origins, exactly
   like the existing owner routes. The browser never computes a price or a total.
7. **Migration**: new tables only, `CREATE TABLE IF NOT EXISTS`, additive
   indexes. A backfill reads the existing catalogue once, only for projects with
   no domain rows, and writes only records marked `origin='backfill'` so the
   owner's later edits are always distinguishable.

---

## 1. Accommodation and nights — `hotel`

**Tables**

`units` — a thing that is booked for a night: `id`, `project_id`, `name`,
`kind` (`room|suite|apartment|pitch|whole`), `description`, `price_cents`,
`currency`, `min_nights`, `max_guests`, `bedrooms`, `beds`, `bathrooms`,
`amenities` (JSON array), `photo_key`, `sort`, `active`, `archived_at`.

`unit_nights` — per-date overrides: `id`, `project_id`, `unit_id`, `date`
(`YYYY-MM-DD`), `available` (0/1), `price_cents` (NULL = inherit),
`min_nights` (NULL = inherit), `note`. Unique `(unit_id, date)`.

`stays` — a customer's request or booking: `id`, `project_id`, `unit_id`,
`customer_id`, `number`, `check_in`, `check_out`, `guests`, `status`
(`requested|confirmed|checked_in|checked_out|cancelled`), `total_cents`,
`currency`, `note`, timestamps. Nights are derived, never stored: a stay owns a
date range.

**Validation** — `check_out > check_in`; nights ≥ `min_nights`; guests ≤
`max_guests`; no overlapping `stays` for the same unit in a blocking status; a
night's price comes from `unit_nights` then the unit; total = sum of nightly
prices, computed on the server; dates must be real calendar dates and not in the
past at request time.

**Customer** — pick dates, see a real nightly total and a per-night breakdown,
request or book, see "your stay" in history.

**Owner** — unit list with nightly price, a calendar of blocked dates and
seasonal prices, stay list with status transitions, and a monthly occupancy read.

**Assigned to** hotel, and any future `guesthouse`/`campsite` trade. Not shops,
not clinics: a "night" is not a generic catalogue row.

---

## 2. Places and destinations — `hospital`-adjacent map trades, `gallery`, `property` guides

**Tables**

`places` — `id`, `project_id`, `name`, `category` (`exhibition|venue|trail|beach|
market|landmark|neighbourhood`), `description`, `address`, `area`, `lat`, `lng`
(NULL allowed: never geocode silently), `hours`, `price_band` (1–4, NULL),
`price_cents` (NULL = free/unknown), `currency`, `tags` (JSON), `photo_key`,
`sort`, `active`.

`place_links` — `id`, `project_id`, `place_id`, `kind` (`website|tickets|map|
social`), `label`, `url`, `sort`.

**Validation** — `category` from the fixed list; `lat` −90..90, `lng` −180..180
and both present or both absent; URLs https only and on a public host;
`price_band` 1–4; hours a free-text string (never parsed into a guess).

**Customer** — browse by category and area, open a place with directions and its
own links, save places to a shortlist.

**Owner** — add places one at a time or import a list, reorder, hide, and attach a
photograph per place.

**Assigned to** gallery (what to see nearby), hotel (around the stay), property
(neighbourhood guide), and any future destination trade. It does not replace the
catalogue: a place is not for sale.

---

## 3. Jobs and employment — trades with hiring

**Tables**

`job_posts` — `id`, `project_id`, `title`, `employment` (`full|part|contract|
casual|apprenticeship`), `location`, `remote` (0/1), `salary_min_cents`,
`salary_max_cents`, `salary_period` (`year|month|hour|day`), `currency`,
`description`, `requirements` (JSON array), `closes_on` (date), `status`
(`draft|open|closed`), `sort`.

`job_applications` — `id`, `project_id`, `post_id`, `name`, `email`, `phone`,
`message`, `cv_key` (R2 object, NULL), `status` (`new|shortlisted|rejected|
hired`), `created_at`.

**Validation** — `salary_min_cents ≤ salary_max_cents`, both or neither; a period
is required when salary is present; `closes_on` a real date; one application per
`(post_id, lower(email))`; the CV is accepted only through the existing media
pipeline (type, size, virus-safe rules), never a raw URL.

**Customer** — see open roles, read a role, apply with a CV, see application
status by email link.

**Owner** — create/edit/close a post, review applications, move status, download
CVs, and never see a candidate's data through the public app.

**Assigned to** trades, hospital, school, hospitality. Applications are personal
data: private responses, no-store, and deleted on project deletion.

---

## 4. Sessions and classes — `gym`, `courses`, `tuition`, `school`, `kindergarten`

**Tables**

`class_series` — `id`, `project_id`, `name`, `kind` (`class|course|club|term|
session`), `level`, `description`, `coach`, `duration_min`, `capacity`,
`price_cents`, `currency`, `price_per` (`session|term|month|course`), `photo_key`,
`active`, `sort`.

`class_occurrences` — `id`, `project_id`, `series_id`, `starts_at` (ISO datetime
with offset), `ends_at`, `room`, `capacity` (NULL = inherit), `status`
(`scheduled|cancelled`). Unique `(series_id, starts_at)`.

`class_bookings` — `id`, `project_id`, `occurrence_id`, `customer_id`, `number`,
`places` (1..capacity), `status` (`reserved|confirmed|attended|no_show|
cancelled`), `note`, timestamps.

**Validation** — `ends_at > starts_at`; `places ≤ capacity − booked`; a
cancelled occurrence accepts no booking; a booking that would take a series over
capacity is refused on the server even if two requests race (single statement with
a capacity check); no booking in the past; times stored with an explicit offset so
a DST change cannot shift a class.

**Customer** — see the timetable for the next N days, book places, cancel, see
credits/attendance.

**Owner** — recurring series (weekly, with exceptions), capacity per occurrence,
attendance marking, and a fill-rate read.

**Assigned to** gym, courses, tuition, school, kindergarten. A "session" is not a
catalogue row: it has a time, a capacity and a roster.

---

## 5. Vendors and marketplace operations — `marketplace`, `ecommerce` multi-seller

**Tables**

`vendors` — `id`, `project_id`, `name`, `slug`, `category`, `description`,
`area`, `phone`, `email`, `logo_key`, `commission_bps` (integer basis points),
`status` (`invited|active|paused`), `sort`.

`vendor_items` — `id`, `project_id`, `vendor_id`, `name`, `description`,
`price_cents`, `currency`, `stock` (NULL = made to order), `photo_key`, `active`,
`sort`.

`vendor_orders` — `id`, `project_id`, `vendor_id`, `order_id`, `status`
(`placed|accepted|ready|collected|cancelled|refunded`), `subtotal_cents`,
`commission_cents`, `payout_cents`, `created_at`.

`vendor_payouts` — `id`, `project_id`, `vendor_id`, `period_start`,
`period_end`, `amount_cents`, `currency`, `status` (`pending|paid`), `paid_at`,
`reference`.

**Validation** — `commission_bps` 0..5000; `commission_cents = round(subtotal *
commission_bps / 10000)` computed on the server; `payout = subtotal − commission`;
a payout period cannot overlap a paid period for the same vendor; stock is
decremented in the same statement that accepts an order; status transitions are a
fixed graph (no `collected → placed`).

**Customer** — browse by vendor and category, one basket that may span vendors,
one order with per-vendor fulfilment states.

**Owner** — vendor roster, commission per vendor, item and stock management,
order queue with per-vendor status, payout register.

**Assigned to** marketplace and any multi-seller storefront. A single-seller shop
keeps `order_items`; forcing it into vendors would be the generic model this
brief forbids.

---

## Trade assignment summary

| Model | Trades | Replaces today |
| --- | --- | --- |
| Accommodation | hotel (+ future guesthouse, campsite) | catalogue rooms with `meta: "per night"` |
| Places | gallery, hotel, property | nothing (new surface) |
| Jobs | trades, hospital, school, hospitality | nothing (new surface) |
| Sessions | gym, courses, tuition, school, kindergarten | catalogue classes with day chips |
| Vendors | marketplace, multi-seller ecommerce | catalogue items with a `vendor` string |

## Sequence and risk

1. **Sessions** first: five trades, the existing booking table already carries a
   date and a slot, and the capacity rule is well understood.
2. **Accommodation** second: it needs the nights model, and it is the visible gap
   D1 in the visual review.
3. **Vendors** third: it touches orders and money, so it waits for the payments
   hardening work.
4. **Jobs** fourth: personal data, needs the CV pipeline.
5. **Places** last: additive, no money, no personal data.

Each step is a separate change with its own tests: schema, validation, owner
routes, customer routes, and a renderer that prefers rows when present and falls
back to the catalogue when not. No step rewrites an existing project.
