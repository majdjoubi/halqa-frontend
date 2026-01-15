import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dbQuery } from '../../../_lib/db';
import { requireAdmin } from '../../../_lib/adminAuth';
import { sendJson } from '../../../_lib/http';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { message: `Method ${req.method} not allowed` });
    }

    await requireAdmin(req);

    const id = String(req.query['id'] || '');
    if (!id) return sendJson(res, 400, { message: 'Missing id' });

    const [campaign] = await dbQuery(
      `select * from messaging_campaigns where id = $1`,
      [id]
    );

    if (!campaign) return sendJson(res, 404, { message: 'Not found' });

    const [counts] = await dbQuery(
      `select
         sum(case when j.status = 'sent' then 1 else 0 end)::int as sent,
         sum(case when j.status = 'failed' then 1 else 0 end)::int as failed,
         sum(case when j.status = 'queued' then 1 else 0 end)::int as queued
       from messaging_send_jobs j
       where j.campaign_id = $1`,
      [id]
    );

    const [openCount] = await dbQuery(
      `select count(distinct recipient_email)::int as opens
       from messaging_send_events
       where campaign_id = $1 and event_type = 'open'`,
      [id]
    );

    const [deliveredCount] = await dbQuery(
      `select count(*)::int as delivered
       from messaging_send_events
       where campaign_id = $1 and event_type = 'delivered'`,
      [id]
    );

    const [bounceCount] = await dbQuery(
      `select count(*)::int as bounced
       from messaging_send_events
       where campaign_id = $1 and event_type = 'bounce'`,
      [id]
    );

    const [blockedCount] = await dbQuery(
      `select count(*)::int as blocked
       from messaging_send_events
       where campaign_id = $1 and event_type = 'blocked'`,
      [id]
    );

    const [spamCount] = await dbQuery(
      `select count(*)::int as spam_reports
       from messaging_send_events
       where campaign_id = $1 and event_type in ('spamreport','spam_report')`,
      [id]
    );

    return sendJson(res, 200, {
      campaign,
      counts: {
        ...counts,
        opens: openCount?.opens || 0,
        delivered: deliveredCount?.delivered || 0,
        bounced: bounceCount?.bounced || 0,
        blocked: blockedCount?.blocked || 0,
        spam_reports: spamCount?.spam_reports || 0,
      },
    });
  } catch (e: any) {
    console.error(e);
    return sendJson(res, 400, { message: e?.message || 'Bad Request' });
  }
}
