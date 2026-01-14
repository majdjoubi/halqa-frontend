import { FROM_EMAIL, REPLY_TO_EMAIL } from './validation';

export async function sendViaSendGrid(options: {
  to: string;
  subject: string;
  html: string;
  unsubscribeUrl: string;
  customArgs: Record<string, string>;
}): Promise<{ messageId: string | null }>{
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error('SENDGRID_API_KEY is required');

  const listUnsubscribe = `<${options.unsubscribeUrl}>`;

  const payload = {
    personalizations: [
      {
        to: [{ email: options.to }],
      },
    ],
    from: { email: FROM_EMAIL },
    reply_to: { email: REPLY_TO_EMAIL },
    subject: options.subject,
    content: [{ type: 'text/html', value: options.html }],
    headers: {
      'List-Unsubscribe': listUnsubscribe,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    custom_args: options.customArgs,
    // tracking_settings: can be configured in SendGrid UI; webhook provides events.
  };

  const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`SendGrid send failed: ${resp.status} ${text}`);
  }

  const messageId = resp.headers.get('x-message-id') || resp.headers.get('x-messageid');
  return { messageId };
}
