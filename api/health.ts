import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendJson } from './_lib/http';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  return sendJson(res, 200, {
    ok: true,
    service: 'halqa-web',
    time: new Date().toISOString(),
  });
}
