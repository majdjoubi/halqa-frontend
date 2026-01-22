import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readJson, sendJson, requireMethod } from '../../_lib/http';
import { dbQuery } from '../../_lib/db';
import { ensureGiftSchema } from '../_lib/schema';
import { generateGiftCode } from '../_lib/code';
import { getGiftPackage, normalizeGiftText } from '../_lib/catalog';
import { addDaysUtc, getPublicBaseUrl } from '../_lib/publicUrl';

type Body = {
  packageId: string;
  purchaserEmail?: string;
  recipientName?: string;
  message?: string;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function stripePostForm(path: string, params: URLSearchParams): Promise<any> {
  const secretKey = requireEnv('STRIPE_SECRET_KEY');
  const resp = await fetch(`https://api.stripe.com/v1/${path.replace(/^\/+/, '')}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  const text = await resp.text().catch(() => '');
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!resp.ok) {
    const msg = json?.error?.message || text || `Stripe error ${resp.status}`;
    throw new Error(msg);
  }

  return json;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!requireMethod(req, res, 'POST')) return;

    const body = await readJson<Body>(req);
    const pkg = getGiftPackage(String(body.packageId || ''));
    if (!pkg) return sendJson(res, 400, { message: 'Invalid packageId' });

    const purchaserEmail = normalizeGiftText(body.purchaserEmail, 180);
    const recipientName = normalizeGiftText(body.recipientName, 80);
    const message = normalizeGiftText(body.message, 500);

    const now = new Date();
    const expiresAt = addDaysUtc(now, 365);
    const code = generateGiftCode();

    await ensureGiftSchema();

    const baseUrl = getPublicBaseUrl(req);
    const successUrl = `${baseUrl}/gift/${encodeURIComponent(code)}?paid=1`;
    const cancelUrl = `${baseUrl}/gift?canceled=1`;

    const unitAmount = Math.round(pkg.priceUsd * 100);

    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('success_url', successUrl);
    params.set('cancel_url', cancelUrl);
    params.set('line_items[0][quantity]', '1');
    params.set('line_items[0][price_data][currency]', 'usd');
    params.set('line_items[0][price_data][unit_amount]', String(unitAmount));
    params.set('line_items[0][price_data][product_data][name]', `Halqa Gift — ${pkg.lessons} lesson${pkg.lessons === 1 ? '' : 's'}`);
    if (purchaserEmail) params.set('customer_email', purchaserEmail);

    // Metadata for webhook
    params.set('metadata[code]', code);
    params.set('metadata[package_id]', pkg.id);
    if (recipientName) params.set('metadata[recipient_name]', recipientName);
    if (message) params.set('metadata[message]', message);

    const session = await stripePostForm('checkout/sessions', params);

    const sessionId = String(session?.id || '');
    const sessionUrl = String(session?.url || '');
    if (!sessionId || !sessionUrl) throw new Error('Stripe session creation failed');

    await dbQuery(
      `insert into gift_vouchers (
         code, package_id, lessons, price_usd, currency, provider,
         stripe_checkout_session_id, status, purchaser_email, recipient_name, message,
         created_at, expires_at
       ) values (
         $1,$2,$3,$4,'USD','stripe',
         $5,'pending',$6,$7,$8,
         now(), $9
       )`,
      [
        code,
        pkg.id,
        pkg.lessons,
        pkg.priceUsd,
        sessionId,
        purchaserEmail,
        recipientName,
        message,
        expiresAt.toISOString(),
      ]
    );

    return sendJson(res, 200, {
      code,
      checkoutUrl: sessionUrl,
      giftUrl: `${baseUrl}/gift/${encodeURIComponent(code)}`,
      expiresAtUtc: expiresAt.toISOString(),
    });
  } catch (e: any) {
    console.error(e);
    return sendJson(res, 400, { message: e?.message || 'Bad Request' });
  }
}
