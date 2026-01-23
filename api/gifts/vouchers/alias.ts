import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendJson } from '../../_lib/http';
import { dbQuery } from '../../_lib/db';
import { ensureGiftSchema } from '../_lib/schema';
import { generateGiftCode, normalizeGiftCodeInput } from '../_lib/code';

function isShortHalqaCode(code: string): boolean {
  return /^HALQA[A-Z0-9]{5}$/.test(code);
}

function isUniqueViolation(e: any): boolean {
  const code = String(e?.code || '').trim();
  const msg = String(e?.message || '');
  return code === '23505' || /duplicate key value violates unique constraint/i.test(msg);
}

/**
 * Returns (and if needed generates) a short-code alias for a voucher.
 * Useful for legacy long codes (e.g. GFT_...).
 *
 * GET /api/gifts/vouchers/alias?code=GFT_...
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { message: `Method ${req.method} not allowed` });
    }

    await ensureGiftSchema();

    const input = normalizeGiftCodeInput(req.query['code']);
    if (!input) return sendJson(res, 400, { message: 'Missing code' });

    const rows = await dbQuery<any>(
      `select id, code, short_code
         from gift_vouchers
        where code = $1 or short_code = $1
        limit 1`,
      [input]
    );

    if (rows.length === 0) return sendJson(res, 404, { message: 'Not found' });

    const v = rows[0];
    const canonical = String(v.code || '');
    const existingShort = String(v.short_code || '');

    // If the canonical code is already short, that's the "new format".
    if (isShortHalqaCode(canonical)) {
      return sendJson(res, 200, { code: canonical, shortCode: canonical });
    }

    // If we already have an alias, return it.
    if (existingShort && isShortHalqaCode(existingShort)) {
      return sendJson(res, 200, { code: canonical, shortCode: existingShort });
    }

    // Otherwise, generate and store a short alias.
    const id = Number(v.id);
    if (!Number.isFinite(id)) return sendJson(res, 400, { message: 'Invalid voucher record' });

    let shortCode = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateGiftCode();

      // Ensure global uniqueness across BOTH code and short_code to avoid ambiguity.
      const exists = await dbQuery<any>(
        `select 1 from gift_vouchers where code = $1 or short_code = $1 limit 1`,
        [candidate]
      );
      if (exists.length > 0) continue;

      try {
        await dbQuery(`update gift_vouchers set short_code = $2 where id = $1`, [id, candidate]);
        shortCode = candidate;
        break;
      } catch (e: any) {
        if (isUniqueViolation(e)) continue;
        throw e;
      }
    }

    if (!shortCode) throw new Error('Failed to generate short code');

    return sendJson(res, 200, { code: canonical, shortCode });
  } catch (e: any) {
    console.error(e);
    return sendJson(res, 400, { message: e?.message || 'Bad Request' });
  }
}
