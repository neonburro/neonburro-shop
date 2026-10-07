// scripts/order-flow-check.mjs
// SENTINEL: NB_SHOP_ORDER_FLOW_CHECK_V1
//
// The local proof that a sale moves through shop_orders the way Pulse will
// read it, on both rails, written 2026-10-07 when the shop's sales were wired
// into Pulse. price-check.mjs proves the price. This proves what happens after:
// the receipt is written, Stripe's events move it forward and never back, a
// paid order takes its stock exactly once and writes one line to the Pulse
// dashboard, a refund lands, and the direct Solana rail does all of the same.
// Run `node scripts/order-flow-check.mjs` after touching anything in
// netlify/functions/ that writes an order. Exits 1 on any failure.
//
// ── WHY IT CANNOT TOUCH ANYTHING REAL ───────────────────────────────────────
// Every env var it reads is overwritten with a fake before a single handler
// loads, so even run in a shell holding live keys it has none. fetch is
// replaced before anything runs: the database is an in memory stand in for
// PostgREST at a fake host, and every other host, Stripe, Resend, a Solana
// RPC, answers 599 and is recorded. The last check fails if anything tried to
// leave. create-payment-intent runs against a Stripe recorder in place of the
// SDK. The webhook runs the real SDK, because the signature check is the
// thing worth proving, and signs its test events with the SDK's own offline
// generateTestHeaderString.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────────
// The SQL. shop_take_stock and the row level security in
// supabase/migrations/20261007150000_shop_orders_into_pulse.sql run in the
// real database only. The stand in below copies the function's rules (take
// once, ship lines only, never below zero) so the JavaScript around it is
// proved, and the SQL itself is proved once, against the real project, when
// the migration is applied.
//
// No oxford commas, no em dashes.

import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));

// ── no real keys, ever ──────────────────────────────────────────────────────
for (const name of Object.keys(process.env)) {
  if (/STRIPE|SUPABASE|RESEND|SOLANA|NOTIFY|NETLIFY|TOKEN|SECRET|KEY/i.test(name)) delete process.env[name];
}
const WEBHOOK_SECRET = 'whsec_order_flow_check_not_real';
Object.assign(process.env, {
  SUPABASE_URL: 'http://db.order-flow.test',
  SUPABASE_SECRET_KEY: 'fake_secret_for_the_harness',
  STRIPE_SECRET_KEY: 'sk_test_order_flow_check_not_real',
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  SOLANA_RPC_URL: 'http://rpc.order-flow.test',
});

// ── the database stand in ───────────────────────────────────────────────────
const fresh = () => new Date().toISOString();
const db = {
  shop_orders: [],
  shop_inventory: [],
  activity_log: [],
  solana_payments: [],
};
const failing = new Set();
const outside = [];
const stripeCalls = [];
globalThis.__orderFlowStripe = stripeCalls;

const matches = (row, params) => {
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(key)) continue;
    const [op, ...rest] = raw.split('.');
    const value = rest.join('.');
    const cell = row[key] === null || row[key] === undefined ? null : String(row[key]);
    if (op === 'eq' && cell !== value) return false;
    if (op === 'in' && !value.replace(/^\(|\)$/g, '').split(',').includes(cell)) return false;
    if (op === 'is' && value === 'null' && cell !== null) return false;
  }
  return true;
};

const takeStock = (orderId) => {
  const order = db.shop_orders.find((o) => o.id === orderId);
  if (!order || order.stock_taken_at || !['paid', 'fulfilled'].includes(order.status)) return 0;
  order.stock_taken_at = fresh();
  let taken = 0;
  for (const line of order.items) {
    if ((line.delivery || 'ship') !== 'ship') continue;
    const row = db.shop_inventory.find((r) => r.product_id === line.id && (r.variant_id || '') === (line.selectedDesignId || ''));
    if (row) {
      row.on_hand = Math.max(row.on_hand - Number(line.quantity || 0), 0);
      taken += 1;
    }
  }
  return taken;
};

