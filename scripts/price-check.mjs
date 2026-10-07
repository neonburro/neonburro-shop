// scripts/price-check.mjs
// SENTINEL: NB_SHOP_PRICE_CHECK_V1
//
// The local proof that the server prices the saddlebag and the browser does
// not. Run it with `node scripts/price-check.mjs` after touching src/data/ or
// anything in netlify/functions/ that takes money. It never calls Stripe,
// never opens a payment, never reads an env var and never touches a database.
//
// WHY IT BUNDLES FIRST
// netlify/functions/_shop-catalog.js imports src/data/products.js, and the
// product files use extensionless imports ('./products-digital') that plain
// Node refuses. Netlify bundles functions with esbuild (netlify.toml), so this
// does the same: it bundles the catalog and both payment handlers with esbuild,
// imports only the catalog bundle and runs real cart shapes through priceOrder,
// assertBrowserTotal and checkInventoryRows, the three pure gates. The two
// handlers are bundled and not run, which proves they still build with the
// product data inside them. esbuild comes in with vite, it is not a separate
// dependency.
//
// WHY THE EXPECTED NUMBERS ARE TYPED HERE
// They are the oracle. Deriving them from the same product files the catalog
// reads would be a check that cannot fail. When a price moves on purpose,
// this file fails and whoever moved it updates the number here, which is the
// point: a price change is something a person signs.
//
// The line shapes are what the committed CheckoutForm.jsx and
// ExpressCheckout.jsx post: the design and tier by NAME, a browser price, a
// browser delivery flag and a stripePriceId, every one of which the server
// must ignore. One case uses the September client's selectedDesignId.
//
// LOOSE. AND CLOUDS.
// Those two lines live on branch aster/shop-loose and are not on main yet.
// `--data <checkout>` bundles the catalog against another checkout's src/data
// and `--loose` says that checkout has them, so the loose and clouds cases flip
// from refused to priced:
//   node scripts/price-check.mjs --data /private/tmp/neonburro-shop-loose --loose
//
// Exits 1 on any failure.
//
// No oxford commas, no em dashes.

import { build } from 'esbuild';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argAt = process.argv.indexOf('--data');
const dataRoot = argAt > -1 ? path.resolve(process.argv[argAt + 1]) : root;
const expectLoose = process.argv.includes('--loose');

const scratch = mkdtempSync(path.join(tmpdir(), 'nb-price-check-'));
const dataPlugin = {
  name: 'data-root',
  setup(b) {
    b.onResolve({ filter: /src\/data\/products\.js$/ }, () => ({ path: path.join(dataRoot, 'src/data/products.js') }));
  },
};
const bundle = (entry, out) => build({
  entryPoints: [path.join(root, entry)],
  outfile: path.join(scratch, out),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['stripe'],
  plugins: [dataPlugin],
  logLevel: 'silent',
});

await bundle('netlify/functions/_shop-catalog.js', 'catalog.mjs');
await bundle('netlify/functions/create-payment-intent.js', 'create-payment-intent.mjs');
await bundle('netlify/functions/solana-pay-request.js', 'solana-pay-request.mjs');
const kb = (file) => `${(statSync(path.join(scratch, file)).size / 1024).toFixed(1)}KB`;

const {
  priceOrder, assertBrowserTotal, checkInventoryRows, ShopCatalogError, SHOP_CATALOG,
} = await import(pathToFileURL(path.join(scratch, 'catalog.mjs')).href);

// ── the lines, shaped the way the committed checkout posts them ─────────────
const sent = (over) => ({
  name: 'whatever the browser says',
  price: 0,
  quantity: 1,
  selectedSize: null,
  selectedDesign: null,
  selectedTier: null,
  reloadCode: null,
  delivery: 'ship',
  stripePriceId: 'price_from_the_browser',
  ...over,
});

const SHIRT = sent({ id: 'theburroship', price: 85, selectedSize: 'Mens M', selectedDesign: 'Sage' });
const PAY_TEAM = sent({ id: 'digital-gift-card', price: 1999, selectedTier: 'Team', delivery: 'digital' });
const PAY_RELOAD = sent({ id: 'digital-gift-card', price: 999, selectedTier: 'Solo', reloadCode: 'nb-card-ab12-cd34', delivery: 'digital' });
const CLUE = sent({ id: 'two-dollar-clue', price: 2, quantity: 4, selectedDesign: 'Marker', delivery: 'digital' });
const WANDS = sent({ id: 'nibble-wands', price: 99 });
const NOOK = sent({ id: 'halfway-nook', price: 75, selectedDesign: 'Copper' });
const CAP = sent({ id: 'caps', price: 45, selectedSize: 'One size, adjustable', selectedDesign: 'theburroship · Khaki' });
const EDITION = sent({ id: 'editions', price: 95, selectedSize: 'Womens S', selectedDesignId: 'crab-pocket', selectedDesign: 'Crab, pocket' });
const LOOSE = sent({ id: 'loose', price: 95, selectedSize: 'Mens L', selectedDesign: 'Peek · Pinyon' });
const CLOUDS = sent({ id: 'clouds', price: 95, selectedSize: 'Womens M', selectedDesign: 'Carved · Serviceberry' });

