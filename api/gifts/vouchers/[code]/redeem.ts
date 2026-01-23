import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { sendJson } from '../../../_lib/http';
import { ensureGiftSchema } from '../../_lib/schema';
import { getDbPool } from '../../../_lib/db';
import { getRedeemPackageIdForGiftPackageId, isTestGiftPackageEnabled } from '../../_lib/catalog';
import { normalizeGiftCodeInput } from '../../_lib/code';

const DEFAULT_HALQA_API = 'https://halqa-api-k60w.onrender.com';

type StudentIdentity = { email: string; studentId?: string };

function getHalqaApiBaseUrl(): string {
  return (process.env['HALQA_API_URL'] || DEFAULT_HALQA_API).replace(/\/$/, '');
}

function joinHalqaApi(baseUrl: string, path: string): string {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  if (base.endsWith('/api') && p.startsWith('/api/')) return `${base}${p.slice(4)}`;
  return `${base}${p}`;
}

function getStripe(): Stripe | null {
  const key = process.env['STRIPE_SECRET_KEY'];
  if (!key) return null;
  return new Stripe(key, { apiVersion: '2023-10-16' });
}

async function maybeSyncStripePaid(v: any, client: any): Promise<boolean> {
  if (String(v?.provider || '') !== 'stripe') return false;
  if (String(v?.status || '') === 'paid') return false;

  const stripe = getStripe();
  if (!stripe) return false;

  const piId = String(v?.stripe_payment_intent_id || '').trim();
  const sessionId = String(v?.stripe_checkout_session_id || '').trim();

  try {
    if (piId) {
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (String((pi as any)?.status || '') === 'succeeded') {
        await client.query(
          `update gift_vouchers
             set status = 'paid', paid_at = coalesce(paid_at, now())
           where id = $1 and status = 'pending'`,
          [Number(v.id)]
        );
        v.status = 'paid';
        v.paid_at = v.paid_at || new Date().toISOString();
        return true;
      }
      return false;
    }

    if (sessionId) {
      const session: any = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
      const pi: any = session?.payment_intent;
      if (String(pi?.status || '') === 'succeeded') {
        await client.query(
          `update gift_vouchers
             set status = 'paid', paid_at = coalesce(paid_at, now()),
                 stripe_payment_intent_id = coalesce(stripe_payment_intent_id, nullif($2, ''))
           where id = $1 and status = 'pending'`,
          [Number(v.id), String(pi?.id || '')]
        );
        v.status = 'paid';
        v.paid_at = v.paid_at || new Date().toISOString();
        return true;
      }
    }
  } catch {
    // If Stripe lookup fails, keep pending and let the user retry later.
  }

  return false;
}

function getBearerToken(req: VercelRequest): string | null {
  const h = req.headers['authorization'] || req.headers['Authorization'];
  if (!h) return null;
  const s = Array.isArray(h) ? h[0] : String(h);
  const m = s.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function isStudentRole(role: unknown): boolean {
  if (role === 1) return true; // UserRole.Student
  const s = String(role ?? '').trim();
  if (!s) return false;
  if (s === '1') return true;
  return s.toLowerCase() === 'student';
}

async function fetchStudentIdentity(studentToken: string): Promise<StudentIdentity | null> {
  const profileResp = await fetch(joinHalqaApi(getHalqaApiBaseUrl(), '/api/user/profile'), {
    headers: { Authorization: `Bearer ${studentToken}` },
  });

  if (profileResp.ok) {
    const data: any = await profileResp.json().catch(() => null);
    if (!isStudentRole(data?.role)) return null;

    const email = String(data?.email || '').trim();
    const studentId = String(data?.student?.id || data?.studentId || '').trim();
    if (!email) return null;
    return { email, studentId: studentId || undefined };
  }

  const dashboardResp = await fetch(joinHalqaApi(getHalqaApiBaseUrl(), '/api/student/dashboard'), {
    headers: { Authorization: `Bearer ${studentToken}` },
  });

  if (!dashboardResp.ok) return null;
  const data: any = await dashboardResp.json().catch(() => null);
  const email = String(data?.email || data?.student?.email || data?.user?.email || '').trim();
  const studentId = String(data?.id || data?.studentId || data?.student?.id || data?.userId || '').trim();
  if (!email) return null;
  return { email, studentId: studentId || undefined };
}

async function adminCreditWallet(email: string, amount: number, description: string): Promise<any> {
  const adminToken = process.env['HALQA_ADMIN_TOKEN'];
  if (!adminToken) throw new Error('HALQA_ADMIN_TOKEN is required to redeem gifts');

  const resp = await fetch(joinHalqaApi(getHalqaApiBaseUrl(), '/api/admin/wallet/credit'), {
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
  const resp = await fetch(joinHalqaApi(getHalqaApiBaseUrl(), '/v2/available-lessons/buy-with-wallet'), {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { message: `Method ${req.method} not allowed` });
  }

  try {
    await ensureGiftSchema();

    const studentToken = getBearerToken(req);
    if (!studentToken) return sendJson(res, 401, { message: 'Missing Authorization bearer token' });

    const code = normalizeGiftCodeInput(req.query['code']);
    if (!code) return sendJson(res, 400, { message: 'Missing code' });

    const student = await fetchStudentIdentity(studentToken);
    if (!student) return sendJson(res, 401, { message: 'Invalid student token' });

    const pool = getDbPool();
    const client = await pool.connect();

    try {
      await client.query('begin');

      const { rows } = await client.query(
        `select * from gift_vouchers where code = $1 or short_code = $1 for update`,
        [code]
      );

      if (rows.length === 0) {
        await client.query('rollback');
        return sendJson(res, 404, { message: 'Voucher not found' });
      }

      const v = rows[0];
      const voucherId = Number(v.id);

      if (String(v.status) !== 'paid') {
        await maybeSyncStripePaid(v, client);

        if (String(v.status) !== 'paid') {
          await client.query('rollback');
          return sendJson(res, 400, { message: 'Voucher is not paid yet' });
        }
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
        // Do not mark redeemed if external calls fail.
        await client.query('rollback');
        return sendJson(res, 400, { message: e?.message || 'Redeem failed' });
      }

      await client.query(
        `update gift_vouchers
            set redeemed_at = now(), redeemed_by_email = $2, redeemed_by_student_id = $3,
                halqa_wallet_credit_tx_id = $4, halqa_package_purchase_id = $5
          where id = $1`,
        [
          voucherId,
          student.email,
          student.studentId || null,
          String(walletCreditResp?.transactionId || walletCreditResp?.id || ''),
          String(buyResp?.purchaseId || buyResp?.id || ''),
        ]
      );

      await client.query('commit');

      return sendJson(res, 200, {
        ok: true,
        code: String(v.code),
        shortCode: v.short_code || null,
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
