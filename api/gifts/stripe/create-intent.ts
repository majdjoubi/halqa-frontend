import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { sendJson } from '../../_lib/http';
import { dbQuery } from '../../_lib/db';
import { ensureGiftSchema } from '../_lib/schema';
import { generateGiftCode } from '../_lib/code';
import { getGiftPackage, normalizeGiftText } from '../_lib/catalog';

function isUniqueViolation(e: any): boolean {
  const code = String(e?.code || '').trim();
  const msg = String(e?.message || '');
  return code === '23505' || /duplicate key value violates unique constraint/i.test(msg);
}

function getStripe(): Stripe {
  const key = process.env['STRIPE_SECRET_KEY'];
  if (!key) throw new Error('STRIPE_SECRET_KEY is required');
  return new Stripe(key, { apiVersion: '2023-10-16' });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { message: `Method ${req.method} not allowed` });
    }

    await ensureGiftSchema();

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const packageId = String(body.packageId || '');
    const pkg = getGiftPackage(packageId);
    if (!pkg) return sendJson(res, 400, { message: 'Invalid packageId' });

    const recipientName = normalizeGiftText(body.recipientName, 80);
    const message = normalizeGiftText(body.message, 500);
    const purchaserEmail = normalizeGiftText(body.purchaserEmail, 120);

    const expiresAt = new Date();
    expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1);

    // Reserve a unique code first to avoid collisions and keep payment metadata consistent.
    let code = '';
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = generateGiftCode();
      try {
        await dbQuery(
          `insert into gift_vouchers (
             code, package_id, lessons, price_usd, currency, provider,
             stripe_payment_intent_id, status, purchaser_email, recipient_name, message, expires_at
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            candidate,
            pkg.id,
            pkg.lessons,
            pkg.priceUsd,
            'USD',
            'stripe',
            null,
            'pending',
            purchaserEmail,
            recipientName,
            message,
            expiresAt.toISOString(),
          ]
        );
        code = candidate;
        break;
      } catch (e: any) {
        if (isUniqueViolation(e)) continue;
        throw e;
      }
    }

    if (!code) throw new Error('Failed to generate a unique gift code');

    const amountCents = Math.round(pkg.priceUsd * 100);

    const stripe = getStripe();
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      payment_method_types: ['card'],
      metadata: {
        type: 'gift_voucher',
        code,
        packageId: pkg.id,
      },
      description: `Halqa gift voucher ${pkg.lessons} lesson(s)`,
      ...(purchaserEmail ? { receipt_email: purchaserEmail } : {}),
    });

    await dbQuery(`update gift_vouchers set stripe_payment_intent_id = $2 where code = $1`, [code, intent.id]);

    return sendJson(res, 200, {
      code,
      clientSecret: intent.client_secret,
    });
  } catch (e: any) {
    console.error(e);
    return sendJson(res, 400, { message: e?.message || 'Bad Request' });
  }
}
