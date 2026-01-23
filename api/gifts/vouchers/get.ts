import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { sendJson } from '../../_lib/http';
import { dbQuery } from '../../_lib/db';
import { ensureGiftSchema } from '../_lib/schema';
import { getPublicBaseUrl } from '../_lib/publicUrl';
import { normalizeGiftCodeInput } from '../_lib/code';

// NOTE: This endpoint exists as a fallback for deployments where dynamic
// function routes (e.g. api/gifts/vouchers/[code].ts) are not routed.
// It is typically used via a Vercel rewrite from:
//   /api/gifts/vouchers/:code  ->  /api/gifts/vouchers/get?code=:code
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { message: `Method ${req.method} not allowed` });
    }

    await ensureGiftSchema();

    const code = normalizeGiftCodeInput(req.query['code']);
    if (!code) return sendJson(res, 400, { message: 'Missing code' });

    const rows = await dbQuery<any>(
      `select code, short_code, package_id, lessons, price_usd, currency, provider, status,
              stripe_payment_intent_id, stripe_checkout_session_id,
              recipient_name, message, created_at, paid_at, expires_at, redeemed_at
         from gift_vouchers
        where code = $1 or short_code = $1`,
      [code]
    );

    if (rows.length === 0) return sendJson(res, 404, { message: 'Not found' });

    const v = rows[0];

    // Best-effort: if Stripe already confirmed payment, reflect it immediately.
    if (String(v.provider) === 'stripe' && String(v.status) === 'pending') {
      const key = process.env['STRIPE_SECRET_KEY'];
      const piId = String(v.stripe_payment_intent_id || '').trim();
      if (key && piId) {
        try {
          const stripe = new Stripe(key, { apiVersion: '2023-10-16' });
          const pi = await stripe.paymentIntents.retrieve(piId);
          if (String((pi as any)?.status || '') === 'succeeded') {
            await dbQuery(
              `update gift_vouchers set status='paid', paid_at=coalesce(paid_at, now())
               where stripe_payment_intent_id = $1 and status = 'pending'`,
              [piId]
            );
            v.status = 'paid';
            v.paid_at = v.paid_at || new Date().toISOString();
          }
        } catch {
          // ignore
        }
      }
    }
    const baseUrl = getPublicBaseUrl(req);
    const redeemCode = String(v.short_code || v.code);

    return sendJson(res, 200, {
      voucher: {
        code: v.code,
        shortCode: v.short_code,
        packageId: v.package_id,
        lessons: Number(v.lessons),
        priceUsd: Number(v.price_usd),
        currency: v.currency,
        provider: v.provider,
        status: v.status,
        recipientName: v.recipient_name,
        message: v.message,
        createdAtUtc: v.created_at,
        paidAtUtc: v.paid_at,
        expiresAtUtc: v.expires_at,
        redeemedAtUtc: v.redeemed_at,
        redeemUrl: `${baseUrl.replace(/\/$/, '')}/redeem/${encodeURIComponent(redeemCode)}`,
      },
    });
  } catch (e: any) {
    console.error(e);
    return sendJson(res, 400, { message: e?.message || 'Bad Request' });
  }
}