// ── the runner ──────────────────────────────────────────────────────────────
const results = [];
const money = (cents) => `$${(cents / 100).toFixed(2)}`;

const check = (label, fn, expect) => {
  let outcome;
  try {
    outcome = { value: fn() };
  } catch (error) {
    outcome = { error };
  }

  let pass = false;
  let said = '';
  if (outcome.error) {
    const e = outcome.error;
    said = e instanceof ShopCatalogError ? `${e.statusCode} ${e.code}  "${e.message}"` : `THREW ${e.name}: ${e.message}`;
    pass = Boolean(expect.status) && e instanceof ShopCatalogError && e.statusCode === expect.status && e.code === expect.code;
  } else if ('cents' in expect) {
    const priced = outcome.value;
    const extra = expect.also ? expect.also(priced) : null;
    said = `${priced.amountCents} cents  ${money(priced.amountCents)}  ${priced.delivery}${extra ? `  ${extra}` : ''}`;
    pass = priced.amountCents === expect.cents && (!expect.also || !extra.startsWith('WRONG'));
  } else {
    said = 'accepted';
    pass = expect.ok === true;
  }

  const wanted = expect.status ? `${expect.status} ${expect.code}` : 'cents' in expect ? `${expect.cents} cents` : 'accepted';
  results.push({ pass, label, said, wanted });
};

const ok = { ok: true };
const refused = (status, code) => ({ status, code });

// ── pricing ─────────────────────────────────────────────────────────────────
check('a shirt, theburroship Mens M Sage', () => priceOrder([SHIRT]), { cents: 8500 });
check('tiered digital, the Pay Card Team', () => priceOrder([PAY_TEAM]), { cents: 199900 });
check('Pay Card reload, Solo with a code', () => priceOrder([PAY_RELOAD]), {
  cents: 99900,
  also: (p) => (p.items[0].reloadCode === 'NB-CARD-AB12-CD34' ? `reload ${p.items[0].reloadCode}` : `WRONG reload ${p.items[0].reloadCode}`),
});
check('the $2 clue, Marker x4', () => priceOrder([CLUE]), { cents: 800 });
check('craft, nibble wands', () => priceOrder([WANDS]), { cents: 9900 });
check('craft, halfway nook in Copper', () => priceOrder([NOOK]), { cents: 7500 });
check('a cap, theburroship Khaki', () => priceOrder([CAP]), { cents: 4500 });
check('an edition by design id', () => priceOrder([EDITION]), { cents: 9500 });
check('mixed: 2 shirts, a clue, a Pay Card, a nook', () => priceOrder([
  { ...SHIRT, quantity: 2 }, { ...CLUE, quantity: 1 }, PAY_TEAM, NOOK,
]), {
  cents: 224600,
  also: (p) => (p.ships && p.delivery === 'mixed' ? 'ships yes' : 'WRONG delivery'),
});

// ── tampering ───────────────────────────────────────────────────────────────
check('tampered: shirt sent at $1', () => priceOrder([{ ...SHIRT, price: 1 }]), { cents: 8500 });
check('tampered: Pay Card Unlimited sent at $1', () => priceOrder([{ ...PAY_TEAM, selectedTier: 'Unlimited', price: 1 }]), { cents: 500000 });
check('tampered: shirt says digital', () => priceOrder([{ ...SHIRT, delivery: 'digital' }]), {
  cents: 8500,
  also: (p) => (p.items[0].delivery === 'ship' ? 'still ships' : 'WRONG delivery'),
});
check('tampered: a tier put on a shirt', () => priceOrder([{ ...SHIRT, selectedTier: 'Unlimited' }]), refused(400, 'bad_tier'));
check('tampered: a reload code on a shirt', () => priceOrder([{ ...SHIRT, reloadCode: 'NB-CARD-0000-0000' }]), refused(400, 'bad_reload'));
check('unknown id, free-shirt', () => priceOrder([sent({ id: 'free-shirt', price: 0 })]), refused(400, 'unknown_product'));
check('unknown id, constructor', () => priceOrder([sent({ id: 'constructor' })]), refused(400, 'unknown_product'));
check('unknown design, Gold', () => priceOrder([{ ...SHIRT, selectedDesign: 'Gold' }]), refused(400, 'bad_design'));
check('unknown size, XXXL', () => priceOrder([{ ...SHIRT, selectedSize: 'XXXL' }]), refused(400, 'bad_size'));
check('a size on a piece without sizes', () => priceOrder([{ ...WANDS, selectedSize: 'Mens M' }]), refused(400, 'bad_size'));
check('no tier on the Pay Card', () => priceOrder([{ ...PAY_TEAM, selectedTier: null }]), refused(400, 'bad_tier'));
check('negative quantity, -1', () => priceOrder([{ ...SHIRT, quantity: -1 }]), refused(400, 'bad_quantity'));
check('zero quantity', () => priceOrder([{ ...SHIRT, quantity: 0 }]), refused(400, 'bad_quantity'));
check('fractional quantity, 1.5', () => priceOrder([{ ...SHIRT, quantity: 1.5 }]), refused(400, 'bad_quantity'));
check('quantity 11', () => priceOrder([{ ...SHIRT, quantity: 11 }]), refused(400, 'bad_quantity'));
check('quantity as a string, "2"', () => priceOrder([{ ...SHIRT, quantity: '2' }]), refused(400, 'bad_quantity'));
check('empty saddlebag', () => priceOrder([]), refused(400, 'empty'));
check('twenty one lines', () => priceOrder(Array.from({ length: 21 }, () => CLUE)), refused(400, 'too_many_lines'));

