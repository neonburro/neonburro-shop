// netlify/functions/_solana.js
// SENTINEL: NB_SHOP_SOLANA_SHARED_V2
//
// ── THE DIRECT RAIL, IN ONE PARAGRAPH ───────────────────────────────────────
//
// Stripe's stablecoin rail settles USDC to us in dollars and takes its cut.
// This rail does not. The customer sends USDC or SOL straight to the studio's
// own Solana wallet, we watch the chain for it, and the order clears the
// moment it lands. No processor, no wallet connect popup, no account. It is
// the "hand the shopkeeper the coin" path, and Cypher (the council's Solana
// burro) is the one who watches for it in the copy.
//
// ── HOW A PAYMENT IS RECOGNISED ─────────────────────────────────────────────
//
// Solana Pay transfer requests carry a `reference`, an arbitrary public key
// that the wallet includes in the transfer as a read only account. It does
// nothing on chain, it just tags the transaction. We mint one random 32 byte
// key per payment, store it in solana_payments, and ask the RPC
// getSignaturesForAddress(reference). Any transaction that mentions the key
// is ours. Then getTransaction and check that the recipient's balance rose by
// at least the amount asked, in lamports for SOL or in USDC token units for
// USDC. That is the whole verification. Nothing here trusts what the browser
// says, the browser only asks "has it landed yet".
//
// A random 32 byte key is not on the ed25519 curve most of the time. That is
// fine, a reference is never signed for and never owns anything, it only has
// to be a valid 32 byte account key. @solana/pay generates them the same way.
//
// ── NO SDK, ON PURPOSE ──────────────────────────────────────────────────────
//
// @solana/web3.js is a large dependency for four JSON RPC calls and a base58
// encoder. Everything needed is written out below in plain fetch, so the
// functions cold start fast and nothing in the browser bundle changes.
//
// ── ENV ─────────────────────────────────────────────────────────────────────
//
//   SOLANA_RECIPIENT     the studio wallet. Falls back to the known address.
//   SOLANA_RPC_URL       an RPC endpoint. Falls back to the public mainnet
//                        node, which is rate limited but fine at shop volume.
//                        A Helius or QuickNode URL here is the upgrade.
//   SUPABASE_URL and a service key, same names shop-inventory.js reads.
//   RESEND_API_KEY       optional. If present, a paid transfer emails the yard.
//   NOTIFY_EMAIL         optional. Defaults to hello@neonburro.com.
//
// ── THE SAME LEDGER AS STRIPE, 2026-10-07, Cypher ────────────────────────
//
// solana_payments stays this rail's working table, the reference, the token
// amount, the signature. The sale itself is also a row in shop_orders, rail
// solana_direct, provider_reference the payment reference, written by
// solana-pay-request.js. That is the table Pulse reads as the shop's sales, so
// a direct payment shows up beside a card payment. settleRow moves it to paid
// through markOrderPaid in _shop-catalog.js, which also takes the stock and
// writes the dashboard line, and expireRow below moves it to expired. Both are
// guarded there, so the status poll and the sweep finding the same payment do
// nothing the second time.
//
// No oxford commas, no em dashes.

import { randomBytes } from 'node:crypto';
import { markOrderPaid, moveOrder } from './_shop-catalog.js';

export const SHOP_RAIL = 'solana_direct';

export const RECIPIENT = process.env.SOLANA_RECIPIENT || '86JyeB94ABYCpQshm2xvoqf9WJopdEu8VGswYSufNDgE';
export const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const LAMPORTS = 1_000_000_000;
export const USDC_DECIMALS = 6;
export const REQUEST_TTL_MIN = 20;
export const LABEL = 'neonburro shop';

// ── base58 ──────────────────────────────────────────────────────────────────
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export const base58Encode = (bytes) => {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '';
  for (let k = 0; k < zeros; k += 1) out += ALPHABET[0];
  for (let k = digits.length - 1; k >= 0; k -= 1) out += ALPHABET[digits[k]];
  return out;
};