const respond = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname !== 'db.order-flow.test') {
    outside.push(url.hostname);
    return new Response('blocked by the harness', { status: 599 });
  }
  const method = (init.method || 'GET').toUpperCase();
  const name = url.pathname.replace('/rest/v1/', '');
  if (failing.has(`${method} ${name}`)) return new Response('injected failure', { status: 500 });

  if (name === 'rpc/shop_take_stock') return respond(200, takeStock(JSON.parse(init.body).p_order));

  const table = db[name];
  if (!table) return respond(404, { message: `no table ${name}` });
  const params = [...url.searchParams.entries()];
  const prefer = new Headers(init.headers || {}).get('prefer') || '';
  const represent = prefer.includes('return=representation');

  if (method === 'GET') {
    const limit = Number(url.searchParams.get('limit') || 1000);
    return respond(200, table.filter((row) => matches(row, params)).slice(0, limit).map((row) => ({ ...row })));
  }
  if (method === 'POST') {
    const incoming = JSON.parse(init.body);
    const conflict = url.searchParams.get('on_conflict');
    const keys = conflict ? conflict.split(',') : null;
    let row = keys ? table.find((r) => keys.every((k) => r[k] === incoming[k])) : null;
    if (row) Object.assign(row, incoming);
    else {
      row = { id: randomUUID(), created_at: fresh(), ...incoming };
      table.push(row);
    }
    return represent ? respond(201, [{ ...row }]) : respond(201);
  }
  if (method === 'PATCH') {
    const changes = JSON.parse(init.body);
    const hit = table.filter((row) => matches(row, params));
    hit.forEach((row) => Object.assign(row, changes));
    return represent ? respond(200, hit.map((row) => ({ ...row }))) : respond(204);
  }
  return respond(405, {});
};

// ── bundle the real handlers the way Netlify does ───────────────────────────
const scratch = mkdtempSync(path.join(tmpdir(), 'nb-order-flow-'));
const stub = path.join(scratch, 'stripe-recorder.mjs');
writeFileSync(stub, `let n = 0;
export default class Stripe {
  constructor() {
    const log = (entry) => globalThis.__orderFlowStripe.push(entry);
    this.paymentIntents = {
      create: async (params) => { n += 1; log({ op: 'create', amount: params.amount }); return { id: 'pi_flow_' + n, client_secret: 'pi_flow_' + n + '_secret' }; },
      retrieve: async (id) => { log({ op: 'retrieve', id }); return { id, client_secret: id + '_secret' }; },
      cancel: async (id) => { log({ op: 'cancel', id }); return { id }; },
    };
  }
}
`);
const bundle = async (entry, out, alias) => {
  await build({
    entryPoints: [path.join(root, entry)],
    outfile: path.join(scratch, out),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    alias,
    // The Stripe SDK is CommonJS and requires node builtins at runtime, which
    // an ESM bundle cannot do without a require of its own.
    banner: { js: "import { createRequire as __nbRequire } from 'node:module'; const require = __nbRequire(import.meta.url);" },
    logLevel: 'silent',
  });
  return import(pathToFileURL(path.join(scratch, out)).href);
};

const intents = await bundle('netlify/functions/create-payment-intent.js', 'cpi.mjs', { stripe: stub });
const webhook = await bundle('netlify/functions/stripe-payment-webhook.js', 'hook.mjs');
const solanaRequest = await bundle('netlify/functions/solana-pay-request.js', 'sol-request.mjs');
const solana = await bundle('netlify/functions/_solana.js', 'solana.mjs');
const StripeSdk = require('stripe');
const sdk = new StripeSdk('sk_test_order_flow_check_not_real');

