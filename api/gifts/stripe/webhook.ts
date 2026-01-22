import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import Stripe from 'stripe';
import { sendJson } from '../../_lib/http';
import { dbQuery } from '../../_lib/db';
import { ensureGiftSchema } from '../_lib/schema';

// Ensure we can read the raw request body for signature verification.
export const config = {
  api: {
    bodyParser: false,
  },
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function getStripe(): Stripe {
  const key = requireEnv('STRIPE_SECRET_KEY');
  return new Stripe(key, { apiVersion: '2023-10-16' });
}

async function readRawBody(req: VercelRequest): Promise<string> {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifyStripeSignature(rawBody: string, signatureHeader: string, secret: string): void {
  // Stripe-Signature: t=timestamp,v1=signature,...
  const parts = signatureHeader.split(',').map((p) => p.trim());
  const timestampPart = parts.find((p) => p.startsWith('t='));
  const v1Parts = parts.filter((p) => p.startsWith('v1='));
  if (!timestampPart || v1Parts.length === 0) throw new Error('Invalid Stripe signature header');

  const ts = Number(timestampPart.slice(2));
  if (!Number.isFinite(ts)) throw new Error('Invalid Stripe signature timestamp');

  // 5 minutes tolerance
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > 300) throw new Error('Stripe signature timestamp outside tolerance');

  const signedPayload = `${ts}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  const ok = v1Parts.some((p) => timingSafeEqualHex(p.slice(3), expected));
  if (!ok) throw new Error('Invalid Stripe signature');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Stripe expects 2xx; return 200 even if we log errors to avoid retry storms.
  try {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { message: `Method ${req.method} not allowed` });
    }

    await ensureGiftSchema();

    const sig = String(req.headers['stripe-signature'] || '');
    if (!sig) return sendJson(res, 200, { ok: true });

    const secret = requireEnv('STRIPE_GIFT_WEBHOOK_SECRET');
    const rawBody = await readRawBody(req);

    // Prefer Stripe's implementation; fall back to our own verification if needed.
    let event: any;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(rawBody, sig, secret);
    } catch (e) {
      verifyStripeSignature(rawBody, sig, secret);
      event = JSON.parse(rawBody);
    }

    if (event?.type === 'checkout.session.completed') {
      const session = event?.data?.object;
      const sessionId = String(session?.id || '');
      const paymentIntentId = String(session?.payment_intent || '');
      const code = String(session?.metadata?.code || '');

      if (sessionId) {
        await dbQuery(
          `update gift_vouchers
           set status = 'paid', paid_at = coalesce(paid_at, now()),
               stripe_payment_intent_id = nullif($2, '')
           where stripe_checkout_session_id = $1
             and status = 'pending'`,
          [sessionId, paymentIntentId]
        );
      } else if (code) {
        await dbQuery(
          `update gift_vouchers
           set status = 'paid', paid_at = coalesce(paid_at, now())
           where code = $1 and status = 'pending'`,
          [code]
        );
      }
    }

    if (event?.type === 'payment_intent.payment_failed') {
      const pi = event?.data?.object;
      const code = String(pi?.metadata?.code || '');
      if (code) {
        await dbQuery(`update gift_vouchers set status = 'failed' where code = $1`, [code]);
      }
    }

    if (event?.type === 'payment_intent.succeeded') {
      const pi = event?.data?.object;
      const piId = String(pi?.id || '');
      const code = String(pi?.metadata?.code || '');

      if (piId) {
        await dbQuery(
          `update gift_vouchers
             set status = 'paid', paid_at = coalesce(paid_at, now())
           where stripe_payment_intent_id = $1
             and status = 'pending'`,
          [piId]
        );
      } else if (code) {
        await dbQuery(
          `update gift_vouchers
             set status = 'paid', paid_at = coalesce(paid_at, now())
           where code = $1
             and status = 'pending'`,
          [code]
        );
      }
    }

    return sendJson(res, 200, { ok: true });
  } catch (e: any) {
    console.error(e);
    return sendJson(res, 200, { ok: false });
  }
}
