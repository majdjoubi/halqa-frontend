import crypto from 'node:crypto';

export function generateGiftCode(): string {
  // 18 bytes -> 24 chars base64url-ish; prefix for UX.
  const buf = crypto.randomBytes(18);
  const code = buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `GFT_${code}`;
}
