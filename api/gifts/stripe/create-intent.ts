import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { sendJson } from '../../_lib/http';
import { dbQuery } from '../../_lib/db';
import { ensureGiftSchema } from '../_lib/schema';
import { generateGiftCode } from '../_lib/code';
import { getGiftPackage, normalizeGiftText } from '../_lib/catalog';

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

    const code = generateGiftCode();
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

    const expiresAt = new Date();
    expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1);

    await dbQuery(
      `insert into gift_vouchers (
         code, package_id, lessons, price_usd, currency, provider,
         stripe_payment_intent_id, status, purchaser_email, recipient_name, message, expires_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        code,
        pkg.id,
        pkg.lessons,
        pkg.priceUsd,
        'USD',
        'stripe',
        intent.id,
        'pending',
        purchaserEmail,
        recipientName,
        message,
        expiresAt.toISOString(),
      ]
    );

    return sendJson(res, 200, {
      code,
      clientSecret: intent.client_secret,
    });
  } catch (e: any) {
    console.error(e);
    return sendJson(res, 400, { message: e?.message || 'Bad Request' });
  }
}
