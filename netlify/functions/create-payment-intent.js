// netlify/functions/create-payment-intent.js
// SENTINEL: NB_SHOP_PAYMENT_INTENT_V4
//
// Stripe prices never come from the browser. A shop request is rebuilt from
// _shop-catalog.js, checked against fresh positive inventory then written as
// one idempotent shop_orders receipt before the client secret is returned.
// The Stripe Payment Element decides whether the customer uses card, a wallet,
// Link or Stripe's stablecoin option. Every method settles the same USD price.
//
// The older service invoice path remains at the bottom. Nothing in the shop
// calls it today, but the endpoint was already public so it stays compatible.
//
// No oxford commas, no em dashes.

import Stripe from 'stripe';
import {
  assertFreshInventory,
  checkoutKeyFrom,
  findOrderReceipt,
  priceOrder,
  ShopCatalogError,
  writeOrderReceipt,
} from './_shop-catalog.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const clip = (value, max = 480) => String(value ?? '').slice(0, max);

const shopMetadata = ({ customerEmail, items, customer, checkoutKey }) => {
  const metadata = {
    type: 'shop_order',
    delivery: 'ship',
    checkout_key: clip(checkoutKey, 120),
    customer_email: clip(customerEmail, 200),
    items_count: String(items.length),
    items_json: clip(JSON.stringify(items.map((item) => ({
      id: item.id,
      n: item.name,
      p: item.price,
      q: item.quantity,
      s: item.selectedSize,
      v: item.selectedDesign,
    })))),
  };

  if (customer.name) metadata.customer_name = clip(customer.name, 200);
  if (customer.phone) metadata.customer_phone = clip(customer.phone, 40);
  const line = [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(', ');
  if (line) metadata.ship_to = clip(line, 400);

  items.slice(0, 5).forEach((item, index) => {
    const prefix = `item_${index + 1}`;
    metadata[`${prefix}_name`] = clip(item.name, 120);
    metadata[`${prefix}_quantity`] = String(item.quantity);
    metadata[`${prefix}_price`] = String(item.price);
    metadata[`${prefix}_size`] = clip(item.selectedSize, 40);
    metadata[`${prefix}_design`] = clip(item.selectedDesign, 80);
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

  const checkoutKey = checkoutKeyFrom(body.checkoutKey);
  const priced = priceOrder(body.items);
  const customer = cleanCustomer(body.customer || {}, customerEmail);
  if (!customer.name || !customer.address || !customer.city || !customer.state || !customer.zip) {
    throw new ShopCatalogError('A complete shipping address is required for shirts');
  }

  await assertFreshInventory(priced.items);

  const existing = await findOrderReceipt({ checkoutKey, rail: 'stripe' });
  if (existing) {
    const intent = await stripe.paymentIntents.retrieve(existing.provider_reference);
    return response(200, {
      clientSecret: intent.client_secret,
      id: intent.id,
      amountUsd: Number(existing.amount_usd),
      reused: true,
    });
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: priced.amountCents,
    currency: 'usd',
    automatic_payment_methods: { enabled: true },
    receipt_email: customer.email,
    description: `Neon Burro Shop · ${priced.items.length} shirt line${priced.items.length === 1 ? '' : 's'}`,
    shipping: shippingFor(customer),
    metadata: shopMetadata({ customerEmail, items: priced.items, customer, checkoutKey }),
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
    if (body.type === 'shop') return await shopPayment(body);

    const { amount, firstName, projectName, hours } = body;
    if (!amount || !firstName || !projectName || !hours) {
      return response(400, { error: 'Missing required fields' });
    }
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents < 50) return response(400, { error: 'Invalid amount' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: cents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        type: 'service_invoice',
        firstName: clip(firstName, 100),
        projectName: clip(projectName, 200),
        hours: String(hours),
      },
      statement_descriptor_suffix: 'NEONBURRO',
    });

    return response(200, { clientSecret: paymentIntent.client_secret, id: paymentIntent.id });
  } catch (error) {
    if (error instanceof ShopCatalogError) {
      return response(error.statusCode, { error: error.message, code: error.code });
    }
    console.error('Payment intent creation failed:', error);
    return response(500, { error: 'Payment processing failed', details: error.message });
  }
};
