import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendJson } from '../_lib/http';
import { GIFT_PACKAGES } from './_lib/catalog';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { message: `Method ${req.method} not allowed` });
  }

  return sendJson(res, 200, { packages: GIFT_PACKAGES });
}