export const isBase58Key = (s) => typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

export const newReference = () => base58Encode(randomBytes(32));

// ── the Solana Pay URL ──────────────────────────────────────────────────────
// solana:<recipient>?amount=<decimal>&spl-token=<mint>&reference=<key>&label=..&message=..&memo=..
// amount is a plain decimal in the token's own units (1.5 SOL, 2 USDC), never
// lamports. Wallets reject exponent notation, so it is formatted with toFixed.
export const formatAmount = (amountToken, currency) => {
  const decimals = currency === 'USDC' ? USDC_DECIMALS : 9;
  return Number(amountToken).toFixed(decimals).replace(/\.?0+$/, '');
};

// Percent encoded by hand rather than URLSearchParams, which writes spaces as
// plus signs. The Solana Pay spec wants RFC 3986 encoding and a wallet that
// takes it literally would show "neonburro+shop" on the confirm sheet.
export const payUrl = ({ recipient, amountToken, currency, reference, message, memo }) => {
  const parts = [`amount=${formatAmount(amountToken, currency)}`];
  if (currency === 'USDC') parts.push(`spl-token=${USDC_MINT}`);
  parts.push(`reference=${reference}`);
  parts.push(`label=${encodeURIComponent(LABEL)}`);
  if (message) parts.push(`message=${encodeURIComponent(message)}`);
  if (memo) parts.push(`memo=${encodeURIComponent(memo)}`);
  return `solana:${recipient}?${parts.join('&')}`;
};

// ── price ───────────────────────────────────────────────────────────────────
// USDC is a dollar. SOL is priced once at request time and locked into the
// row, so the customer sees one number and we verify against that number.
// CoinGecko's free simple price endpoint needs no key. If it is down we do
// not guess, we return null and the client offers USDC only.
export const solPriceUsd = async () => {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const price = Number(json?.solana?.usd);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
};

// The amount carries a tiny random tail (under a tenth of a cent) so every
// open request asks for a slightly different number. That is what lets the
// address scan below tell two two dollar clues apart when a customer skips
// the QR, copies the address into Coinbase or Phantom by hand, and the
// transfer arrives with no reference key on it.
export const tokenAmountFor = (amountUsd, currency, priceUsd) => {
  if (currency === 'USDC') {
    const tail = 1 + Math.floor(Math.random() * 999);                 // 0.000001 to 0.000999 USDC
    return Math.round(amountUsd * 1e6 + tail) / 1e6;
  }
  // SOL. Round up to the lamport so a wallet sending the displayed number
  // always clears the check, then the tail.
  const tail = 1000 + Math.floor(Math.random() * 98999);              // up to 0.0001 SOL
  return (Math.ceil((amountUsd / priceUsd) * LAMPORTS) + tail) / LAMPORTS;
};

