<!-- docs/drops/2026-10-loose/README.md -->

# loose, seven new tees

Aster, 2026-10-07, on Tyler's ask the same morning: "Let Aster make some better
shirts based on Neonburro main graphics and stuff, and just get creative.
They're all Japanese, kind of loose-fit shirts."

**State: listed, not printed.** All thirteen are in the shop as of 2026-10-07,
below. None has a Stripe price object or a printed sample yet. The mockups are the shop's own blank photographs from
`public/images/shop/tshirts/blanks/` with each print laid on and shaded by the
fabric's own folds, so they read as printed shirts and not as stickers. Tyler
chose to list them before any sample exists. Each mockup is replaced by a
real photograph when its first sample comes back.

`sheet.jpg` has all seven side by side.

## the rules they keep

- **The cut is the blank.** Boxy, dropped shoulder, mid weight, organic cotton,
  the same body as every shirt in the shop. Japanese in the cut.
- **Japanese in the eye, never in the alphabet.** `docs/SHOP-DIRECTION.md`:
  no Japanese symbols on the shop. The debt is flat colour, a banded sky, a
  cloud with an edge. There is no character on any of these.
- **Lime is a main colour here,** as the shop direction licenses, but each
  print still spends it on one thing.
- **A half step off the body colour** is the house print, the same move as the
  `neonburro.` tee. Where a print is tonal, its ink is the body colour taken a
  step darker on a light shirt and a step lighter on a dark one. Each master
  here is drawn for the shade it is shown on, and another shade needs its own.

## the seven

| | name | shirt | placement | the line for the shop |
|---|---|---|---|---|
| 1 | `glasses.` | sage | across the chest | Everybody knows whose glasses these are. |
| 2 | `signal.` | pinyon | centre chest | The lime star from every plate, drawn as the spiral it is. Only the middle glows. |
| 3 | `carved cloud.` | serviceberry | centre chest | The cloud off the twelfth stone, cut flat the way a woodblock would cut it, over the mesa. |
| 4 | `cimarrons.` | milk | centre chest | The ridge from town at the end of the day. Four bands of the shop's own dye and one ink. |
| 5 | `embrace what's new.` | pinyon | centre chest | The studio's line, lowercase, with the period lit. |
| 6 | `know the number.` | pinyon | left chest, pocket size | nixie's three tubes, the middle one lit. The payments app, worn small. |
| 7 | `peek.` | pinyon | rising out of the hem | He has been there the whole time. |

## the thin clouds, added the same day

Tyler, after the first seven: "I'd love to do some different cloud ones, but
it needs to be kind of like a faded cloud because cloud shirt ink is really
thick as a base color ... maybe don't use white ... one color, but thinner."

A white cloud needs a thick underbase. So these six are line work in one ink,
laid once, so they sink into the cotton and fade with it. Each is cut from the
carved cloud's own silhouette, eroded by a distance transform so the contours
follow the outer edge, with holes filled so no stray ring appears, and traced
to vector. The mockups add a soft water based look so the fabric shows
through. `sheet-clouds.jpg` has all six, masters are `masters/clouds-*.svg`.

| name | shirt | ink |
|---|---|---|
| contour | serviceberry | a shade darker than the shirt |
| scroll | salt | persimmon, with the stone's three scrolls and the mesa |
| lime line | pinyon | lime, the shop's licence |
| topo | sage | a shade darker, the cloud filled with its own contours |
| mist | milk | serviceberry, three bands of low cloud |
| drift | persimmon | a shade darker, three clouds at three sizes |

**In the shop as of 2026-10-07,** on Tyler's word: "Let's add those shirts to
the shop, please." Two lines in `src/data/products-wearable.js`, `loose.` with
six of the first seven and `clouds.` with the carved cloud and these six.
Listed, not buyable: nothing can be bought until an inventory row says so.

## where each one comes from

- `glasses.` and `peek.` are the burro from `neonburro/public/logo-main.png`,
  traced to vector with potrace on 2026-10-07 so the lines hold at full chest
  size. The lime and the cream were traced as two layers. Any other tee that
  needs the burro large should start from these two masters, not the 512 pixel
  PNG.
- `signal.` is `neonburro/public/library/marks/signal-spiral.svg`, the studio's
  world signal, unchanged in shape.
- `carved cloud.` is drawn from the collage stone `12-cloud`. The silhouette is
  rasterised, eroded by a distance transform so the two contour lines follow
  the outer edge only, and traced back to vector. Contour lines blooming inward
  is also the collage hover on neonburro.com, so the shirt and the site share
  the move.
- `cimarrons.` is drawn by hand from the ridge as it reads from town, with the
  spire standing up out of it. The four sky bands are taken toward the shop's
  persimmon dye. It is a drawing, not a survey, and the shop line does not
  claim otherwise.
- `embrace what's new.` is set in Geist 600 at -0.045em, the period the lime
  disc, the same wordmark rules as the studio.
- `know the number.` is nixie's mark from `~/Desktop/nixie/site/mark.svg`.
  Lyra is working on nixie's icon in that repo now, so this one follows
  whatever she and Tyler settle.

## before any of these can be bought

1. Tyler picks which to print first.
2. The two masters in Geist (`embrace.html`, `know-the-number.html`) get
   their type converted to outlines. They load the font from the studio's
   node_modules on this Mac and will not render anywhere else.
3. One sample per pick on the real body, photographed, and the photograph
   replaces the mockup in `public/images/shop/tshirts/loose/` or `clouds/`.
4. An inventory row, which is what makes a shirt buyable, and its clue,
   because every piece carries one. A Stripe price object is optional, the
   checkout prices by amount.

No oxford commas, no em dashes.
