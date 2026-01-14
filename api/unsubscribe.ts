import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dbQuery } from './_lib/db';
import { sendJson } from './_lib/http';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return sendJson(res, 405, { message: `Method ${req.method} not allowed` });
    }

    const token = String(req.query.token || '');
    if (!token) return sendJson(res, 400, { message: 'Missing token' });

    const rows = await dbQuery<{ email: string }>(
      `select email from messaging_unsubscribe_tokens where token = $1`,
      [token]
    );

    if (rows.length === 0) {
      return sendJson(res, 404, { message: 'Invalid token' });
    }

    const email = rows[0].email;

    await dbQuery(
      `insert into messaging_unsubscribes (email) values ($1)
       on conflict (email) do update set unsubscribed_at = now()`,
      [email]
    );

    return sendJson(res, 200, { ok: true, email });
  } catch (e: any) {
    console.error(e);
    return sendJson(res, 400, { message: e?.message || 'Bad Request' });
  }
}
