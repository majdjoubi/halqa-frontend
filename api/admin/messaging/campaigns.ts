import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { dbQuery } from '../../_lib/db';
import { requireAdmin, fetchAdminUsers } from '../../_lib/adminAuth';
import { readJson, sendJson } from '../../_lib/http';
import {
  FROM_EMAIL,
  REPLY_TO_EMAIL,
  dailyDomainLimit,
  normalizeEmail,
  scanContentOrThrow,
} from '../../_lib/validation';

type AudienceType =
  | 'all_teachers'
  | 'all_students'
  | 'all_users'
  | 'custom_list'
  | 'single_email';

type CreateCampaignBody = {
  audience_type: AudienceType;
  subject: string;
  html_body: string;
  timing: 'now' | 'schedule';
  scheduled_at?: string | null;
  test_send?: boolean;
  test_email?: string | null;
  custom_emails?: string[] | null;
  single_email?: string | null;
};

async function insertRecipientsAndJobs(params: {
  campaignId: string;
  scheduledAtIso: string;
  emails: string[];
}): Promise<void> {
  const uniqueEmails = Array.from(new Set(params.emails.map(normalizeEmail).filter(Boolean)));
  if (uniqueEmails.length === 0) return;

  // Bulk insert recipients (idempotent via unique(campaign_id,email))
  await dbQuery(
    `insert into messaging_recipients (campaign_id, email)
     select $1, e
     from unnest($2::text[]) as e
     on conflict (campaign_id, email) do update set email = excluded.email`,
    [params.campaignId, uniqueEmails]
  );

  // Bulk insert jobs for any recipients that don't have a job yet (idempotent)
  await dbQuery(
    `insert into messaging_send_jobs (campaign_id, recipient_id, scheduled_at, status)
     select $1, r.id, $2::timestamptz, 'queued'
     from messaging_recipients r
     where r.campaign_id = $1
       and not exists (
         select 1 from messaging_send_jobs j
         where j.campaign_id = $1 and j.recipient_id = r.id
       )`,
    [params.campaignId, params.scheduledAtIso]
  );
}

