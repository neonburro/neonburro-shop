# neonburro shop

The store at shop.neonburro.com. Worn, carried, sent, and every piece carries float
toward The Blind Lead. React SPA on Vite with Netlify functions, same house as
`../neonburro` (the studio), same Supabase project (`sspbripimqvfdkfbpubq`), same
Stripe account, same fonts, same geometry, its own cart and checkout. `AGENTS.md`
points here. The studio's `CLAUDE.md` and `docs/02-engineering/` are the wider map.

## Hard rules, same as the studio

- **JavaScript only.** Never TypeScript.
- **Full file rewrites only.** Never a diff or a partial snippet.
- **yarn, never npm.**
- **No Oxford commas. No em dashes and no en dashes.** Hyphens in compound words are fine.
- **Trailing slashes on every route.** `/product/two-dollar-clue/`.
- **Path comment as the first line of every file**, and a helper block above the code on
  anything non trivial explaining why it is shaped that way and what breaks if changed.
- **No inline hash comments in shell commands.**
- **New files** get `mkdir -p` and `touch` before the write.
- **Never handle secrets, never submit a payment.** The shop runs LIVE Stripe keys.
  Probe functions with curl and read the JSON instead.

## Theme, a copy on purpose

`src/theme/typography.js` and `src/theme/layout.js` are copies of the studio's. Same
pixel scale, same rail (20/40), same sheet (1680, left aligned, never centred), same
EASE `cubic-bezier(0.16, 1, 0.3, 1)`, same TILE surface. **If the studio moves a value,
move it here in the same commit.** `src/theme/colors.js` carries the brand values under
the shop's older key names (`brand.primary` is Topo Lime, `dark.black` the canvas,
`text.*` the same ink). `src/theme/index.js` wires it, and its one deliberate
difference from the studio is that the solid button is lime at rest, because the whole
store is lime. Everything else about the brand (wordmark, period, kicker, voice) is in
the studio's brief, linked from `../neonburro/docs/02-engineering/README.md`.

Lime everywhere, no teal, no cyan, no magenta. Kickers not badges. Product cards carry
the title and the material line only. No containers around content on a phone.

## Layout of the shop

```
src/pages/Home/               hero (envelopes, drop shadow), product tiles, the board link
src/pages/ProductDetail/      one product, sizes and designs, add to saddlebag
src/pages/BlindLead/          the hunt, the board and the rules
src/pages/Cart/               the saddlebag page
src/pages/Checkout/           index.jsx owns the Elements groups and finalizeOrder
  components/ExpressCheckout  Apple Pay, Google Pay, Link, one tap
  components/CheckoutForm     Link email, AddressElement, Payment Element, clickwrap terms
  components/DirectSolana     USDC or SOL straight to the wallet, outside Stripe
  components/OrderSummary     the saddlebag at checkout, plate on desktop, bar on a phone
  components/CheckoutSuccess  Yours. / Received, settling. / Landed.
  stash.js                    what survives a redirect rail
src/components/cart/          SaddlebagPill (floating), CartDrawer, SaddlebagDock (ultrawide), SaddlebagLines
src/components/navigation/    ShopNavigation, full width bar that thins and never hides
src/components/common/        Footer (the yard dispensing), shared bits
src/context/CartContext.jsx   the saddlebag, storage read in the useState initializer
src/data/                     products-wearable, products-craft, products-digital, taxonomy, inventory, blindLead
netlify/functions/            create-payment-intent, shop-inventory, _solana, solana-pay-request, solana-pay-status, solana-pay-sweep
```

The saddlebag is one object in three homes: a floating pill bottom right, a drawer, and
above `DOCK_MIN` (sheet plus dock plus two rails, derived in `layout.js`) a fixed column
in the empty right hand gap. `CartContext` reads storage inside the `useState`
initializer because StrictMode's double mount used to wipe it.

## Checkout, the three rails

1. **Express.** `ExpressCheckoutElement` in its own `Elements` group. Draws only what
   the device can pay with. Needs the domain registered in Stripe (Settings → Payment
   method domains) or it draws nothing.
2. **The form.** Link email, AddressElement (US only, autocomplete), Payment Element
   with `paymentMethodOrder` card, crypto, link, cashapp, amazon_pay, wallets `never`
   because Express has them. Stablecoins redirect to crypto.stripe.com and come back to
   `/checkout/`, `stash.js` carries the customer across. Terms are clickwrap.
3. **Direct Solana.** `DirectSolana.jsx` posts to `solana-pay-request`, shows the QR
   and the address, polls `solana-pay-status`. Everything optional for the customer.
   Verified on chain by reference or by amount, see `netlify/functions/_solana.js`.
   `solana-pay-sweep` runs every five minutes from `netlify.toml`.

All three call `finalizeOrder` in `Checkout/index.jsx` with the same formData shape.
It posts the Netlify `shop-order` form (a convenience copy, Stripe or the chain is the
record), clears the cart and shows `CheckoutSuccess`.

## Env on the Netlify site (neonburroshop, `62292049-ccf8-4022-8f23-bd36788a3e8d`)

`STRIPE_SECRET_KEY` (rotate with the studio's, it was found expired on 2026-08-16),
`VITE_STRIPE_PUBLISHABLE_KEY`, `SUPABASE_URL` and a service key (names in
`shop-inventory.js`), `RESEND_API_KEY` and `NOTIFY_EMAIL` for the direct rail email,
`SOLANA_RPC_URL` optional, `SOLANA_RECIPIENT` optional.

## Assets

Everything webp, sized to display, transparent product art. `public/og-image.jpg` is
the share card, drawn by the studio's `scripts/og-cards.mjs` with `--site
https://shop.neonburro.com`. Favicons come from the studio's `scripts/favicons.mjs
--out ../neonburro-shop/public`, links at `?v=5`.

## Known and open

- The main chunk is about 715KB with no `manualChunks`. Stripe.js is loaded on the
  checkout route only. Splitting the rest is worth doing when the studio's split lands.
- Stripe Tax is not on. Order summary says "calculated at checkout" and must not fake a
  number.
- Pay Card reload codes ride on PaymentIntent metadata until the ledger lands in Pulse.
- Fulfilment webhook and Pay Card ledger are the next build.

## Before committing

`yarn build`, read the chunk table, show `git status --short` and the diff stat. Push
when asked to deploy, Netlify builds from main.

## Cloud sessions

Tyler, 2026-10-06: use the cloud session credits. A cloud session clones this
repository from GitHub and cannot see the memory folder on the Mac, so
anything a session must know lives in this file or in `docs/`. The studio
canon is neonburro's `CLAUDE.md`, and how to start a cloud session, what it
can reach and what stays local is neonburro
`docs/02-engineering/cloud-sessions.md`. A cloud session only sees what was
pushed, so push a branch for it. A push to main here is a production deploy and costs Netlify credits, so a cloud session works on a branch and Warbleur merges.