// ── the two lines on aster/shop-loose ───────────────────────────────────────
if (expectLoose) {
  check('loose. Peek, Mens L', () => priceOrder([LOOSE]), { cents: 9500 });
  check('clouds. Carved, Womens M', () => priceOrder([CLOUDS]), { cents: 9500 });
} else {
  check('loose. before the branch merges', () => priceOrder([LOOSE]), refused(400, 'unknown_product'));
  check('clouds. before the branch merges', () => priceOrder([CLOUDS]), refused(400, 'unknown_product'));
}

// ── the browser total, a witness and never the price ────────────────────────
const shirt = priceOrder([SHIRT]);
check('browser total 85, matches', () => assertBrowserTotal(shirt, 85), ok);
check('browser total 85.009, inside a cent', () => assertBrowserTotal(shirt, 85.009), ok);
check('browser total absent', () => assertBrowserTotal(shirt, undefined), ok);
check('browser total 1, tampered', () => assertBrowserTotal(shirt, 1), refused(409, 'cart_changed'));
check('browser total "free"', () => assertBrowserTotal(shirt, 'free'), refused(409, 'cart_changed'));

// ── stock, fixed clock ──────────────────────────────────────────────────────
const NOW = Date.parse('2026-10-07T18:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const row = (productId, variantId, onHand, ageDays) => ({
  product_id: productId,
  variant_id: variantId,
  on_hand: onHand,
  updated_at: new Date(NOW - ageDays * DAY).toISOString(),
});
check('shirt, fresh row of 3', () => checkInventoryRows(shirt.items, [row('theburroship', 'sage', 3, 1)], NOW), ok);
check('shirt, row ten days old', () => checkInventoryRows(shirt.items, [row('theburroship', 'sage', 3, 10)], NOW), refused(409, 'inventory_stale'));
check('shirt, row at zero', () => checkInventoryRows(shirt.items, [row('theburroship', 'sage', 0, 1)], NOW), refused(409, 'out_of_stock'));
check('shirt, no row at all', () => checkInventoryRows(shirt.items, [], NOW), refused(409, 'out_of_stock'));
check('shirt, row for another dye only', () => checkInventoryRows(shirt.items, [row('theburroship', 'milk', 9, 1)], NOW), refused(409, 'out_of_stock'));
check('two sizes of one dye, 2 + 2 against 3', () => checkInventoryRows(
  priceOrder([{ ...SHIRT, quantity: 2 }, { ...SHIRT, selectedSize: 'Mens L', quantity: 2 }]).items,
  [row('theburroship', 'sage', 3, 1)], NOW,
), refused(409, 'out_of_stock'));
check('nibble wands, product level row', () => checkInventoryRows(priceOrder([WANDS]).items, [row('nibble-wands', null, 2, 2)], NOW), ok);
check('the $2 clue, no rows, record open', () => checkInventoryRows(priceOrder([CLUE]).items, [], NOW), ok);
check('Pay Card, a row set to zero', () => checkInventoryRows(priceOrder([PAY_TEAM]).items, [row('digital-gift-card', null, 0, 1)], NOW), refused(409, 'out_of_stock'));

// ── report ──────────────────────────────────────────────────────────────────
const width = Math.max(...results.map((r) => r.label.length)) + 2;
console.log(`price-check  data ${path.relative(process.cwd(), dataRoot) || '.'}  ${Object.keys(SHOP_CATALOG).length} products in the server catalog`);
console.log(`bundled  catalog ${kb('catalog.mjs')}  create-payment-intent ${kb('create-payment-intent.mjs')}  solana-pay-request ${kb('solana-pay-request.mjs')}`);
console.log(`catalog  ${Object.keys(SHOP_CATALOG).join(' ')}`);
console.log('');
results.forEach((r) => {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.label.padEnd(width, '.')} ${r.said}${r.pass ? '' : `   wanted ${r.wanted}`}`);
});
const failed = results.filter((r) => !r.pass).length;
console.log('');
console.log(`${results.length - failed} of ${results.length} passed`);

rmSync(scratch, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
