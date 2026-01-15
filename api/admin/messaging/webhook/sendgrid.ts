import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as crypto from 'crypto';
import { dbQuery } from '../../../_lib/db';
import { readJson, sendJson } from '../../../_lib/http';

function verifyIfConfigured(req: VercelRequest, rawBody: string): void {
  const publicKeyPem = process.env['SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY_PEM'];
  if (!publicKeyPem) {
    // In production, set SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY to enforce verification.
    return;
  }

  const signature = req.headers['x-twilio-email-event-webhook-signature'];
  const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'];
  if (!signature || !timestamp) {
    throw new Error('Missing SendGrid webhook signature headers');
  }

  const message = `${timestamp}${rawBody}`;
  const sig = Buffer.from(String(signature), 'base64');

  const ok = crypto.verify(null, Buffer.from(message, 'utf8'), publicKeyPem, sig);
  if (!ok) throw new Error('Invalid webhook signature');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { message: `Method ${req.method} not allowed` });
    }

    // Read raw body for signature verification
    let raw = '';
    if (typeof req.body === 'string') raw = req.body;
    else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');

    // If body was already parsed as object by Vercel, we cannot reconstruct raw perfectly.
    // We still accept, but signature verification will be skipped.
    if (raw) verifyIfConfigured(req, raw);

    const events = await readJson<any[]>(req);
    if (!Array.isArray(events)) return sendJson(res, 400, { message: 'Expected an array of events' });

    for (const ev of events) {
      const campaignId = ev?.campaign_id || ev?.custom_args?.campaign_id || null;
      const email = ev?.email || ev?.recipient_email || null;
      const eventType = ev?.event || ev?.event_type;
      const sgMessageId = ev?.sg_message_id || null;
      const ts = ev?.timestamp ? new Date(ev.timestamp * 1000).toISOString() : null;

      if (!eventType) continue;

      await dbQuery(
        `insert into messaging_send_events (campaign_id, recipient_email, event_type, occurred_at, sg_message_id, payload)
         values ($1,$2,$3,$4,$5,$6)`,
        [campaignId, email, String(eventType), ts, sgMessageId, ev]
      );
    }

    return sendJson(res, 200, { ok: true });
  } catch (e: any) {
    console.error(e);
    return sendJson(res, 400, { message: e?.message || 'Bad Request' });
  }
}
