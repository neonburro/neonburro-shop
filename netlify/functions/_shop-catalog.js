// netlify/functions/_shop-catalog.js
// SENTINEL: NB_SHOP_SERVER_CATALOG_V2
//
// The browser may describe an order, but it never prices one. Stripe, direct
// Solana and the public calculator pass their raw saddlebag through this file.
// Only the five shirt lines below are accepted and every option, quantity and
// dollar amount is rebuilt from this server-owned catalog.
//
// Inventory stays in public.shop_inventory because Tyler can edit it in the
// Supabase Table Editor without a deploy. A positive row must exist for the
// selected design and must have been touched recently. Missing, zero or stale
// inventory fails closed. The current schema counts a design across sizes, so
// size-specific stock remains a later admin upgrade.
//
// Every rail is the same merchandise price. NEONBURRO participation may earn
// a separate gift once its proof and fulfilment rules are agreed, but it never
// changes what the shirt costs.
//
// No oxford commas, no em dashes.

const SIZES = ['Mens S', 'Mens M', 'Mens L', 'Mens XL', 'Womens S', 'Womens M', 'Womens L'];
const INVENTORY_FRESH_MS = 7 * 24 * 60 * 60 * 1000;

const named = (id, name) => ({ id, name });
const shades = (...ids) => ids.map((id) => named(id, id[0].toUpperCase() + id.slice(1)));

export const SHOP_CATALOG = Object.freeze({
  theburroship: {
    id: 'theburroship',
    name: 'theburroship.',
    priceCents: 8500,
    sizes: SIZES,
    designs: shades('milk', 'oat', 'wheat', 'sage', 'greengage', 'persimmon', 'serviceberry', 'pinyon'),
  },
  'neonburro-tee': {
    id: 'neonburro-tee',
    name: 'neonburro.',
    priceCents: 8500,
    sizes: SIZES,
    designs: shades('milk', 'salt', 'sage', 'greengage', 'serviceberry', 'persimmon', 'pinyon'),
  },
  blanks: {
    id: 'blanks',
    name: 'blanks.',
    priceCents: 6500,
    sizes: SIZES,
    designs: shades('milk', 'salt', 'sage', 'greengage', 'serviceberry', 'persimmon', 'pinyon'),
  },
  horizon: {
    id: 'horizon',
    name: 'horizon.',
    priceCents: 9500,
    sizes: SIZES,
    designs: [named('greengage', 'Greengage'), named('indigo', 'Indigo')],
  },
  editions: {
    id: 'editions',
    name: 'editions.',
    priceCents: 9500,
    sizes: SIZES,
    designs: [
      named('prairie-dog', 'The Prairie Dog'),
      named('prairie-dog-pocket', 'Prairie Dog, pocket'),
      named('diver', 'The Diver'),
      named('diver-pocket', 'Diver, pocket'),
      named('warbleur', 'The Hooded Warbleur'),
      named('warbleur-pocket', 'Warbleur, pocket'),
      named('crab', 'The Crab'),
      named('crab-pocket', 'Crab, pocket'),
      named('airship-over-the-rocks', 'Airship Over the Rocks'),
      named('airship-night', 'Airship at Night'),
      named('canyon-doorway', 'The Canyon Doorway'),
    ],
  },
});

export class ShopCatalogError extends Error {
  constructor(message, statusCode = 400, code = 'invalid_order') {
    super(message);
    this.name = 'ShopCatalogError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const roundMoney = (cents) => Math.round(cents) / 100;

const designFor = (product, item) => {
  const value = String(item.selectedDesignId || item.selectedDesign || '').trim();
  return product.designs.find((design) => design.id === value || design.name === value) || null;
};

export const priceOrder = (rawItems) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new ShopCatalogError('Nothing in the saddlebag');
  }
  if (rawItems.length > 20) {
    throw new ShopCatalogError('Too many saddlebag lines');
  }

  const items = rawItems.map((raw) => {
    const product = SHOP_CATALOG[String(raw?.id || '')];
    if (!product) throw new ShopCatalogError('That product is not open right now', 409, 'product_closed');

    const quantity = Number(raw.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new ShopCatalogError('Choose a quantity from 1 to 10');
    }

    const selectedSize = String(raw.selectedSize || '').trim();
    if (!product.sizes.includes(selectedSize)) {
      throw new ShopCatalogError('Choose an available shirt size');
    }

    const design = designFor(product, raw);
    if (!design) throw new ShopCatalogError('Choose an available shirt design');

    return {
      id: product.id,
      name: product.name,
      price: roundMoney(product.priceCents),
      quantity,
      selectedSize,
      selectedDesign: design.name,
      selectedDesignId: design.id,
      delivery: 'ship',
    };
  });

  const amountCents = items.reduce((total, item) => total + Math.round(item.price * 100) * item.quantity, 0);
  return {
    items,
    amountUsd: roundMoney(amountCents),
    amountCents,
    discountBps: 0,
  };
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
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

export const assertFreshInventory = async (items) => {
  const ids = [...new Set(items.map((item) => item.id))];
  const rows = await shopDb(`shop_inventory?select=product_id,variant_id,on_hand,updated_at&product_id=in.(${ids.join(',')})`);
  const byKey = new Map((rows || []).map((row) => [`${row.product_id}:${row.variant_id || ''}`, row]));
  const requested = new Map();

  items.forEach((item) => {
    const key = `${item.id}:${item.selectedDesignId}`;
    requested.set(key, (requested.get(key) || 0) + item.quantity);
  });

  requested.forEach((quantity, key) => {
    const row = byKey.get(key);
    if (!row || Number(row.on_hand) < quantity) {
      throw new ShopCatalogError('That shirt is not available in the selected dye or design', 409, 'out_of_stock');
    }
    const updated = new Date(row.updated_at).getTime();
    if (!Number.isFinite(updated) || Date.now() - updated > INVENTORY_FRESH_MS) {
      throw new ShopCatalogError('Inventory needs a fresh count before checkout', 409, 'inventory_stale');
    }
  });
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
