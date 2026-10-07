// netlify/functions/_shop-catalog.js
// SENTINEL: NB_SHOP_SERVER_CATALOG_V3
//
// The browser may describe an order, but it never prices one. Every rail that
// takes money passes the raw saddlebag through priceOrder below, and every
// option, quantity and dollar amount is rebuilt from the shop's own product
// records. A price, a name, a stripePriceId or a total sent by the browser is
// read by nobody here.
//
// ── WHY THE PRICES ARE IMPORTED AND NOT TYPED ───────────────────────────────
// V2 (Warbleur, 99c545e) carried its own frozen list of five shirt lines with
// every price typed a second time. That closed the hole and opened a drift.
// The day a price moved in src/data/products-wearable.js the page and the
// charge would disagree, and every line V2 did not know (caps, the $2 clue,
// the Pay Card, the two craft pieces, loose. and clouds.) was refused at
// checkout while the page still offered it. V3 imports ALL_PRODUCTS from
// src/data/products.js, the same object the product pages read. Netlify
// bundles functions with esbuild (netlify.toml), which follows the import into
// src/ and resolves the extensionless imports inside it. A piece is sellable
// here exactly when the site shows it, at exactly the price the site shows.
// One list, one price, nothing typed twice.
//
// If products.js ever narrows what is live (the uncommitted September work
// proposed an ACTIVE_PRODUCT_IDS list there), the server narrows with it.
//
// THE TRAP. The product files are bundled into payment functions now. Nothing
// under src/data/ that products.js reaches may import JSX, a stylesheet, an
// image or anything that touches window at module load. If one does, every
// payment function fails to build. Today they import only each other, covers.js,
// taxonomy.js and blindLead.js, all plain data. scripts/price-check.mjs bundles
// this file and both payment handlers the way Netlify does, so run it after
// touching src/data/.
//
// ── WHAT A LINE MAY SAY ─────────────────────────────────────────────────────
// The browser sends what ProductHero.jsx builds and the checkout components
// forward: id, quantity, selectedSize, selectedDesign (the design NAME, the
// committed client never sends an id), selectedDesignId (the September client
// does), selectedTier (the tier LABEL) and reloadCode. The rules mirror how
// ProductHero reads a record, keep the two in step:
//   sizes     record.sizes is a list and the size must be one of them
//   designs   hasVariants with variantType 'design', matched by id or name
//   tiers     hasVariants with variantType 'tier', priceOptions matched by id
//             or label, and the tier price replaces the record price
//   reload    only where the record says reloadable. Letters, digits, spaces
//             and hyphens. Not checked against a ledger, there is none yet,
//             see src/data/products-digital.js
// An option the record does not have is refused, never ignored, so a crafted
// line cannot put a tier on a shirt. Anything unknown is a 400 with a plain
// sentence. Quantity is a whole number from 1 to 10, the same ceiling as the
// stepper on the product page (ProductHero.jsx, max 10).
//
// ── DELIVERY ────────────────────────────────────────────────────────────────
// Digital or ship comes from the record, using the same three fields as
// isDigitalItem in src/context/CartContext.jsx (category, room, delivery).
// Keep the two in step. The browser's own delivery flag is ignored.
//
// ── INVENTORY ───────────────────────────────────────────────────────────────
// Stock stays in public.shop_inventory because Tyler edits it in the Supabase
// Table Editor without a deploy. A piece that ships needs a row for the chosen
// design with enough on hand, touched in the last seven days. Missing, zero,
// short or stale fails closed. The schema counts a design across sizes, so
// size level stock is a later admin upgrade. A digital piece is not counted.
// It is open when its record says inStock and no row says otherwise, which is
// the answer isBuyable in src/data/inventory.js gives the page.
//
// ── THE BROWSER TOTAL ───────────────────────────────────────────────────────
// The committed client still sends amount. It never prices anything. When it
// is present and sits more than a cent off the server total the order is
// refused as cart_changed, because the Payment Element was drawn for the
// browser's number and charging a different one would surprise the customer.
//
// Every rail is the same merchandise price. NEONBURRO participation may earn a
// separate gift once its rules are agreed, but it never changes a price.
//
// No oxford commas, no em dashes.

