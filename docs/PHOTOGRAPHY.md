# Flagship photography

The fifteen flagship trades ship with a local, royalty-free photo library so a
generated app has real imagery without a stock API key. The images are sample
photography, not photographs of the owner's property, dishes or team; the ten
generated scenes in batch 3 are model-generated sample photography and are not
presented as real premises or staff. Owner uploads remain the override and are
stored privately in R2.

## Delivery

- Source files are downloaded from Unsplash and re-encoded as WebP at 320, 640
  and 1280 pixels wide (4:3 crop), using `cwebp -q 68/72`.
- Files live in `public/images/flagship/<scene>-<width>.webp`; the built Worker
  serves them from the same origin.
- `src/worker/flagshipImages.ts` owns the scene list, alt text, and responsive
  `srcset`. Flagship blocks and catalogue/detail tiles use unique scene indices;
  a product or dish does not reuse another item's photograph.
- `src/worker/photos.ts` falls back to this library when `PEXELS_API_KEY` is not
  configured. Pexels remains the wider optional pool for other trades.
- Uploaded project media (`/p/:token/media/...`) takes precedence over stock
  photography in the editor and the published app.

## Sources

All images are used under the [Unsplash License](https://unsplash.com/license).
Source IDs are retained so an image can be traced or replaced.

| Scene | Unsplash photo ID |
| --- | --- |
| restaurant-burrata | `Yw6fO5vewuw` |
| restaurant-bread | `1509440159596-0249088772ff` |
| restaurant-grill | `1555939594-58d7cb561ad1` |
| restaurant-pasta | `1621996346565-e3dbc646d9a9` |
| restaurant-dining | `1414235077428-338989a2e8c0` |
| restaurant-dessert | `1551024506-0bccd828d307` |
| restaurant-cocktail | `1514362545857-3bc16c4c7d1b` |
| restaurant-room | `1517248135467-4c7edcad34c4` |
| restaurant-table | `1504674900247-0877df9cc836` |
| shop-ceramics | `1610701596007-11502861dcfa` |
| shop-plates | `1578749556568-bc2c40e68b61` |
| shop-vase | `1602143407151-7111542de6e8` |
| shop-linen | `1493663284031-b7e3aefcae8e` |
| shop-sofa | `1555041469-a586c61ea9bc` |
| shop-chair | `1567538096630-e0c55bd6374c` |
| shop-stool | `1503602642458-232111445657` |
| salon-stylist | `1595476108010-b4d1f102b1b1` |
| salon-colour | `1560869713-7d0a29430803` |
| salon-styling | `1522337360788-8b13dee7a37e` |
| salon-room | `1560066984-138dadb4c035` |
| salon-interior | `1633681926022-84c23e8cb2d6` |
| salon-makeup | `1512496015851-a90fb38ba796` |
| salon-nails | `1604654894610-df63bc536371` |
| salon-tools | `1527799820374-dcf8d9d4a388` |
| hotel-terrace | `1566073771259-6a8506099945` |
| hotel-palms | `1551882547-ff40c63fe5fa` |
| hotel-beach | `1571896349842-33c89424de2d` |
| hotel-courtyard | `1582719508461-905c673771fd` |
| hotel-pool | `1540541338287-41700207dee6` |
| hotel-breakfast | `1533777857889-4be7c70b33f7` |
| hotel-exterior | `1564501049412-61c2a3083791` |
| pro-office | `1497366811353-6870744d04b2` |
| pro-team | `1521737711867-e3b97375f902` |
| pro-portrait | `1560250097-0b93528c311a` |
| pro-adviser | `1573496359142-b8d87734a5a2` |
| pro-meeting | `1556761175-b413da4baf72` |
| pro-desk | `1454165804606-c3d57bc86b40` |

The source URLs follow
`https://images.unsplash.com/photo-<id>?w=<width>&h=<4:3 height>&fit=crop&crop=entropy&q=78&fm=webp`.
The two professional portraits use `crop=faces` instead of `crop=entropy`, so a
face stays in the 4:3 frame rather than being cut at the top.
The burrata photograph was cropped from the original vertical download rather
than an imgix crop, because its Unsplash page uses the shortcode above.

## Batch 3 scenes (November 2026)

Twenty-eight new scenes, each delivered at 320/640/1280 WebP. Ten were generated
for this batch (trades and auto), nine are Unsplash photographs, and nine reuse
existing library scenes where the subject genuinely matches. No scene is a
photograph of a real client business.

| Trade | Scenes | Source |
| --- | --- | --- |
| Trades | van, boiler, tools, engineer, engineer 2, bathroom | generated |
| Auto | bay, lift, diagnostics, technician | generated |
| Auto | tools | reuses `trades-tools` |
| Online store | tote `1591561954557-26941169b49e`, pillow `1584100936595-c0654b55a2e2`, warehouse `1587293852726-70cdb56c2866`, sale `1607083206968-13611e3d76db` | Unsplash |
| Online store | ceramics, wooden product | reuses `shop-ceramics`, `shop-stool` |
| Courses | workshop `1522202176988-66273c2fd55f`, notes `1434030216411-0b793f4b4173`, online `1516321318423-f06f85e504b3`, review `1454165804606-c3d57bc86b40` | Unsplash |
| Courses | guide | reuses `pro-desk` |
| Finance | desk `1554224155-6726b3ff858f` | Unsplash |
| Finance | meeting, adviser, adviser 2, office, consult | reuses `pro-meeting`, `pro-adviser`, `pro-portrait`, `pro-office`, `pro-team` |

Generated scenes were requested for this project and stored as local files only;
there is no runtime image-generation call in the product. The build script is
`scripts/build-batch3-images.mjs` and retains every source id. The online store’s
fourth product uses the pale wooden stool scene so a wooden item is not shown as
upholstery; item-level photos in the catalogue editor remain the honest override
for any specific product.

## Replacement policy

Owners should replace any sample photograph that does not show their business.
The editor's photo control uploads a real image, stores 320/640/1280 WebP
variants in R2 and updates the document node. The editor's sample-content notice
links directly to catalogue and details editing; stock photography is never
presented as the owner's own work.

The catalogue editor adds a photo per item as well as per block. A restaurant
dish, retail product, salon treatment, hotel room or professional service keeps
its own media id, alt text, focal point and fit. The item photo wins over the
trade scene in the feature, list and detail renderers; replacing the library
file keeps the same id, so every item follows the new bytes without being
re-pointed. The 390px before/after pair is
`docs/qa/qa-item-before-390.png` and `docs/qa/qa-item-photo-390.png`.