function isValidAudience(a: any): a is AudienceType {
  return (
    a === 'all_teachers' ||
    a === 'all_students' ||
    a === 'all_users' ||
    a === 'custom_list' ||
    a === 'single_email'
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      await requireAdmin(req);
      const page = Math.max(1, Number(req.query['page'] || 1));
      const pageSize = Math.min(100, Math.max(1, Number(req.query['pageSize'] || 50)));
      const offset = (page - 1) * pageSize;

      const rows = await dbQuery(
        `select id, created_at, audience_type, total_recipients, subject, status, scheduled_at
         from messaging_campaigns
         order by created_at desc
         limit $1 offset $2`,
        [pageSize, offset]
      );
      return sendJson(res, 200, { campaigns: rows, page, pageSize });
    }

    if (req.method !== 'POST') {
      return sendJson(res, 405, { message: `Method ${req.method} not allowed` });
    }

    const admin = await requireAdmin(req);
    const body = await readJson<CreateCampaignBody>(req);

    if (!isValidAudience(body.audience_type)) {
      return sendJson(res, 400, { message: 'Invalid audience_type' });
    }

    scanContentOrThrow(body.subject, body.html_body);

    const now = new Date();
    const scheduledAt =
      body.timing === 'schedule'
        ? new Date(body.scheduled_at || '')
        : now;

    if (Number.isNaN(scheduledAt.getTime())) {
      return sendJson(res, 400, { message: 'Invalid scheduled_at' });
    }

    // Warm-up / daily limit gate (domain-level)
    const limitPerDay = dailyDomainLimit();
    const [{ sent_today }] = await dbQuery<{ sent_today: number }>(
      `select count(*)::int as sent_today
       from messaging_send_jobs
       where status = 'sent'
         and sent_at >= date_trunc('day', now())`,
      []
    );

    if (sent_today >= limitPerDay) {
      return sendJson(res, 429, { message: `Daily sending limit reached (${limitPerDay}/day)` });
    }

    let recipientEmails: string[] = [];

    const isTest = !!body.test_send;
    if (isTest) {
      const testEmail = normalizeEmail(body.test_email || '');
      if (!testEmail) return sendJson(res, 400, { message: 'test_email is required' });
      recipientEmails = [testEmail];
    } else if (body.audience_type === 'single_email') {
      const email = normalizeEmail(body.single_email || '');
      if (!email) return sendJson(res, 400, { message: 'single_email is required' });
      recipientEmails = [email];
    } else if (body.audience_type === 'custom_list') {
      const emails = (body.custom_emails || []).map(normalizeEmail).filter(Boolean);
      if (emails.length === 0) return sendJson(res, 400, { message: 'custom_emails is required' });
      recipientEmails = Array.from(new Set(emails));
    } else {
      const users = await fetchAdminUsers(req);
      const mapped = (users || [])
        .map((u: any) => ({
          email: normalizeEmail(u?.email || ''),
          role: u?.role,
        }))
        .filter((u: any) => !!u.email);

      if (body.audience_type === 'all_teachers') {
        recipientEmails = mapped.filter((u: any) => String(u.role) === '2').map((u: any) => u.email);
      } else if (body.audience_type === 'all_students') {
        recipientEmails = mapped.filter((u: any) => String(u.role) === '1').map((u: any) => u.email);
      } else {
        recipientEmails = mapped.map((u: any) => u.email);
      }

      recipientEmails = Array.from(new Set(recipientEmails));
    }

    const campaignId = randomUUID();
    const status = 'queued';

    await dbQuery(
      `insert into messaging_campaigns (id, created_by_email, audience_type, total_recipients, subject, html_body, status, scheduled_at, from_email, reply_to_email)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        campaignId,
        admin.email || null,
        isTest ? 'test_send' : body.audience_type,
        recipientEmails.length,
        body.subject,
        body.html_body,
        status,
        body.timing === 'schedule' ? scheduledAt.toISOString() : null,
        FROM_EMAIL,
        REPLY_TO_EMAIL,
      ]
    );

    await insertRecipientsAndJobs({
      campaignId,
      scheduledAtIso: scheduledAt.toISOString(),
      emails: recipientEmails,
    });

    return sendJson(res, 201, {
      id: campaignId,
      status,
      total_recipients: recipientEmails.length,
    });
  } catch (e: any) {
    console.error(e);

    const msg = String(e?.message || 'Unknown error');
    // Map common operational failures to correct HTTP statuses (and clearer messages).
    if (msg.includes('Missing Authorization header') || msg.includes('Unauthorized')) {
      return sendJson(res, 401, { message: msg });
    }
    if (msg.includes('DATABASE_URL is required')) {
      return sendJson(res, 500, { message: 'Server not configured: DATABASE_URL is missing' });
    }
    if (
      msg.includes('messaging_') &&
      (msg.includes('relation') || msg.includes('column') || msg.includes('type'))
    ) {
      return sendJson(res, 500, {
        message: 'Database schema missing: apply db/migrations/001_admin_messaging.sql',
      });
    }
    if (msg.includes('Failed to fetch users from backend')) {
      return sendJson(res, 502, { message: 'Upstream backend error while fetching users' });
    }

    if (msg.startsWith('Upstream backend error')) {
      return sendJson(res, 502, { message: msg });
    }

    // Network/edge errors when calling the upstream backend for auth/user list
    if (
      msg.includes('fetch failed') ||
      msg.includes('AbortError') ||
      msg.includes('aborted') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('ETIMEDOUT')
    ) {
      return sendJson(res, 502, { message: 'Upstream backend unreachable (auth/user lookup)' });
    }

    return sendJson(res, 500, { message: 'A server error has occurred' });
  }
}