import { randomUUID } from 'node:crypto';
import { ALL_PRODUCTS } from '../../src/data/products.js';

const QUANTITY_MAX = 10;
const LINES_MAX = 20;
const STRIPE_MIN_CENTS = 50;
const INVENTORY_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const RELOAD_CODE = /^[A-Z0-9][A-Z0-9 -]{5,39}$/;

export class ShopCatalogError extends Error {
  constructor(message, statusCode = 400, code = 'invalid_order') {
    super(message);
    this.name = 'ShopCatalogError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());

const centsOf = (dollars) => {
  const cents = Math.round(Number(dollars) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
};

// Same three fields as isDigitalItem in src/context/CartContext.jsx.
const isDigitalRecord = (record) =>
  record.category === 'Digital' || record.room === 'sent' || record.delivery === 'digital';

const entryFor = (record) => {
  const hasDesigns = Boolean(record.hasVariants) && record.variantType === 'design'
    && Array.isArray(record.designs) && record.designs.length > 0;
  const hasTiers = Boolean(record.hasVariants) && record.variantType === 'tier'
    && Array.isArray(record.priceOptions) && record.priceOptions.length > 0;

  return Object.freeze({
    id: record.id,
    name: record.name,
    priceCents: hasTiers ? null : centsOf(record.price),
    sizes: Array.isArray(record.sizes) && record.sizes.length ? Object.freeze(record.sizes.map(String)) : null,
    designs: hasDesigns
      ? Object.freeze(record.designs.map((d) => Object.freeze({ id: String(d.id), name: String(d.name ?? d.id) })))
      : null,
    tiers: hasTiers
      ? Object.freeze(record.priceOptions.map((t) => Object.freeze({
        id: String(t.id),
        name: String(t.label ?? t.id),
        priceCents: centsOf(t.price),
      })))
      : null,
    reloadable: Boolean(record.reloadable),
    delivery: isDigitalRecord(record) ? 'digital' : 'ship',
    inStock: Boolean(record.inStock),
    comingSoon: Boolean(record.comingSoon),
  });
};

export const SHOP_CATALOG = Object.freeze(Object.fromEntries(
  Object.values(ALL_PRODUCTS)
    .filter((record) => record && record.id)
    .map((record) => [record.id, entryFor(record)])
));

// Own keys only. A line with id 'constructor' must be a 400, not a 500.
const entryById = (id) => (Object.hasOwn(SHOP_CATALOG, id) ? SHOP_CATALOG[id] : null);

const pick = (options, value) => (value ? options.find((o) => o.id === value || o.name === value) || null : null);

const priceLine = (raw) => {
  if (!raw || typeof raw !== 'object') {
    throw new ShopCatalogError('A saddlebag line could not be read. Refresh and try again.');
  }

  const entry = entryById(text(raw.id));
  if (!entry) {
    throw new ShopCatalogError('That piece is not in the shop. Remove it from the saddlebag and try again.', 400, 'unknown_product');
  }
  if (entry.comingSoon) {
    throw new ShopCatalogError(`${entry.name} is not open yet.`, 409, 'product_closed');
  }

  const { quantity } = raw;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > QUANTITY_MAX) {
    throw new ShopCatalogError(`Quantity must be a whole number from 1 to ${QUANTITY_MAX}.`, 400, 'bad_quantity');
  }

  const sizeWanted = text(raw.selectedSize);
  let selectedSize = null;
  if (entry.sizes) {
    if (!entry.sizes.includes(sizeWanted)) {
      throw new ShopCatalogError(`Choose one of the sizes ${entry.name} comes in.`, 400, 'bad_size');
    }
    selectedSize = sizeWanted;
  } else if (sizeWanted) {
    throw new ShopCatalogError(`${entry.name} does not come in sizes.`, 400, 'bad_size');
  }

  const designWanted = text(raw.selectedDesignId) || text(raw.selectedDesign);
  let design = null;
  if (entry.designs) {
    design = pick(entry.designs, designWanted);
    if (!design) throw new ShopCatalogError(`Choose one of the designs ${entry.name} comes in.`, 400, 'bad_design');
  } else if (designWanted) {
    throw new ShopCatalogError(`${entry.name} does not come in designs.`, 400, 'bad_design');
  }

  const tierWanted = text(raw.selectedTierId) || text(raw.selectedTier);
  let tier = null;
  if (entry.tiers) {
    tier = pick(entry.tiers, tierWanted);
    if (!tier) throw new ShopCatalogError(`Choose one of the options ${entry.name} comes in.`, 400, 'bad_tier');
  } else if (tierWanted) {
    throw new ShopCatalogError(`${entry.name} does not come in options.`, 400, 'bad_tier');
  }

  const reloadWanted = text(raw.reloadCode).toUpperCase();
  let reloadCode = null;
  if (reloadWanted) {
    if (!entry.reloadable) throw new ShopCatalogError(`${entry.name} cannot be reloaded.`, 400, 'bad_reload');
    if (!RELOAD_CODE.test(reloadWanted)) {
      throw new ShopCatalogError('That card code does not look right. It is in the email the card arrived in.', 400, 'bad_reload');
    }
    reloadCode = reloadWanted;
  }

  const priceCents = tier ? tier.priceCents : entry.priceCents;
  if (!priceCents) throw new ShopCatalogError(`${entry.name} has no price yet.`, 409, 'product_closed');

  return {
    id: entry.id,
    name: entry.name,
    price: priceCents / 100,
    priceCents,
    quantity,
    selectedSize,
    selectedDesign: design ? design.name : null,
    selectedDesignId: design ? design.id : null,
    selectedTier: tier ? tier.name : null,
    selectedTierId: tier ? tier.id : null,
    reloadCode,
    delivery: entry.delivery,
  };
};

export const priceOrder = (rawItems) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new ShopCatalogError('Nothing in the saddlebag', 400, 'empty');
  }
  if (rawItems.length > LINES_MAX) {
    throw new ShopCatalogError(`One order carries at most ${LINES_MAX} saddlebag lines.`, 400, 'too_many_lines');
  }

