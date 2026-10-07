// netlify/functions/stripe-payment-webhook.js
// SENTINEL: NB_SHOP_STRIPE_WEBHOOK_V2
//
// Stripe is the authority for its own rail. A signed event moves the shop's
// receipt in shop_orders, the table Pulse reads as the shop's sales, even when
// the customer closes the browser during a redirect. V1 was written in
// September and never committed. On 2026-10-07 Warbleur measured that this
// path answered 404 on shop.neonburro.com, so no shop payment event had ever
// reached the shop. They all went to the studio's endpoint on the same Stripe
// account, which ignores payment_intent events and finds no record for a shop
// charge on a refund, so nothing was acting on them twice and nothing was
// acting on them at all.
//
// ── what each event does ────────────────────────────────────────────────────
//   payment_intent.processing       pending to processing (ACH, stablecoins)
//   payment_intent.succeeded        to paid through markOrderPaid, which takes
//                                   the stock and writes the dashboard line
//   payment_intent.payment_failed   pending or processing to failed
//   payment_intent.canceled         the same, failed
//   charge.refunded                 a full refund moves paid or fulfilled to
//                                   refunded. A partial refund changes nothing
//                                   here, Stripe holds the amount
// Every move is guarded by the statuses it may leave from (ORDER_MOVES in
// _shop-catalog.js), so out of order and replayed events are harmless. Only
// intents whose metadata says shop_order are touched. A refund is matched by
// its PaymentIntent id against shop_orders and anything not found there is
// the studio's and left alone.
//
// ── what Tyler sets, once ───────────────────────────────────────────────────
// In Stripe, Developers, Webhooks, add an endpoint at
//   https://shop.neonburro.com/.netlify/functions/stripe-payment-webhook
// listening to the five events above. Put its signing secret on the shop site
// as STRIPE_WEBHOOK_SECRET, functions scope. Agents never read, copy or paste
// that value. Without it this endpoint answers 503 to everything, and Stripe
// retries for three days, so nothing is lost if it is set late.
//
// No oxford commas, no em dashes.

import Stripe from 'stripe';
import { markOrderPaid, moveOrder } from './_shop-catalog.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_unset');

const reply = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

const RAIL = 'stripe';

const handle = async (event) => {
  const object = event.data?.object || {};

  if (event.type === 'charge.refunded') {
    const intentId = typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id;
    if (!intentId) return { ignored: 'no intent' };
    const full = Number(object.amount_refunded || 0) >= Number(object.amount || 0) && Number(object.amount_refunded || 0) > 0;
    if (!full) return { ignored: 'partial refund' };
    const order = await moveOrder({ rail: RAIL, providerReference: intentId, to: 'refunded' });
    return order ? { moved: 'refunded' } : { ignored: 'not a shop order or not paid' };
  }

  if (object.object !== 'payment_intent' || object.metadata?.type !== 'shop_order') {
    return { ignored: 'not a shop order' };
  }

  if (event.type === 'payment_intent.succeeded') {
    const order = await markOrderPaid({
      rail: RAIL,
      providerReference: object.id,
      paidAt: new Date(event.created * 1000).toISOString(),
    });
    return order ? { moved: 'paid' } : { ignored: 'already paid' };
  }

  const to = {
    'payment_intent.processing': 'processing',
    'payment_intent.payment_failed': 'failed',
    'payment_intent.canceled': 'failed',
  }[event.type];
  if (!to) return { ignored: event.type };

  const order = await moveOrder({ rail: RAIL, providerReference: object.id, to });
  return order ? { moved: to } : { ignored: `not moved to ${to}` };
};

export const handler = async (request) => {
  if (request.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('shop stripe webhook refused, STRIPE_WEBHOOK_SECRET is not set on the shop site');
    return reply(503, { error: 'Webhook unavailable' });
  }

  let event;
  try {
    const signature = request.headers?.['stripe-signature'] || request.headers?.['Stripe-Signature'];
    const payload = request.isBase64Encoded
      ? Buffer.from(request.body || '', 'base64').toString('utf8')
      : request.body || '';
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    console.error('shop stripe webhook signature refused', error.message);
    return reply(400, { error: 'Invalid webhook event' });
  }

  // A database failure answers 500 so Stripe delivers the event again later.
  // Every move is guarded, so a retry that lands twice does nothing the
  // second time.
  try {
    const result = await handle(event);
    return reply(200, { received: true, ...result });
  } catch (error) {
    console.error('shop stripe webhook could not record', event.type, event.id, error.message);
    return reply(500, { error: 'Could not record the event' });
  }
};
