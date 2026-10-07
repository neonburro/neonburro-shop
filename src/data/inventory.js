// src/data/inventory.js
// SENTINEL: NB_SHOP_INVENTORY_V2
//
// The seam between this shop and Pulse. Everything about whether a thing can be
// bought right now lives behind these three functions, so when Pulse becomes the
// system of record no component has to change.
//
// WHY A SEAM AND NOT JUST A FETCH
// The product files are static and get deployed with the site, which means a
// build is required to change a number. Stock changes when somebody ships a box
// and nobody wants to trigger a deploy to say so. So the product files carry the
// intent (this product exists, here are its variants) and this file carries the
// truth (how many are on the shelf), and the truth is allowed to arrive late.
//
// THREE STATES, NOT TWO
//   number  · we asked Pulse and it told us. Trust it.
//   null    · we have not heard back yet, or the endpoint is down. Show the
//             product without a stock claim rather than guessing.
//   0       · genuinely none. Say so.
// Collapsing null into 0 makes the shop lie during the first paint of every page
// load, which is the exact failure that makes people distrust an out of stock
// badge. Keep the three states.
//
// FALLBACK IS ALWAYS CLOSED
// If the endpoint never answers, isBuyable returns whatever the product file
// says, and every product file currently says false. A network problem cannot
// accidentally open the store.
//
// A STALE COUNT IS NO COUNT, FOR ANYTHING THAT SHIPS (V2, 2026-10-07)
// Checkout refuses a piece that ships when its row is older than seven days
// (checkInventoryRows in netlify/functions/_shop-catalog.js). Until V2 this
// file ignored the age, so the page offered a shirt and checkout then said
// "Inventory needs a fresh count", which is the page lying. Each row's age
// now rides in the cache beside its number, and isBuyable and stockState read
// a stale row as zero for anything that ships. A digital piece is never
// counted by age, same as the server. COUNT_FRESH_MS must match
// INVENTORY_FRESH_MS there, and isDigitalProduct must match isDigitalRecord
// there and isDigitalItem in src/context/CartContext.jsx. Tyler counts in
// Pulse, Shop, Stock, and a count there makes a row fresh again.
//
// No oxford commas, no em dashes.

const ENDPOINT = '/.netlify/functions/shop-inventory';
const STALE_AFTER_MS = 60_000;
// Must match INVENTORY_FRESH_MS in netlify/functions/_shop-catalog.js.
const COUNT_FRESH_MS = 7 * 24 * 60 * 60 * 1000;

// Same three fields as isDigitalRecord in netlify/functions/_shop-catalog.js
// and isDigitalItem in src/context/CartContext.jsx. Change all three.
const isDigitalProduct = (product) =>
  product.category === 'Digital' || product.room === 'sent' || product.delivery === 'digital';

let cache = null;        // { byKey: {}, fetchedAt: number }
let inflight = null;
const listeners = new Set();

const key = (productId, variantId) => (variantId ? `${productId}:${variantId}` : productId);

const notify = () => listeners.forEach((fn) => { try { fn(); } catch { /* a bad listener is not our problem */ } });

export const subscribeInventory = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const primeInventory = async ({ force = false } = {}) => {
  const fresh = cache && Date.now() - cache.fetchedAt < STALE_AFTER_MS;
  if (fresh && !force) return cache.byKey;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(ENDPOINT, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`inventory ${res.status}`);
      const body = await res.json();
      const byKey = {};
      const stale = {};
      (body.items || []).forEach((row) => {
        const k = key(row.productId, row.variantId);
        byKey[k] = Number(row.onHand);
        const counted = new Date(row.updatedAt).getTime();
        if (!Number.isFinite(counted) || Date.now() - counted > COUNT_FRESH_MS) stale[k] = true;
      });
      cache = { byKey, stale, fetchedAt: Date.now() };
      notify();
      return byKey;
    } catch {
      // Leave the previous cache in place. A failed refresh should not wipe
      // numbers we already showed the customer.
      return cache ? cache.byKey : null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
};

// number | null. null means we do not know yet. With counted, a row whose
// count is older than COUNT_FRESH_MS reads as zero, the way checkout reads it.
export const stockFor = (productId, variantId = null, { counted = false } = {}) => {
  if (!cache) return null;
  const read = (k) => (counted && cache.stale && cache.stale[k] ? 0 : cache.byKey[k]);
  const exactKey = key(productId, variantId);
  if (typeof cache.byKey[exactKey] === 'number') return read(exactKey);
  if (variantId) return null;
  // No product level row, so sum the variants we do have.
  const prefix = `${productId}:`;
  const rows = Object.keys(cache.byKey).filter((k) => k.startsWith(prefix));
  if (!rows.length) return null;
  return rows.reduce((n, k) => n + Number(read(k) || 0), 0);
};

// The only question a component should ask. checkInventoryRows in
// netlify/functions/_shop-catalog.js asks it again at payment, stricter: a
// piece that ships needs a fresh positive row there, a digital piece gets this
// same answer. Change one, change both.
export const isBuyable = (product, variantId = null) => {
  if (!product) return false;
  const live = stockFor(product.id, variantId, { counted: !isDigitalProduct(product) });
  if (live === null) return Boolean(product.inStock);
  return live > 0;
};

// For the badge. Returns one of: 'unknown' | 'out' | 'low' | 'in' | 'soon'
export const stockState = (product, variantId = null) => {
  if (!product) return 'unknown';
  if (product.comingSoon) return 'soon';
  const live = stockFor(product.id, variantId, { counted: !isDigitalProduct(product) });
  if (live === null) return product.inStock ? 'in' : 'out';
  if (live <= 0) return 'out';
  if (live <= 3) return 'low';
  return 'in';
};

export default { primeInventory, subscribeInventory, stockFor, isBuyable, stockState };
