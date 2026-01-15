import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dbQuery } from '../../../_lib/db';
import { requireAdmin } from '../../../_lib/adminAuth';
import { sendJson } from '../../../_lib/http';

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await dbQuery<{ exists: boolean }>(
    `select exists(
       select 1
       from information_schema.tables
       where table_schema = 'public'
         and table_name = $1
     ) as exists`,
    [tableName]
  );
  return !!rows?.[0]?.exists;
}

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const rows = await dbQuery<{ exists: boolean }>(
    `select exists(
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = $1
         and column_name = $2
     ) as exists`,
    [tableName, columnName]
  );
  return !!rows?.[0]?.exists;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Require admin so we don't expose infra info publicly.
    await requireAdmin(req);

    const hasDatabaseUrl = !!process.env['DATABASE_URL'];

    // DB connectivity test
    const [{ now }] = await dbQuery<{ now: string }>('select now()::text as now', []);

    // Schema checks
    const schema = {
      messaging_campaigns: await tableExists('messaging_campaigns'),
      messaging_recipients: await tableExists('messaging_recipients'),
      messaging_send_jobs: await tableExists('messaging_send_jobs'),
      messaging_send_events: await tableExists('messaging_send_events'),
      messaging_unsubscribe_tokens: await tableExists('messaging_unsubscribe_tokens'),
      messaging_unsubscribes: await tableExists('messaging_unsubscribes'),
    };

    // Columns used by campaigns.ts insert
    const campaignColumns = schema.messaging_campaigns
      ? {
          from_email: await columnExists('messaging_campaigns', 'from_email'),
          reply_to_email: await columnExists('messaging_campaigns', 'reply_to_email'),
          created_by_email: await columnExists('messaging_campaigns', 'created_by_email'),
          scheduled_at: await columnExists('messaging_campaigns', 'scheduled_at'),
        }
      : null;

    return sendJson(res, 200, {
      ok: true,
      time: new Date().toISOString(),
      db: {
        hasDatabaseUrl,
        now,
      },
      schema,
      campaignColumns,
      hint:
        'If schema or columns are missing, apply db/migrations/001_admin_messaging.sql to your DATABASE_URL database.',
    });
  } catch (e: any) {
    const msg = String(e?.message || 'Unknown error');

    // keep it safe but actionable
    if (msg.includes('Missing Authorization header') || msg.includes('Unauthorized')) {
      return sendJson(res, 401, { message: msg });
    }
    if (msg.includes('DATABASE_URL is required')) {
      return sendJson(res, 500, { message: 'Server not configured: DATABASE_URL is missing' });
    }

    return sendJson(res, 500, { message: msg });
  }
}
