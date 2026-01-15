import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendJson } from '../../../_lib/http';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  // Intentionally does NOT require admin auth.
  // Returns only booleans and minimal details to help diagnose production routing/config.
  const hasDatabaseUrl = !!process.env.DATABASE_URL;
  const hasSendgridKey = !!process.env.SENDGRID_API_KEY;

  return sendJson(res, 200, {
    ok: true,
    route: '/api/admin/messaging/debug/ping',
    time: new Date().toISOString(),
    config: {
      hasDatabaseUrl,
      hasSendgridKey,
    },
  });
}