  const items = rawItems.map(priceLine);
  const amountCents = items.reduce((total, item) => total + item.priceCents * item.quantity, 0);
  if (amountCents < STRIPE_MIN_CENTS) throw new ShopCatalogError('The order total is too small to take.');

  const kinds = new Set(items.map((item) => item.delivery));
  return {
    items,
    amountCents,
    amountUsd: amountCents / 100,
    delivery: kinds.size === 2 ? 'mixed' : kinds.has('digital') ? 'digital' : 'ship',
    ships: kinds.has('ship'),
    discountBps: 0,
  };
};

// The browser's total is a witness, never the price. Absent is fine.
export const assertBrowserTotal = (priced, browserAmount) => {
  if (browserAmount === undefined || browserAmount === null || browserAmount === '') return;
  const cents = Math.round(Number(browserAmount) * 100);
  if (!Number.isFinite(cents) || Math.abs(cents - priced.amountCents) > 1) {
    throw new ShopCatalogError(
      'The saddlebag changed. Refresh the page and if the total still looks wrong remove the piece and add it again.',
      409,
      'cart_changed',
    );
  }
};

// Pure, so scripts/price-check.mjs can prove the stock rules without a database.
export const checkInventoryRows = (items, rows, now = Date.now()) => {
  const byKey = new Map((rows || []).map((row) => [`${row.product_id}:${row.variant_id || ''}`, row]));
  const wanted = new Map();
  items.forEach((item) => {
    const key = `${item.id}:${item.selectedDesignId || ''}`;
    const prior = wanted.get(key);
    wanted.set(key, { item, quantity: (prior ? prior.quantity : 0) + item.quantity });
  });

  wanted.forEach(({ item, quantity }, key) => {
    const row = byKey.get(key);
    const label = item.selectedDesign ? `${item.name} in ${item.selectedDesign}` : item.name;

    if (item.delivery === 'digital') {
      const open = row ? Number(row.on_hand) >= quantity : Boolean(entryById(item.id)?.inStock);
      if (!open) throw new ShopCatalogError(`${label} is not available right now.`, 409, 'out_of_stock');
      return;
    }

    if (!row || !(Number(row.on_hand) >= quantity)) {
      throw new ShopCatalogError(`${label} is not available in that quantity right now.`, 409, 'out_of_stock');
    }
    const updated = new Date(row.updated_at).getTime();
    if (!Number.isFinite(updated) || now - updated > INVENTORY_FRESH_MS) {
      throw new ShopCatalogError('Inventory needs a fresh count before checkout', 409, 'inventory_stale');
    }
  });
};

const databaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || null;
const readKey = () =>
  process.env.SUPABASE_SECRET_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || null;
const writeKey = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || null;

export const shopDb = async (path, { method = 'GET', body, prefer, write = false } = {}) => {
  const url = databaseUrl();
  const key = write ? writeKey() : readKey();
  if (!url || !key) throw new ShopCatalogError('Shop database is unavailable', 503, 'database_unavailable');

  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('shop database request failed', response.status, detail.slice(0, 160));
    throw new ShopCatalogError('Shop database is unavailable', 503, 'database_unavailable');
  }
  if (response.status === 204) return null;
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
};

// The ids come from SHOP_CATALOG after priceOrder, never from the browser.
export const assertFreshInventory = async (items) => {
  const ids = [...new Set(items.map((item) => item.id))];
  const rows = await shopDb(`shop_inventory?select=product_id,variant_id,on_hand,updated_at&product_id=in.(${ids.join(',')})`);
  checkInventoryRows(items, rows);
};

const clip = (value, max) => String(value ?? '').slice(0, max);

export const writeOrderReceipt = async ({
  checkoutKey,
  rail,
  providerReference,
  currency,
  amountUsd,
  amountToken = null,
  priceSource = null,
  priceQuotedAt = null,
  customer,
  items,
  status = 'pending',
}) => {
  const rows = await shopDb('shop_orders?on_conflict=rail,provider_reference', {
    method: 'POST',
    write: true,
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      checkout_key: clip(checkoutKey, 120),
      rail,
      provider_reference: clip(providerReference, 160),
      status,
      currency,
      amount_usd: amountUsd,
      amount_token: amountToken,
      discount_bps: 0,
      price_source: priceSource,
      price_quoted_at: priceQuotedAt,
      customer: customer || {},
      items,
    },
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
};

export const findOrderReceipt = async ({ checkoutKey, rail }) => {
  const rows = await shopDb(
    `shop_orders?checkout_key=eq.${encodeURIComponent(checkoutKey)}&rail=eq.${encodeURIComponent(rail)}&select=*&limit=1`,
    { write: true },
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
};

export const updateOrderReceipt = async ({ rail, providerReference, values }) => {
  const rows = await shopDb(
    `shop_orders?rail=eq.${encodeURIComponent(rail)}&provider_reference=eq.${encodeURIComponent(providerReference)}`,
    { method: 'PATCH', write: true, prefer: 'return=representation', body: values },
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
};

export const checkoutKeyFrom = (value) => {
  const key = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{16,120}$/.test(key)) {
    throw new ShopCatalogError('Checkout session is missing. Refresh and try again.');
  }
  return key;
};

// The committed client sends no checkoutKey. V2 required one, which refused
// every order that client could make. A browser key is still validated and a
// retry with it still reuses its intent. Without one the server mints a key,
// the receipt is still written and a retry opens a fresh intent, as before V2.
export const checkoutKeyOrMint = (value) => {
  if (value === undefined || value === null || value === '') {
    return { key: `srv_${randomUUID().replaceAll('-', '')}`, minted: true };
  }
  return { key: checkoutKeyFrom(value), minted: false };
};
