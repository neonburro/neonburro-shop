// netlify/functions/create-payment-intent.js
// SENTINEL: NB_SHOP_PAYMENT_INTENT_V6
//
// Stripe prices never come from the browser. A shop request is rebuilt by
// priceOrder in _shop-catalog.js from the shop's own product records, checked
// against inventory, then written as one shop_orders receipt before the client
// secret is returned. The Stripe Payment Element decides whether the customer
// uses card, a wallet, Link or Stripe's stablecoin option. Every method settles
// the same USD price. Express checkout posts here too, so it is the same rule.
//
// ── what V5 changed from V4 and why ─────────────────────────────────────────
// V4 (99c545e) closed the price hole and is live. It also refused every order
// the committed client can send. It required a checkoutKey the committed
// CheckoutForm.jsx and ExpressCheckout.jsx never send, it priced five shirt
// lines only and it demanded a street address for a two dollar email. V5:
//   · prices every line the shop shows, see _shop-catalog.js
//   · takes a browser checkoutKey when one comes and mints one when not
//   · reads the browser amount only to refuse a mismatch (cart_changed)
//   · asks for an address only when something in the order ships
//   · puts the tier, the reload code and the delivery back on the metadata,
//     because a Pay Card reload is applied by hand from there until the
//     ledger lands in Pulse (V3 had them, V4 dropped them)
//   · refuses to hand back a reused intent whose amount no longer matches
//
// ── what still has to be true before anything sells ─────────────────────────
// The receipt write needs SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY on
// the shop site and the shop_orders table from the September migration. If
// either is missing a priced order fails closed with a 503 before Stripe is
// asked for anything, or the new intent is cancelled. That is deliberate.
//
// Stripe metadata is 50 keys and 500 characters a value. items_json is clipped,
// the per item keys cover the first five lines and the receipt holds the rest.
//
// ── the shop is the only door (V6, 2026-10-07) ──────────────────────────────
// Until V6 a request without type 'shop' fell through to an older service
// invoice path. It took amount, firstName, projectName and hours from the body
// and made a live PaymentIntent for whatever amount it was handed, fifty cents
// and up. It bought nothing, no order and no product stood behind it, but it
// was a card testing door. Anybody holding a stolen card could mint intents at
// any price on the live key and try them, and the studio carries the disputes
// and the fees. Nothing called it: CheckoutForm.jsx and ExpressCheckout.jsx
// both send type 'shop', committed and uncommitted, and no other repo posts to
// this function. Warbleur agreed it goes rather than gets gated.
//
// So anything that is not type 'shop' is now a 400 before Stripe is touched.
// Studio invoices are paid through Pulse and the studio site, which price from
// a stored invoice row. If a second kind of payment ever lands here it gets
// its own priced path, never an amount from the body.
//
// No oxford commas, no em dashes.

import Stripe from 'stripe';
import {
  assertBrowserTotal,
  assertFreshInventory,
  checkoutKeyOrMint,
  findOrderReceipt,
  priceOrder,
  ShopCatalogError,
  writeOrderReceipt,
} from './_shop-catalog.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const clip = (value, max = 480) => String(value ?? '').slice(0, max);

