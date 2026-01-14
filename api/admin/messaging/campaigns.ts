import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
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
      const rows = await dbQuery(
        `select id, created_at, audience_type, total_recipients, subject, status, scheduled_at
         from messaging_campaigns
         order by created_at desc
         limit 50`
      );
      return sendJson(res, 200, { campaigns: rows });
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

    const campaignId = crypto.randomUUID();
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

    // Insert recipients + jobs
    for (const email of recipientEmails) {
      const [rec] = await dbQuery<{ id: number }>(
        `insert into messaging_recipients (campaign_id, email)
         values ($1,$2)
         on conflict (campaign_id, email) do update set email = excluded.email
         returning id`,
        [campaignId, email]
      );

      await dbQuery(
        `insert into messaging_send_jobs (campaign_id, recipient_id, scheduled_at, status)
         values ($1,$2,$3,'queued')`,
        [campaignId, rec.id, scheduledAt.toISOString()]
      );
    }

    return sendJson(res, 201, {
      id: campaignId,
      status,
      total_recipients: recipientEmails.length,
    });
  } catch (e: any) {
    console.error(e);
    return sendJson(res, 400, { message: e?.message || 'Bad Request' });
  }
}
