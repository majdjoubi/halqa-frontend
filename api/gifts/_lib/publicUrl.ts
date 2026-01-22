import type { VercelRequest } from '@vercel/node';

export function getPublicBaseUrl(req: VercelRequest): string {
  const env = (process.env['HALQA_PUBLIC_BASE_URL'] || '').trim();
  if (env) return env.replace(/\/+$/, '');

  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').trim();
  if (!host) return 'https://halqa.online';
  return `${proto}://${host}`;
}

export function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