// ── rpc ─────────────────────────────────────────────────────────────────────
export const rpc = async (method, params) => {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`rpc ${method} ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`rpc ${method}: ${json.error.message || 'error'}`);
  return json.result;
};

// How much of the asked currency a transaction moved INTO the recipient.
// SOL from lamport balances, USDC from the token balance deltas for the mint,
// owner scoped so a transfer to some other wallet in the same tx cannot count.
const receivedIn = (tx, recipient, currency) => {
  const keys = (tx.transaction?.message?.accountKeys || []).map((k) => (typeof k === 'string' ? k : k.pubkey));
  const payer = keys[0] || null;
  if (currency === 'SOL') {
    const idx = keys.indexOf(recipient);
    if (idx === -1) return { payer, delta: 0 };
    const delta = (Number(tx.meta.postBalances?.[idx] ?? 0) - Number(tx.meta.preBalances?.[idx] ?? 0)) / LAMPORTS;
    return { payer, delta };
  }
  const sum = (list) => (list || [])
    .filter((b) => b.mint === USDC_MINT && b.owner === recipient)
    .reduce((n, b) => n + Number(b.uiTokenAmount?.uiAmount ?? 0), 0);
  return { payer, delta: sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances) };
};

const getTx = (signature) => rpc('getTransaction', [signature, {
  encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0,
}]);

// Two ways a payment is recognised, tried in order.
//
//   1. By reference. The wallet followed the Solana Pay URL, so the transfer
//      carries our reference key. Any confirmed tx on that key that moved at
//      least the amount (half a percent tolerance for display rounding) to the
//      recipient is ours.
//   2. By amount. The customer copied the address and typed the number into a
//      wallet or an exchange, so there is no reference. Scan the recipient's
//      recent transactions since the request was opened for one whose delta
//      matches the asked amount to the last unit. The random tail in the
//      amount is what makes that match specific. A signature already claimed
//      by another row is skipped, so one transfer can never clear two orders.
//
// Returns { signature, payer, received, via } or null.
export const findSettlement = async ({ reference, recipient, currency, amountToken, createdAt }) => {
  const asked = Number(amountToken);

  const sigs = await rpc('getSignaturesForAddress', [reference, { limit: 10, commitment: 'confirmed' }]);
  for (const entry of sigs || []) {
    if (entry.err) continue;
    const tx = await getTx(entry.signature);
    if (!tx || tx.meta?.err) continue;
    const { payer, delta } = receivedIn(tx, recipient, currency);
    if (delta >= asked * 0.995) return { signature: entry.signature, payer, received: delta, via: 'reference' };
  }

  if (!createdAt) return null;
  const since = Math.floor(new Date(createdAt).getTime() / 1000) - 120;
  const tolerance = currency === 'USDC' ? 0.0000015 : 1500 / LAMPORTS;
  const recent = await rpc('getSignaturesForAddress', [recipient, { limit: 25, commitment: 'confirmed' }]);
  for (const entry of recent || []) {
    if (entry.err) continue;
    if (entry.blockTime && entry.blockTime < since) break;
    const tx = await getTx(entry.signature);
    if (!tx || tx.meta?.err) continue;
    const { payer, delta } = receivedIn(tx, recipient, currency);
    if (Math.abs(delta - asked) > tolerance) continue;
    const claimed = await db(`solana_payments?signature=eq.${encodeURIComponent(entry.signature)}&select=reference&limit=1`).catch(() => []);
    if (Array.isArray(claimed) && claimed.length) continue;
    return { signature: entry.signature, payer, received: delta, via: 'amount' };
  }
  return null;
};

// ── supabase, service role, plain rest ──────────────────────────────────────
const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || null;
const supabaseKey = () =>
  process.env.SUPABASE_SECRET_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || null;

export const db = async (path, { method = 'GET', body, prefer } = {}) => {
  const url = supabaseUrl();
  const key = supabaseKey();
  if (!url || !key) throw new Error('Supabase is not configured on this site');
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`supabase ${method} ${path} ${res.status} ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

export const rowByReference = async (reference) => {
  const rows = await db(`solana_payments?reference=eq.${encodeURIComponent(reference)}&select=*&limit=1`);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
};

// Flip a pending row to paid, then tell the yard. Idempotent on status.
export const settleRow = async (row, found) => {
  const updated = await db(
    `solana_payments?reference=eq.${encodeURIComponent(row.reference)}&status=eq.pending`,
    {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { status: 'paid', signature: found.signature, payer: found.payer, paid_at: new Date().toISOString() },
    },
  );
  const paidRow = Array.isArray(updated) && updated[0] ? updated[0] : { ...row, ...found, status: 'paid' };
  await markOrderPaid({ rail: SHOP_RAIL, providerReference: row.reference, paidAt: paidRow.paid_at })
    .catch((err) => console.error('solana sale landed but the shop order did not move to paid', row.reference, err.message));
  await notify(paidRow).catch((err) => console.error('solana notify failed', err));
  return paidRow;
};

// The clock ran out and the chain shows nothing. Both tables say so, each
// only from pending, so a payment that lands later still settles both.
export const expireRow = async (reference) => {
  await db(`solana_payments?reference=eq.${encodeURIComponent(reference)}&status=eq.pending`, {
    method: 'PATCH', body: { status: 'expired' },
  }).catch(() => null);
  await moveOrder({ rail: SHOP_RAIL, providerReference: reference, to: 'expired' }).catch(() => null);
};

// ── the notification ────────────────────────────────────────────────────────
// Resend, same provider the studio uses. If the key is not on this site the
// row still says paid and the browser still finalises the order through the
// Netlify form, this is the belt to that suspender.
const money = (n) => `$${Number(n).toFixed(2)}`;
const esc = (v = '') => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const notify = async (row) => {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, skipped: 'no RESEND_API_KEY' };
  if (row.notified_at) return { ok: true, skipped: 'already' };

  const to = process.env.NOTIFY_EMAIL || 'hello@neonburro.com';
  const items = Array.isArray(row.items) ? row.items : [];
  const customer = row.customer || {};
  const lines = items.map((i) => `<tr><td style="padding:6px 0;color:#A8A7A4">${esc(i.name)}${i.size ? ` · ${esc(i.size)}` : ''} × ${i.quantity}</td><td style="padding:6px 0;text-align:right;color:#F4F3F1">${money(i.price * i.quantity)}</td></tr>`).join('');
  const who = customer.email || customer.name || customer.address ? `
    <p style="margin:18px 0 0;color:#A8A7A4">${customer.name ? esc(customer.name) + '<br>' : ''}${customer.email ? esc(customer.email) + '<br>' : ''}${customer.address ? esc(customer.address) : ''}</p>`
    : '<p style="margin:18px 0 0;color:#6E6E6B">No contact left. They chose to send it clean.</p>';

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#0B0B0C;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#F4F3F1">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <p style="margin:0 0 14px;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#C5D957">● Direct on Solana · Cypher saw it land</p>
    <h1 style="margin:0 0 10px;font-size:26px;font-weight:600;letter-spacing:-0.02em">This one came straight to the wallet.</h1>
    <p style="margin:0 0 22px;color:#A8A7A4;line-height:1.6">${money(row.amount_usd)} in ${esc(row.currency)} (${esc(String(row.amount_token))} ${esc(row.currency)}) landed in ${esc(row.recipient.slice(0, 4))}…${esc(row.recipient.slice(-4))}. No processor, no fee, no chargeback window.</p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid rgba(255,255,255,0.08)">${lines}</table>
    ${who}
    <p style="margin:22px 0 0;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#6E6E6B;word-break:break-all">tx <a style="color:#C5D957;text-decoration:none" href="https://solscan.io/tx/${esc(row.signature)}">${esc(row.signature)}</a><br>from ${esc(row.payer || 'unknown')}<br>ref ${esc(row.reference)}</p>
    <p style="margin:28px 0 0;font-size:12px;color:#6E6E6B">neonburro shop · direct rail · ${esc(row.site)}</p>
  </div></body></html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.NOTIFY_FROM || 'neonburro. <shop@neonburro.com>',
      to: [to],
      subject: `Direct Solana payment · ${money(row.amount_usd)} in ${row.currency}${customer.name ? ` · ${customer.name}` : ''}`,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`resend ${res.status} ${text.slice(0, 200)}`);
  }
  await db(`solana_payments?reference=eq.${encodeURIComponent(row.reference)}`, {
    method: 'PATCH', body: { notified_at: new Date().toISOString() },
  }).catch(() => null);
  return { ok: true };
};

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

export const json = (statusCode, body) => ({ statusCode, headers: cors, body: JSON.stringify(body) });
