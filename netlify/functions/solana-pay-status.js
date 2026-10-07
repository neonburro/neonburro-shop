// netlify/functions/solana-pay-status.js
// SENTINEL: NB_SHOP_SOLANA_STATUS_V1
//
// "Has it landed yet." The browser polls this every few seconds with the
// reference it was given. If the row is still pending and not expired we ask
// the chain, and if a qualifying transfer is there we settle the row, notify
// the yard and say so. The browser then finalises the order the same way a
// card payment does. Verification lives in _solana.js, nothing here trusts
// the client beyond the reference string itself.
//
// GET /.netlify/functions/solana-pay-status?reference=<base58>
//   -> { status: 'pending' | 'paid' | 'expired', signature?, payer?, expiresAt }
//
// No oxford commas, no em dashes.

import { isBase58Key, rowByReference, findSettlement, settleRow, expireRow, json } from './_solana.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const reference = event.queryStringParameters?.reference;
  if (!isBase58Key(reference)) return json(400, { error: 'Bad reference' });

  try {
    const row = await rowByReference(reference);
    if (!row) return json(404, { error: 'Unknown reference' });

    if (row.status === 'paid') {
      return json(200, { status: 'paid', signature: row.signature, payer: row.payer, paidAt: row.paid_at });
    }

    const expired = new Date(row.expires_at).getTime() < Date.now();

    // Check the chain even when the clock has run out. A transfer that was
    // sent in time and confirmed a minute late still counts, the customer
    // paid. Only mark expired when there is truly nothing there.
    const found = await findSettlement({
      reference: row.reference, recipient: row.recipient, currency: row.currency, amountToken: row.amount_token, createdAt: row.created_at,
    });
    if (found) {
      const paid = await settleRow(row, found);
      return json(200, { status: 'paid', signature: paid.signature, payer: paid.payer, paidAt: paid.paid_at });
    }

    if (expired && row.status === 'pending') {
      await expireRow(reference);
      return json(200, { status: 'expired', expiresAt: row.expires_at });
    }

    return json(200, { status: 'pending', expiresAt: row.expires_at });
  } catch (err) {
    console.error('solana-pay-status failed', err);
    // A flaky RPC must not read as a failed payment. Say pending, try again.
    return json(200, { status: 'pending', transient: err.message });
  }
};
