// netlify/functions/solana-pay-request.js
// SENTINEL: NB_SHOP_SOLANA_REQUEST_V1_PRICED
//
// Opens a direct Solana payment. The browser posts the saddlebag and whatever
// the customer chose to tell us (all optional on this rail), we mint a
// reference, price it, write the row and hand back the Solana Pay URL. The
// browser draws that as a QR and a tap to open link, then polls
// solana-pay-status until it lands. See _solana.js for the whole rail.
//
// The amount is priced HERE and locked in the row. Until 2026-10-07 this file
// said the same and was wrong: it summed price times quantity from the
// browser's own lines, so a crafted request could ask two cents for a hoodie
// and the chain would faithfully verify the two cents. It also never checked
// stock, so a shirt the page shows as out could be requested here. Now the
// lines go through priceOrder and assertFreshInventory in _shop-catalog.js,
// the same two gates the Stripe rail uses, and the row stores the server's
// lines, never the browser's. solana-pay-status and solana-pay-sweep verify
// against amount_token in that row, so they inherit the fix with no change.
//
// This is the smallest change that closes it. The uncommitted September
// rewrite of this file (idempotent checkout keys, a cross checked SOL quote,
// a shop_orders receipt) is a larger design and is not part of this.
//
// No oxford commas, no em dashes.

import {
  RECIPIENT, REQUEST_TTL_MIN, newReference, payUrl, solPriceUsd, tokenAmountFor,
  formatAmount, db, json,
} from './_solana.js';
import { assertFreshInventory, priceOrder, ShopCatalogError } from './_shop-catalog.js';

const clip = (v, n) => String(v ?? '').slice(0, n);

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const currency = body.currency === 'SOL' ? 'SOL' : 'USDC';

    const priced = priceOrder(body.items);
    await assertFreshInventory(priced.items);
    const { items, amountUsd } = priced;

    let priceUsd = 1;
    if (currency === 'SOL') {
      priceUsd = await solPriceUsd();
      if (!priceUsd) return json(503, { error: 'SOL price is unavailable right now. USDC still works.' });
    }
    const amountToken = tokenAmountFor(amountUsd, currency, priceUsd);

    const reference = newReference();
    const customer = {
      name: clip(body.customer?.name, 200) || null,
      email: clip(body.customer?.email, 200) || null,
      address: clip(body.customer?.address, 400) || null,
    };
    const expiresAt = new Date(Date.now() + REQUEST_TTL_MIN * 60 * 1000).toISOString();
    const memo = `neonburro shop ${reference.slice(0, 8)}`;
    const message = `neonburro shop · ${items.length} item${items.length === 1 ? '' : 's'} · $${amountUsd.toFixed(2)}`;

    await db('solana_payments', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        reference,
        recipient: RECIPIENT,
        site: 'shop',
        currency,
        amount_usd: amountUsd,
        amount_token: amountToken,
        price_usd: priceUsd,
        status: 'pending',
        customer,
        items: items.map((i) => ({
          id: i.id, name: i.name, price: i.price, quantity: i.quantity,
          size: i.selectedSize, design: i.selectedDesign, tier: i.selectedTier,
          reloadCode: i.reloadCode, delivery: i.delivery,
        })),
        memo,
        expires_at: expiresAt,
      },
    });

    return json(200, {
      reference,
      recipient: RECIPIENT,
      currency,
      amountUsd,
      amountToken: formatAmount(amountToken, currency),
      priceUsd,
      url: payUrl({ recipient: RECIPIENT, amountToken, currency, reference, message, memo }),
      expiresAt,
    });
  } catch (err) {
    if (err instanceof ShopCatalogError) {
      return json(err.statusCode, { error: err.message, code: err.code });
    }
    console.error('solana-pay-request failed', err);
    return json(500, { error: 'Could not open the direct payment', details: err.message });
  }
};
