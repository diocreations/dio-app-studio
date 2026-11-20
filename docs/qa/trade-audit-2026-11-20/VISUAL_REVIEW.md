# 27-trade visual acceptance review — 20 November 2026

Every trade was generated from a business prompt, captured at 390×844, and looked
at: the home screen and the screen where that business actually transacts
(booking, quote, class, viewing, enquiry). Contact sheets:
`docs/qa/trade-audit-2026-11-20/sheets/sheet-01…19.png`. Individual captures:
the folder root (`<trade>.png`) and `screens/<trade>--<screen>.png`.

This review is the evidence for the "premium design" claim. It is deliberately
not a pass/fail score: each trade is judged on hierarchy, typography, spacing,
image strategy, navigation, and whether the design suits that business.

## Verdicts

| Trade | Home | Workflow screen | Verdict |
| --- | --- | --- | --- |
| restaurant | Food hero, circled dish, from-the-kitchen card, offers panel | Menu (`restaurant--catalog`) | Strong home; **catalogue rows show empty gradient orbs, not dish photographs** (D5) |
| cafe | Arched photo, "Baked here" badge, category tabs | Reservation | Strong; best-in-class image treatment of the café library |
| shop | Search-first, 2-col product grid, real product photos | Catalogue | Strong; clean retail rhythm |
| salon | Dark luxe, day chips, treatment rows with photos | Booking | Strong; **last action sits under the tab bar** (D6) |
| gym | Black editorial, 3-photo collage, plan cards | Booking (classes) | Strong; 5-tab bar is crowded (D12) |
| clinic | Bright clinic photo, numbered specialities | Booking | Strong; quiet and credible |
| trades | Van hero, "Turn up, fix it, clean up", priced services | Book a call-out | Strong copy; **empty grey thumbnails on service rows** (D6) |
| professional | Portrait, serif, services with prices | Booking | Strong; studio-like and calm |
| property | Serif headline, search + count, featured listing | Viewing | Strong; listings read like a real agency |
| hotel | Photo hero with room card, dark rooms list | Booking | Premium; **no check-in/check-out nights** (D1) |
| studio | Serif display, 3-photo collage, packages | Booking | Strong; editorial and specific |
| auto | Condensed type, garage photo, service rows | Booking | Strong; 5-tab bar crowded (D12) |
| hospital | No imagery, departments, visiting hours, urgent CTA | Booking | Clean and honest; plain, and the largest whitespace of the set |
| ecommerce | Photo strip + piece count, grid | Catalogue | Good; top strip is busier than the shop equivalent |
| plants-indoor | Green CTA, price grid, info rows | Catalogue | Clean; **no photography at all** (D10) |
| plants-outdoor | Nursery CTA, day chips, 2-col grid, hours | Book a planting visit | Clean; **no photography**, section words used as art (D10) |
| courses | Photo collage, stats, "How a course runs" | Catalogue | Strong |
| tuition | CTA, subject rows with prices, day chips | Book a trial lesson | Clean; **no photography** (D10) |
| school | Parents' evening CTA, term chips, clubs | Book a parents' evening | Plain; **stale dates** (D8), **club names used as booking services** (D4) |
| kindergarten | Warm palette, day/session cards | Book a visit | Warm and specific; **no photography** (D10) |
| finance | Green CTA, service rows, notice panel | Booking | Good; **notice panel overlaps the hero photo** (D11) |
| agency | Rust CTA, work grid, capability rows | Quote | Clean; **no photography**; item art is decorative lettering (D10) |
| influencer | Pink, rate card, format cards | Quote | Good; **duplicate primary CTA** (D9) |
| portfolio | Serif, selected work by year | Quote | Clean; **no photography**, duplicate CTA (D9, D10) |
| film | Dark mustard, screening chips, cast index | Booking | Good; **cast members appear as bookable services** (D2) |
| gallery | Brown, "On view" with real times, works list | Booking | Good; **artworks appear as bookable services** (D3) |
| marketplace | Store chips, delivery rows, vendor sections | Catalogue | Good; **no photography**, pattern art per item (D10) |

## Defects, in the order they matter

**D1 — Hotel booking has no nights.** The booking screen offers a day, a time and
a party size. A hotel's customer chooses check-in and check-out. This is the
clearest case for the approved accommodation model; it is not a styling fix.

**D2 — Film booking's service list is the cast.** "Mara Ellison" is offered as
the service on a cinema booking. The service should be the screening (title,
date, time); the cast belongs on the detail screen.

**D3 — Gallery booking's service list is the artworks.** "Kiln Study II" is a
thing to look at, not a visit to book. The booking service should be a visit or a
tour slot.

**D4 — School booking's service list is the clubs.** A parents' evening is booked
against "Forest school". Clubs belong to a separate workflow (term enrolment).

**D5 — Restaurant catalogue rows have no dish photographs.** The home hero has a
real dish photograph, then every menu row falls back to an empty gradient orb.
The restaurant library has nine photographs; the catalogue does not use them.

**D6 — Empty image boxes remain on some trades.** Salon's last action sits under
the tab bar, and trades rows carry a small empty grey thumbnail. Both are layout
bugs, not content gaps.

**D7 — Day chips clip at the right edge without a scroll affordance.** Visible on
film, gallery, hotel, auto, professional, tuition and kindergarten. The row
scrolls, but a half-cut chip reads as a broken layout rather than "more days".

**D8 — School term chips show stale weekdays.** "Tue 12 Nov" and "Sat 7 Dec" do
not line up with the 2026 calendar. Sample schedule data must be derived, not
hard-coded.

**D9 — Duplicate primary CTA in one viewport.** Portfolio and influencer repeat
"Start a project" / "Request the rate card" at the top and bottom of the same
screen with the same weight.

**D10 — Twelve trades have no photography.** agency, hospital, gallery,
kindergarten, plants-indoor, plants-outdoor, tuition, school, portfolio,
influencer, film, marketplace. They render text, gradients and letterforms
instead, with no image boxes pretending to be photographs. This is the single
largest visual gap and it is a **content** task: licensed photography through
`docs/PHOTOGRAPHY.md`, not stock art chosen to look busy.

**D11 — Finance notice panel overlaps the hero photograph.** A "How we are paid"
panel covers roughly 40% of the hero image.

**D12 — Five-tab bars crowd their labels at 390px.** Auto, gym, hotel, property,
salon and trades. Tap targets still measure 44px, but labels truncate; four tabs
or a "More" grouping would read better.

**D13 — Vertical section words used as art.** Trades ("PLUMBING") and tuition
("TUITION CENTRE") render a letter-spaced vertical word in the item image slot.
It reads as a layout accident rather than a design decision.

## What the harness measured at the same time

525 checks across 27 trades, **12 failing** — every one of them `trade-photography`
(the D10 gap). Everything else passes: owned composition, three concepts, prompt
read as the intended trade, published/editor parity, save and reload identity,
no `undefined`, image alt text, block copy, labelled controls, no empty price
prefixes, trades-own catalogue, no horizontal overflow at 390 or 320, tap targets,
and image loading.

**The correct statement is 513 of 525 checks passing with 12 known content gaps.**
Never "498/498".

## What this review does not prove

- Animation, motion or interaction feel: these are stills.
- Behaviour with a real owner's edited content: the captures are generated from a
  prompt, not from an edited project.
- Photography quality for the twelve trades without a library, because there is
  no photography to judge.
