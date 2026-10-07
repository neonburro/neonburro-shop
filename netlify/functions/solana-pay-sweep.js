// netlify/functions/solana-pay-sweep.js
// SENTINEL: NB_SHOP_SOLANA_SWEEP_V1
//
// The safety net for a closed tab. The browser polls solana-pay-status while
// the customer is looking at the QR, but a customer who sends the transfer
// from their phone and closes the laptop never polls again, and nobody would
// learn the money landed. This runs on a schedule (netlify.toml, every five
// minutes), walks every pending row that is not more than an hour past its
// expiry, and asks the chain. Anything found is settled and the yard is
// notified exactly as if the browser had asked. Anything long dead is marked
// expired so the table does not grow a tail.
//
// The browser cannot finalise the order for a customer who has gone, so for
// these the notification email IS the order. The row carries the items and
// whatever contact they left. If they left nothing and the goods are digital,
// there is nothing to send and that is what they chose. If they left nothing
// and something needs to ship, hello@ has a paid order with no address and a
// human decides.
//
// No oxford commas, no em dashes.

import { db, findSettlement, settleRow, expireRow, json } from './_solana.js';

const HOUR = 60 * 60 * 1000;

export const handler = async () => {
  try {
    const rows = await db('solana_payments?status=eq.pending&select=*&order=created_at.asc&limit=100');
    const now = Date.now();
    let paid = 0;
    let expired = 0;

    for (const row of rows || []) {
      const found = await findSettlement({
        reference: row.reference, recipient: row.recipient, currency: row.currency, amountToken: row.amount_token, createdAt: row.created_at,
      }).catch(() => null);
      if (found) {
        await settleRow(row, found);
        paid += 1;
        continue;
      }
      if (new Date(row.expires_at).getTime() + HOUR < now) {
        await expireRow(row.reference);
        expired += 1;
      }
    }

    return json(200, { checked: (rows || []).length, paid, expired });
  } catch (err) {
    console.error('solana-pay-sweep failed', err);
    return json(500, { error: err.message });
  }
};
