# Lighthouse summary

Lighthouse 13.6, mobile defaults, local Worker at `127.0.0.1:8795`, Chromium
headless. JSON reports sit beside this file as `lighthouse-<trade>.json`.

| Trade | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Restaurant | 98 | 100 | 100 | 66 | 2.1 s | 0 | 0 ms |
| Retail | 96 | 100 | 100 | 66 | 2.6 s | 0 | 0 ms |
| Salon | 96 | 100 | 100 | 66 | 2.4 s | 0 | 0 ms |
| Hotel | 98 | 100 | 100 | 66 | 1.8 s | 0 | 0 ms |
| Professional | 95 | 100 | 100 | 66 | 2.7 s | 0 | 0 ms |

SEO is intentionally 66: every customer build carries `noindex, nofollow`
until publication. The earlier accessibility failure (`user-scalable=no`) is
fixed; the hotel cover and first room image are now eager with
`fetchpriority=high`.
