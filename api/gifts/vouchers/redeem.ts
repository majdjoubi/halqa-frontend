import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendJson } from '../../_lib/http';
import { ensureGiftSchema } from '../_lib/schema';
import { getDbPool } from '../../_lib/db';
import { getRedeemPackageIdForGiftPackageId, isTestGiftPackageEnabled } from '../_lib/catalog';

const DEFAULT_HALQA_API = 'https://halqa-api-k60w.onrender.com';

function getHalqaApiBaseUrl(): string {
  return (process.env['HALQA_API_URL'] || DEFAULT_HALQA_API).replace(/\/$/, '');
}

function getBearerToken(req: VercelRequest): string | null {
  const h = req.headers['authorization'] || req.headers['Authorization'];
  if (!h) return null;
  const s = Array.isArray(h) ? h[0] : String(h);
  const m = s.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function fetchStudentDashboard(studentToken: string): Promise<{ email: string; studentId?: string } | null> {
  const resp = await fetch(`${getHalqaApiBaseUrl()}/api/student/dashboard`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });

  if (!resp.ok) return null;
  const data: any = await resp.json().catch(() => null);
  const email = String(data?.email || data?.student?.email || data?.user?.email || '').trim();
  const studentId = String(data?.id || data?.studentId || data?.student?.id || data?.userId || '').trim();
  if (!email) return null;
  return { email, studentId: studentId || undefined };
}

async function adminCreditWallet(email: string, amount: number, description: string): Promise<any> {
  const adminToken = process.env['HALQA_ADMIN_TOKEN'];
  if (!adminToken) throw new Error('HALQA_ADMIN_TOKEN is required to redeem gifts');

  const resp = await fetch(`${getHalqaApiBaseUrl()}/api/admin/wallet/credit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount,
      target: 'student',
      description,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Halqa admin wallet credit failed: ${resp.status} ${text}`);
  }

  return resp.json().catch(() => ({}));
}

async function studentBuyPackageWithWallet(studentToken: string, packageId: string): Promise<any> {
  const resp = await fetch(`${getHalqaApiBaseUrl()}/v2/available-lessons/buy-with-wallet`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${studentToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ packageId }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Halqa buy-with-wallet failed: ${resp.status} ${text}`);
  }

  return resp.json().catch(() => ({}));
}

// NOTE: This endpoint exists as a fallback for deployments where dynamic
// function routes (e.g. api/gifts/vouchers/[code]/redeem.ts) are not routed.
// It is typically used via a Vercel rewrite from:
//   /api/gifts/vouchers/:code/redeem  ->  /api/gifts/vouchers/redeem?code=:code
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { message: `Method ${req.method} not allowed` });
  }

  try {
    await ensureGiftSchema();

    const studentToken = getBearerToken(req);
    if (!studentToken) return sendJson(res, 401, { message: 'Missing Authorization bearer token' });

    const code = String(req.query['code'] || '').trim();
    if (!code) return sendJson(res, 400, { message: 'Missing code' });

    const student = await fetchStudentDashboard(studentToken);
    if (!student) return sendJson(res, 401, { message: 'Invalid student token' });

    const pool = getDbPool();
    const client = await pool.connect();

    try {
      await client.query('begin');

      const { rows } = await client.query(`select * from gift_vouchers where code = $1 for update`, [code]);

      if (rows.length === 0) {
        await client.query('rollback');
        return sendJson(res, 404, { message: 'Voucher not found' });
      }

      const v = rows[0];

      if (String(v.status) !== 'paid') {
        await client.query('rollback');
        return sendJson(res, 400, { message: 'Voucher is not paid yet' });
      }

      if (v.redeemed_at) {
        await client.query('rollback');
        return sendJson(res, 400, { message: 'Voucher already redeemed' });
      }

      const expiresAt = new Date(v.expires_at);
      if (expiresAt.getTime() <= Date.now()) {
        await client.query('rollback');
        return sendJson(res, 400, { message: 'Voucher expired' });
      }

      const voucherPackageId = String(v.package_id || '');
      if (voucherPackageId === 'pkg_test' && !isTestGiftPackageEnabled()) {
        await client.query('rollback');
        return sendJson(res, 400, { message: 'Test vouchers are disabled' });
      }

      const packageId = getRedeemPackageIdForGiftPackageId(voucherPackageId);
      const amount = Number(v.price_usd);

      // External side-effects (Halqa API). Keep lock held to guarantee single-use.
      const description = `Gift voucher ${code} (${packageId})`;

      let walletCreditResp: any = null;
      let buyResp: any = null;

      try {
        walletCreditResp = await adminCreditWallet(student.email, amount, description);
        buyResp = await studentBuyPackageWithWallet(studentToken, packageId);
      } catch (e: any) {
        await client.query('rollback');
        return sendJson(res, 400, { message: e?.message || 'Redeem failed' });
      }

      await client.query(
        `update gift_vouchers
            set redeemed_at = now(), redeemed_by_email = $2, redeemed_by_student_id = $3,
                halqa_wallet_credit_tx_id = $4, halqa_package_purchase_id = $5
          where code = $1`,
        [
          code,
          student.email,
          student.studentId || null,
          String(walletCreditResp?.transactionId || walletCreditResp?.id || ''),
          String(buyResp?.purchaseId || buyResp?.id || ''),
        ]
      );

      await client.query('commit');

      return sendJson(res, 200, {
        ok: true,
        code,
        packageId,
        creditedUsd: amount,
      });
    } finally {
      client.release();
    }
  } catch (e: any) {
    console.error(e);
    return sendJson(res, 400, { message: e?.message || 'Bad Request' });
  }
}
