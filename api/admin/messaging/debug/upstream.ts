import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendJson } from '../../../_lib/http';

function getBackendBaseUrl(): string {
  const raw = process.env['HALQA_BACKEND_BASE_URL'] || 'https://halqa-api-k60w.onrender.com';
  return raw.replace(/\/+$/, '');
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  // Intentionally does NOT require admin auth.
  // Helps diagnose whether Vercel can reach the upstream Render backend.
  const base = getBackendBaseUrl();
  const url = `${base}/api/health`;

  const start = Date.now();
  try {
    const resp = await fetch(url, { method: 'GET', headers: { accept: 'application/json' } });
    const elapsedMs = Date.now() - start;
    return sendJson(res, 200, {
      ok: resp.ok,
      backendBaseUrl: base,
      status: resp.status,
      elapsedMs,
    });
  } catch (e: any) {
    const elapsedMs = Date.now() - start;
    return sendJson(res, 200, {
      ok: false,
      backendBaseUrl: base,
      elapsedMs,
      error: String(e?.message || e),
    });
  }
}
