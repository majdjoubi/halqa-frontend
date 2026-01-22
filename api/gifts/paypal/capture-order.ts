import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendJson } from '../../_lib/http';
import { dbQuery } from '../../_lib/db';
import { ensureGiftSchema } from '../_lib/schema';
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
    const orderId = String(body.orderId || '');
    if (!orderId) return sendJson(res, 400, { message: 'Missing orderId' });

    const rows = await dbQuery<{ code: string; status: string }>(
      `select code, status from gift_vouchers where provider='paypal' and paypal_order_id = $1`,
      [orderId]
    );

    if (rows.length === 0) return sendJson(res, 404, { message: 'Unknown orderId' });

    const code = rows[0].code;
    if (rows[0].status === 'paid') {
      return sendJson(res, 200, { success: true, code, status: 'already_paid' });
    }

    const data: any = await paypalApi(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST',
    });
    const status = String(data?.status || '');
    if (status !== 'COMPLETED') {
      await dbQuery(
        `update gift_vouchers set status = 'failed' where provider='paypal' and paypal_order_id = $1`,
        [orderId]
      );
      return sendJson(res, 400, { success: false, code, status });
    }

    await dbQuery(
      `update gift_vouchers set status='paid', paid_at=now() where provider='paypal' and paypal_order_id = $1`,
      [orderId]
    );

    return sendJson(res, 200, { success: true, code, status });
  } catch (e: any) {
    console.error(e);
    const { status, message } = classifyError(e);
    return sendJson(res, status, { message });
  }
}
