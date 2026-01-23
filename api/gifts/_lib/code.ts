import crypto from 'node:crypto';

export function generateGiftCode(): string {
  // Short, human-friendly code.
  // Requirement: include "HALQA" and be <= 10 chars total.
  // We generate: HALQA + 5 chars from a non-ambiguous alphabet.
  const prefix = 'HALQA';
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(5);
  let suffix = '';
  for (let i = 0; i < 5; i++) {
    suffix += alphabet[bytes[i] % alphabet.length];
  }
  return `${prefix}${suffix}`;
}

/**
 * Normalize user input for gift codes.
 * Important: legacy codes (e.g. GFT_...) are case-sensitive and may contain '-'/'_'.
 * Only normalize the new short HALQAxxxxx format.
 */
export function normalizeGiftCodeInput(input: unknown): string {
  const s = String(input || '').trim();
  if (/^halqa[a-z0-9]{5}$/i.test(s)) return s.toUpperCase();
  return s;
}
