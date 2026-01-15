import crypto from 'crypto';

export const FROM_EMAIL = 'info@halqa.online';
export const REPLY_TO_EMAIL = 'info@halqa.online';

export function getDomainAgeDays(): number | null {
  const createdAt = process.env['HALQA_DOMAIN_CREATED_AT'];
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function dailyDomainLimit(): number {
  const age = getDomainAgeDays();
  if (age !== null && age < 30) return 50;
  return 500;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function scanContentOrThrow(subject: string, htmlBody: string): void {
  if (!subject?.trim()) throw new Error('Subject is required');
  if (!htmlBody?.trim()) throw new Error('HTML body is required');

  const hasImage = /<img\b/i.test(htmlBody);
  const textOnly = htmlBody
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim();

  if (hasImage && textOnly.length < 20) {
    throw new Error('Image-only emails are blocked. Add meaningful text content.');
  }

  const shorteners = [
    'bit.ly',
    't.co',
    'tinyurl.com',
    'goo.gl',
    'ow.ly',
    'is.gd',
    'buff.ly',
    'cutt.ly',
    'rebrand.ly',
  ];
  const lower = htmlBody.toLowerCase();
  if (shorteners.some((d) => lower.includes(d))) {
    throw new Error('URL shorteners are blocked. Use full URLs.');
  }

  const spamPhrases = [
    'act now',
    'free money',
    'guaranteed',
    'urgent',
    'click here',
    'limited time',
    'risk-free',
    'winner',
    'congratulations you have won',
  ];
  if (spamPhrases.some((p) => lower.includes(p))) {
    throw new Error('Contains spam-like phrases. Please rewrite.');
  }
}

export function generateUnsubscribeToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function buildFooterHtml(unsubscribeUrl: string): string {
  const address = process.env['HALQA_PHYSICAL_ADDRESS'];
  if (!address) {
    throw new Error('HALQA_PHYSICAL_ADDRESS is required');
  }

  return `\n<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/>\n<div style="font-size:12px;color:#6b7280;line-height:1.4">\n  <div><strong>Halqa</strong></div>\n  <div><a href="${escapeHtmlAttr(unsubscribeUrl)}" target="_blank" rel="noopener">Unsubscribe</a></div>\n  <div>${escapeHtml(address)}</div>\n</div>`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
}

export function renderTemplate(html: string, vars: { first_name: string; email: string; role: string }): string {
  return html
    .replaceAll('{{first_name}}', escapeHtml(vars.first_name))
    .replaceAll('{{email}}', escapeHtml(vars.email))
    .replaceAll('{{role}}', escapeHtml(vars.role));
}
