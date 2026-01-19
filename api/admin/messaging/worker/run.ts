import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dbQuery } from '../../../_lib/db';
import { sendJson } from '../../../_lib/http';
import { requireAdmin } from '../../../_lib/adminAuth';
import {
  buildFooterHtml,
  dailyDomainLimit,
  generateUnsubscribeToken,
  normalizeEmail,
  renderTemplate,
} from '../../../_lib/validation';
import { sendViaSendGrid } from '../../../_lib/sendgrid';

function requireWorkerSecret(req: VercelRequest): void {
  const expected = process.env['MESSAGING_WORKER_SECRET'];
  if (!expected) throw new Error('MESSAGING_WORKER_SECRET is required');
  const got = req.headers['x-worker-secret'];
  if (got !== expected) throw new Error('Unauthorized worker');
}

async function authorizeWorkerOrAdmin(req: VercelRequest): Promise<void> {
  // Prefer worker secret (for automation).
  // Fallback to admin auth to allow manual runs from the admin UI.
  try {
    requireWorkerSecret(req);
    return;
  } catch {
    // ignore and try admin auth
  }
  await requireAdmin(req);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { message: `Method ${req.method} not allowed` });
    }

    await authorizeWorkerOrAdmin(req);

    const startedAt = Date.now();
    const maxRunMs = Number(process.env['MESSAGING_WORKER_MAX_MS'] || 8000);
    const hardMaxJobs = Number(process.env['MESSAGING_WORKER_MAX_JOBS'] || 10);

    const limitPerMinute = 50;
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

    const [{ sent_last_min }] = await dbQuery<{ sent_last_min: number }>(
      `select count(*)::int as sent_last_min
       from messaging_send_jobs
       where status = 'sent'
         and sent_at >= now() - interval '60 seconds'`,
      []
    );

    const remainingThisMinute = Math.max(0, limitPerMinute - sent_last_min);
    const remainingToday = Math.max(0, limitPerDay - sent_today);
    const take = Math.min(remainingThisMinute, remainingToday, hardMaxJobs);

    if (take <= 0) {
      return sendJson(res, 200, { processed: 0, message: 'Rate limit reached' });
    }

    // Backwards-compat repair: older rows may have NULL scheduled_at.
    // Treat them as immediately due (or fallback to campaign schedule/created_at).
    await dbQuery(
      `update messaging_send_jobs j
       set scheduled_at = coalesce(j.scheduled_at, c.scheduled_at, c.created_at)
       from messaging_campaigns c
       where c.id = j.campaign_id
         and j.status = 'queued'
         and j.scheduled_at is null`,
      []
    );

    const jobs = await dbQuery<any>(
      `select
         j.id as job_id,
         j.campaign_id,
         r.id as recipient_id,
         r.email,
         r.first_name,
         r.role,
         c.subject,
         c.html_body,
         coalesce(j.scheduled_at, c.scheduled_at, c.created_at) as effective_scheduled_at
       from messaging_send_jobs j
       join messaging_recipients r on r.id = j.recipient_id
       join messaging_campaigns c on c.id = j.campaign_id
       where j.status = 'queued'
         and coalesce(j.scheduled_at, c.scheduled_at, c.created_at) <= now()
       order by coalesce(j.scheduled_at, c.scheduled_at, c.created_at) asc
       limit $1`,
      [take]
    );

    // Flip campaigns to "sending" immediately so UI doesn't remain "queued"
    // if the function gets terminated mid-run.
    const campaignIds = Array.from(new Set(jobs.map((j: any) => String(j.campaign_id))));
    for (const campaignId of campaignIds) {
      await dbQuery(
        `update messaging_campaigns set status = 'sending'
         where id = $1 and status in ('queued','sending')`,
        [campaignId]
      );
    }

    let processed = 0;
    let sent = 0;
    let failed = 0;
    let stoppedEarly = false;

    for (const job of jobs) {
      if (Date.now() - startedAt > maxRunMs) {
        stoppedEarly = true;
        break;
      }

      processed += 1;
      const recipientEmail = normalizeEmail(job.email);

      // Respect global unsubscribes
      const [unsub] = await dbQuery<any>(
        `select email from messaging_unsubscribes where email = $1`,
        [recipientEmail]
      );
      if (unsub?.email) {
        await dbQuery(
          `update messaging_send_jobs
           set status = 'skipped_unsubscribed',
               attempts = attempts + 1,
               last_error = 'Unsubscribed'
           where id = $1`,
          [job.job_id]
        );
        continue;
      }

      // One-click unsubscribe token (stable per email)
      const [existingToken] = await dbQuery<any>(
        `select token from messaging_unsubscribe_tokens where email = $1`,
        [recipientEmail]
      );

      let token = existingToken?.token;
      if (!token) {
        token = generateUnsubscribeToken();
        await dbQuery(
          `insert into messaging_unsubscribe_tokens (email, token) values ($1,$2)
           on conflict (email) do nothing`,
          [recipientEmail, token]
        );
      }

      const baseUrl = process.env['PUBLIC_APP_BASE_URL'] || 'https://halqa.online';
      const unsubscribeUrl = `${baseUrl.replace(/\/$/, '')}/unsubscribe?token=${encodeURIComponent(token)}`;

      const personalized = renderTemplate(job.html_body, {
        first_name: job.first_name || process.env['MESSAGING_DEFAULT_FIRST_NAME'] || 'there',
        email: recipientEmail,
        role: job.role ? String(job.role) : '',
      });

      const html = `${personalized}${buildFooterHtml(unsubscribeUrl)}`;

      try {
        const result = await sendViaSendGrid({
          to: recipientEmail,
          subject: job.subject,
          html,
          unsubscribeUrl,
          customArgs: {
            campaign_id: String(job.campaign_id),
            recipient_id: String(job.recipient_id),
            job_id: String(job.job_id),
          },
        });

        await dbQuery(
          `update messaging_send_jobs
           set status = 'sent',
               attempts = attempts + 1,
               sendgrid_message_id = $2,
               sent_at = now(),
               last_error = null
           where id = $1`,
          [job.job_id, result.messageId]
        );

        sent += 1;
      } catch (e: any) {
        await dbQuery(
          `update messaging_send_jobs
           set status = 'failed',
               attempts = attempts + 1,
               last_error = $2
           where id = $1`,
          [job.job_id, e?.message || 'Send failed']
        );
        failed += 1;
      }
    }

    // Update campaign status for any campaigns touched
    for (const campaignId of campaignIds) {
      const [{ remaining }] = await dbQuery<{ remaining: number }>(
        `select count(*)::int as remaining
         from messaging_send_jobs
         where campaign_id = $1 and status = 'queued'`,
        [campaignId]
      );
      if ((remaining || 0) === 0) {
        await dbQuery(
          `update messaging_campaigns set status = 'completed'
           where id = $1`,
          [campaignId]
        );
      }
    }

    // Status sweep: if a campaign is still marked queued/sending but has no queued jobs,
    // mark it completed (covers old campaigns that were already sent earlier).
    await dbQuery(
      `update messaging_campaigns c
       set status = 'completed'
       where c.status in ('queued','sending')
         and not exists (
           select 1 from messaging_send_jobs j
           where j.campaign_id = c.id and j.status = 'queued'
         )`,
      []
    );

    return sendJson(res, 200, {
      processed,
      sent,
      failed,
      stoppedEarly,
      maxRunMs,
      maxJobs: take,
    });
  } catch (e: any) {
    console.error(e);

    const msg = String(e?.message || 'Bad Request');
    if (msg.includes('Missing Authorization header') || msg.includes('Unauthorized')) {
      return sendJson(res, 401, { message: msg });
    }

    return sendJson(res, 400, { message: msg });
  }
}
