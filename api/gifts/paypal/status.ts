import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendJson } from '../../_lib/http';

function hasAnyEnv(names: string[]): boolean {
  return names.some((n) => !!process.env[n]);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { message: `Method ${req.method} not allowed` });
  }

  // This endpoint is intentionally lightweight and does not talk to PayPal.
  // It only tells the frontend whether server-side PayPal gifting is configured.
  const hasClientId = hasAnyEnv(['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENTID', 'PAYPAL_CLIENT_ID_LIVE']);
  const hasSecret = hasAnyEnv(['PAYPAL_CLIENT_SECRET', 'PAYPAL_SECRET', 'PAYPAL_CLIENT_SECRET_LIVE']);

  return sendJson(res, 200, { enabled: hasClientId && hasSecret });
}
