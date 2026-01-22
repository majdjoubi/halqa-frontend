import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendJson } from '../../_lib/http';
import { dbQuery } from '../../_lib/db';
import { ensureGiftSchema } from '../_lib/schema';
import { generateGiftCode } from '../_lib/code';
import { getGiftPackage, normalizeGiftText } from '../_lib/catalog';
import { getPublicBaseUrl } from '../_lib/publicUrl';
import { paypalApi } from './_client';

function classifyError(e: any): { status: number; message: string } {
  const message = String(e?.message || '');

  // Server misconfiguration (missing secrets/env vars)
  if (/^(PAYPAL_[A-Z0-9_]+|DATABASE_URL) is required$/.test(message)) {
    return { status: 500, message };
  }

  // Upstream PayPal failures (not a client/request problem)
  if (
    /^PayPal token error \d+/.test(message) ||
    message === 'Invalid PayPal token response' ||
    /^PayPal error \d+/.test(message)
  ) {
    return { status: 502, message };
  }

  return { status: 400, message: message || 'Bad Request' };
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

    const expiresAt = new Date();
    expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1);

    const baseUrl = getPublicBaseUrl(req);
    const giftUrl = `${baseUrl}/gift/${encodeURIComponent(code)}`;

    const data: any = await paypalApi('/v2/checkout/orders', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: code,
            custom_id: code,
            description: `Halqa gift voucher ${pkg.lessons} lesson(s)`,
            amount: {
              currency_code: 'USD',
              value: pkg.priceUsd.toFixed(2),
            },
          },
        ],
        application_context: {
          brand_name: 'Halqa',
          user_action: 'PAY_NOW',
          return_url: giftUrl,
          cancel_url: `${baseUrl}/gift?canceled=1`,
        },
      }),
    });

    const orderId = String(data?.id || '');
    if (!orderId) throw new Error('PayPal create order missing id');

    await dbQuery(
      `insert into gift_vouchers (
         code, package_id, lessons, price_usd, currency, provider,
         paypal_order_id, status, purchaser_email, recipient_name, message, expires_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        code,
        pkg.id,
        pkg.lessons,
        pkg.priceUsd,
        'USD',
        'paypal',
        orderId,
        'pending',
        purchaserEmail,
        recipientName,
        message,
        expiresAt.toISOString(),
      ]
    );

    return sendJson(res, 200, {
      orderId,
      code,
      giftUrl,
      expiresAtUtc: expiresAt.toISOString(),
    });
  } catch (e: any) {
    console.error(e);
    const { status, message } = classifyError(e);
    return sendJson(res, status, { message });
  }
}
