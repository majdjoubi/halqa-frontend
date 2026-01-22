import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendJson } from '../../_lib/http';
import { dbQuery } from '../../_lib/db';
import { ensureGiftSchema } from '../_lib/schema';
import { getPublicBaseUrl } from '../_lib/publicUrl';

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

    const code = String(req.query['code'] || '').trim();
    if (!code) return sendJson(res, 400, { message: 'Missing code' });

    const rows = await dbQuery<any>(
      `select code, package_id, lessons, price_usd, currency, provider, status,
              recipient_name, message, created_at, paid_at, expires_at, redeemed_at
         from gift_vouchers
        where code = $1`,
      [code]
    );

    if (rows.length === 0) return sendJson(res, 404, { message: 'Not found' });

    const v = rows[0];
    const baseUrl = getPublicBaseUrl(req);

    return sendJson(res, 200, {
      voucher: {
        code: v.code,
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
        redeemUrl: `${baseUrl.replace(/\/$/, '')}/redeem/${encodeURIComponent(v.code)}`,
      },
    });
  } catch (e: any) {
    console.error(e);
    return sendJson(res, 400, { message: e?.message || 'Bad Request' });
  }
}