// ── the runner ──────────────────────────────────────────────────────────────
const results = [];
const check = (label, ok, said = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58, '.')} ${said}`);
};
const order = (ref) => db.shop_orders.find((o) => o.provider_reference === ref);
const stock = (product, variant) => db.shop_inventory.find((r) => r.product_id === product && (r.variant_id || '') === (variant || '')).on_hand;
const sales = () => db.activity_log.filter((a) => a.action === 'shop_order_paid').length;

let eventCount = 0;
const deliver = async (type, object, { sign = true } = {}) => {
  eventCount += 1;
  const payload = JSON.stringify({
    id: `evt_flow_${eventCount}`,
    object: 'event',
    type,
    created: Math.floor(Date.now() / 1000),
    data: { object },
  });
  const headers = sign ? { 'stripe-signature': sdk.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }) } : {};
  const reply = await webhook.handler({ httpMethod: 'POST', headers, body: payload, isBase64Encoded: false });
  return { status: reply.statusCode, body: JSON.parse(reply.body) };
};
const intent = (id, type = 'shop_order') => ({ id, object: 'payment_intent', metadata: { type } });

db.shop_inventory.push(
  { product_id: 'theburroship', variant_id: 'sage', on_hand: 3, updated_at: fresh() },
  { product_id: 'nibble-wands', variant_id: null, on_hand: 2, updated_at: fresh() },
);
const SHIRT = { id: 'theburroship', name: 'x', price: 1, quantity: 2, selectedSize: 'Mens M', selectedDesign: 'Sage', delivery: 'digital' };
const CLUE = { id: 'two-dollar-clue', name: 'x', price: 2, quantity: 1, selectedDesign: 'Marker', delivery: 'digital' };
const ADDRESS = { name: 'Flow Check', address: '1 Main St', city: 'Ridgway', state: 'CO', zip: '81432' };

console.log(`order-flow-check  bundled in ${scratch}\n`);

// ── the Stripe rail ─────────────────────────────────────────────────────────
{
  const reply = await intents.handler({
    httpMethod: 'POST',
    body: JSON.stringify({ type: 'shop', customerEmail: 'flow@example.test', items: [SHIRT, CLUE], customer: ADDRESS }),
  });
  const pi = JSON.parse(reply.body).id;
  const row = order(pi);
  check('a priced order writes a pending receipt', reply.statusCode === 200 && row?.status === 'pending' && row?.rail === 'stripe',
    `${reply.statusCode} ${row?.status} ${row?.rail}`);
  check('Stripe was asked for the server price, two shirts and a clue', stripeCalls.at(-1)?.amount === 17200, `${stripeCalls.at(-1)?.amount} cents`);
  check('the receipt holds the server lines, the shirt still ships', row.items[0].delivery === 'ship' && row.items[0].price === 85,
    `${row.items[0].delivery} $${row.items[0].price}`);

  let r = await deliver('payment_intent.processing', intent(pi));
  check('processing moves pending to processing', order(pi).status === 'processing', `${r.status} ${order(pi).status}`);

  r = await deliver('payment_intent.succeeded', intent(pi));
  check('succeeded moves it to paid', order(pi).status === 'paid' && Boolean(order(pi).paid_at), `${r.status} ${order(pi).status}`);
  check('the sale took two shirts from three', stock('theburroship', 'sage') === 1, `on hand ${stock('theburroship', 'sage')}`);
  check('the digital clue took no stock and wrote one dashboard line', sales() === 1, `${sales()} line`);

  r = await deliver('payment_intent.succeeded', intent(pi));
  check('a replayed succeeded event takes nothing twice', stock('theburroship', 'sage') === 1 && sales() === 1,
    `${r.body.ignored || r.body.moved}, on hand ${stock('theburroship', 'sage')}, ${sales()} line`);

  r = await deliver('payment_intent.processing', intent(pi));
  check('a late processing event cannot pull paid back', order(pi).status === 'paid', `${order(pi).status}`);

  order(pi).status = 'fulfilled';
  r = await deliver('charge.refunded', { object: 'charge', payment_intent: pi, amount: 17200, amount_refunded: 5000 });
  check('a partial refund changes nothing', order(pi).status === 'fulfilled', `${r.body.ignored}`);
  r = await deliver('charge.refunded', { object: 'charge', payment_intent: pi, amount: 17200, amount_refunded: 17200 });
  check('a full refund moves a shipped order to refunded', order(pi).status === 'refunded', `${order(pi).status}`);

  const before = JSON.stringify(db.shop_orders);
  r = await deliver('payment_intent.succeeded', intent('pi_studio_invoice', 'service_invoice'));
  check('a studio payment on the same account is left alone', r.body.ignored === 'not a shop order' && JSON.stringify(db.shop_orders) === before, `${r.body.ignored}`);
  r = await deliver('charge.refunded', { object: 'charge', payment_intent: 'pi_studio_invoice', amount: 900, amount_refunded: 900 });
  check('a studio refund finds no shop order and moves nothing', JSON.stringify(db.shop_orders) === before, `${r.body.ignored}`);

  r = await deliver('payment_intent.succeeded', intent(pi), { sign: false });
  check('an unsigned event is refused', r.status === 400, `${r.status}`);

  const reply2 = await intents.handler({
    httpMethod: 'POST',
    body: JSON.stringify({ type: 'shop', customerEmail: 'flow@example.test', items: [{ ...CLUE, quantity: 1 }] }),
  });
  const pi2 = JSON.parse(reply2.body).id;
  r = await deliver('payment_intent.payment_failed', intent(pi2));
  check('a failed card moves pending to failed', order(pi2).status === 'failed', `${order(pi2).status}`);
  failing.add('PATCH shop_orders');
  r = await deliver('payment_intent.succeeded', intent(pi2));
  check('a database failure answers 500 so Stripe retries', r.status === 500 && order(pi2).status === 'failed', `${r.status} ${order(pi2).status}`);
  failing.delete('PATCH shop_orders');
  r = await deliver('payment_intent.succeeded', intent(pi2));
  check('the retry lands, a second card after a failure is paid', order(pi2).status === 'paid', `${order(pi2).status}`);

  delete process.env.STRIPE_WEBHOOK_SECRET;
  r = await deliver('payment_intent.succeeded', intent(pi2));
  check('no webhook secret on the site answers 503', r.status === 503, `${r.status}`);
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
}

// ── the direct Solana rail ──────────────────────────────────────────────────
{
  const ask = (items) => solanaRequest.handler({
    httpMethod: 'POST',
    body: JSON.stringify({ currency: 'USDC', items, customer: { name: 'Flow Check', email: 'flow@example.test', address: '1 Main St, Ridgway CO 81432' } }),
  });
  const WANDS = { id: 'nibble-wands', name: 'x', price: 0.02, quantity: 1 };

  let reply = await ask([WANDS]);
  const ref = JSON.parse(reply.body).reference;
  const row = order(ref);
  check('a direct request writes a solana_direct receipt beside the card ones', reply.statusCode === 200 && row?.rail === 'solana_direct' && row?.status === 'pending',
    `${reply.statusCode} ${row?.rail} ${row?.status}`);
  check('it holds the server price, not the two cents sent', Number(row?.amount_usd) === 99, `$${row?.amount_usd}`);

  const pay = db.solana_payments.find((p) => p.reference === ref);
  await solana.settleRow(pay, { signature: 'sig_flow_1', payer: 'payer_flow' });
  check('settling on chain moves the shop order to paid', order(ref).status === 'paid', `${order(ref).status}`);
  check('and takes the wands from stock', stock('nibble-wands') === 1, `on hand ${stock('nibble-wands')}`);
  const linesAfter = sales();
  await solana.settleRow(pay, { signature: 'sig_flow_1', payer: 'payer_flow' });
  check('the sweep finding it again takes nothing twice', stock('nibble-wands') === 1 && sales() === linesAfter,
    `on hand ${stock('nibble-wands')}, ${sales()} lines`);

  reply = await ask([WANDS]);
  const late = JSON.parse(reply.body).reference;
  await solana.expireRow(late);
  check('an expired request reads expired in both tables', order(late).status === 'expired'
    && db.solana_payments.find((p) => p.reference === late).status === 'expired', `${order(late).status}`);
  await solana.settleRow(db.solana_payments.find((p) => p.reference === late), { signature: 'sig_flow_2', payer: 'payer_flow' });
  check('a transfer that lands after the clock still settles the order', order(late).status === 'paid' && stock('nibble-wands') === 0,
    `${order(late).status}, on hand ${stock('nibble-wands')}`);

  failing.add('POST shop_orders');
  reply = await ask([CLUE]);
  failing.delete('POST shop_orders');
  const orphan = db.solana_payments.at(-1);
  check('no receipt, no QR: the request fails and is expired', reply.statusCode === 503 && orphan.status === 'expired',
    `${reply.statusCode} ${orphan.status}`);
}

check('nothing tried to leave the machine', outside.length === 0, outside.length ? outside.join(' ') : 'no outside calls');

const passed = results.filter(Boolean).length;
console.log(`\n${passed} of ${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
