import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendJson } from '../../../_lib/http';

function getBackendBaseUrl(): string {
  const raw = process.env['HALQA_BACKEND_BASE_URL'] || 'https://halqa-api-k60w.onrender.com';
  return raw.replace(/\/+$/, '');
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Intentionally does NOT require admin auth.
  // It only reflects upstream status and timing.
  const auth = req.headers.authorization;
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    return sendJson(res, 400, { ok: false, message: 'Missing Authorization header' });
  }

  const base = getBackendBaseUrl();
  const url = `${base}/api/admin/users`;

  const start = Date.now();
  try {
    const resp = await fetchWithTimeout(
      url,
      { method: 'GET', headers: { authorization: auth, accept: 'application/json' } },
      25000
    );

    const elapsedMs = Date.now() - start;
    const text = await resp.text().catch(() => '');

    return sendJson(res, 200, {
      ok: resp.ok,
      backendBaseUrl: base,
      status: resp.status,
      elapsedMs,
      bodyPreview: text.slice(0, 500),
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