const shopMetadata = ({ customerEmail, priced, customer, checkoutKey }) => {
  const { items } = priced;
  const reloadCodes = items.map((item) => item.reloadCode).filter(Boolean);
  const metadata = {
    type: 'shop_order',
    delivery: priced.delivery,
    checkout_key: clip(checkoutKey, 120),
    customer_email: clip(customerEmail, 200),
    items_count: String(items.length),
    items_json: clip(JSON.stringify(items.map((item) => ({
      id: item.id,
      n: item.name,
      p: item.price,
      q: item.quantity,
      s: item.selectedSize || undefined,
      d: item.delivery === 'digital' ? 'digital' : undefined,
      v: item.selectedDesign || undefined,
      t: item.selectedTier || undefined,
      r: item.reloadCode || undefined,
    })))),
  };

  if (reloadCodes.length) metadata.reload_codes = clip(reloadCodes.join(','), 400);
  if (customer.name) metadata.customer_name = clip(customer.name, 200);
  if (customer.phone) metadata.customer_phone = clip(customer.phone, 40);
  const line = [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(', ');
  if (line) metadata.ship_to = clip(line, 400);

  items.slice(0, 5).forEach((item, index) => {
    const prefix = `item_${index + 1}`;
    metadata[`${prefix}_name`] = clip(item.name, 120);
    metadata[`${prefix}_quantity`] = String(item.quantity);
    metadata[`${prefix}_price`] = String(item.price);
    if (item.selectedSize) metadata[`${prefix}_size`] = clip(item.selectedSize, 40);
    if (item.selectedDesign) metadata[`${prefix}_design`] = clip(item.selectedDesign, 80);
    if (item.selectedTier) metadata[`${prefix}_tier`] = clip(item.selectedTier, 40);
    if (item.reloadCode) metadata[`${prefix}_reload`] = clip(item.reloadCode, 60);
  });

  return metadata;
};

const cleanCustomer = (body, customerEmail) => ({
  name: clip(body?.name, 200).trim(),
  email: clip(customerEmail, 200).trim().toLowerCase(),
  phone: clip(body?.phone, 40).trim(),
  address: clip(body?.address, 200).trim(),
  city: clip(body?.city, 100).trim(),
  state: clip(body?.state, 40).trim(),
  zip: clip(body?.zip, 20).trim(),
  country: 'US',
});

const hasAddress = (customer) =>
  Boolean(customer.name && customer.address && customer.city && customer.state && customer.zip);

const shippingFor = (customer) => ({
  name: customer.name,
  phone: customer.phone || undefined,
  address: {
    line1: customer.address,
    city: customer.city,
    state: customer.state,
    postal_code: customer.zip,
    country: 'US',
  },
});

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

const shopPayment = async (body) => {
  const customerEmail = clip(body.customerEmail, 200).trim().toLowerCase();
  if (!customerEmail || !customerEmail.includes('@')) throw new ShopCatalogError('A valid email is required');

  const priced = priceOrder(body.items);
  assertBrowserTotal(priced, body.amount);

  const customer = cleanCustomer(body.customer || {}, customerEmail);
  if (priced.ships && !hasAddress(customer)) {
    throw new ShopCatalogError('A complete shipping address is required for anything that ships');
  }

  const { key: checkoutKey, minted } = checkoutKeyOrMint(body.checkoutKey);

  await assertFreshInventory(priced.items);

  if (!minted) {
    const existing = await findOrderReceipt({ checkoutKey, rail: 'stripe' });
    if (existing) {
      if (Math.round(Number(existing.amount_usd) * 100) !== priced.amountCents) {
        throw new ShopCatalogError('The saddlebag changed. Refresh the page and try again.', 409, 'cart_changed');
      }
      const intent = await stripe.paymentIntents.retrieve(existing.provider_reference);
      return response(200, {
        clientSecret: intent.client_secret,
        id: intent.id,
        amountUsd: Number(existing.amount_usd),
        reused: true,
      });
    }
  }

  const lines = priced.items.length;
  const paymentIntent = await stripe.paymentIntents.create({
    amount: priced.amountCents,
    currency: 'usd',
    automatic_payment_methods: { enabled: true },
    receipt_email: customer.email,
    description: `Neon Burro Shop · ${lines} line${lines === 1 ? '' : 's'}${priced.delivery === 'digital' ? ' · by email' : ''}`,
    shipping: hasAddress(customer) ? shippingFor(customer) : undefined,
    metadata: shopMetadata({ customerEmail, priced, customer, checkoutKey }),
    statement_descriptor_suffix: 'NEONBURRO',
  }, { idempotencyKey: `shop_${checkoutKey}` });

  try {
    await writeOrderReceipt({
      checkoutKey,
      rail: 'stripe',
      providerReference: paymentIntent.id,
      currency: 'USD',
      amountUsd: priced.amountUsd,
      customer,
      items: priced.items,
    });
  } catch (error) {
    await stripe.paymentIntents.cancel(paymentIntent.id).catch(() => null);
    throw error;
  }

  return response(200, {
    clientSecret: paymentIntent.client_secret,
    id: paymentIntent.id,
    amountUsd: priced.amountUsd,
  });
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return response(200, {});
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    if (body.type !== 'shop') {
      return response(400, { error: 'This door only takes shop orders.', code: 'not_a_shop_order' });
    }
    return await shopPayment(body);
  } catch (error) {
    if (error instanceof ShopCatalogError) {
      return response(error.statusCode, { error: error.message, code: error.code });
    }
    console.error('Payment intent creation failed:', error);
    return response(500, { error: 'Payment processing failed', details: error.message });
  }
};
