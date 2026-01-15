import type { VercelRequest } from '@vercel/node';

function getBackendBaseUrl(): string {
  const raw = process.env['HALQA_BACKEND_BASE_URL'] || 'https://halqa-api-k60w.onrender.com';
  return raw.replace(/\/+$/, '');
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function isRetriableFetchError(err: unknown): boolean {
  const anyErr = err as any;
  const name = String(anyErr?.name || '');
  const msg = String(anyErr?.message || '');
  return (
    name === 'AbortError' ||
    msg.includes('fetch failed') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('socket hang up')
  );
}

async function fetchWithRetries(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  attempts: number
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchWithTimeout(input, init, timeoutMs);
    } catch (e) {
      lastErr = e;
      if (i === attempts - 1 || !isRetriableFetchError(e)) throw e;
      // Small backoff to give upstream time to cold-start.
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function requireAdmin(req: VercelRequest): Promise<{ email?: string }>{
  const auth = req.headers.authorization;
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    throw new Error('Missing Authorization header');
  }

  // Validate token + admin role by calling an admin-only endpoint on the existing backend.
  const resp = await fetchWithRetries(
    `${getBackendBaseUrl()}/api/admin/statistics/quick`,
    {
      method: 'GET',
      headers: {
        authorization: auth,
        accept: 'application/json',
      },
    },
    25000,
    2
  );

  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Unauthorized (admin required)');
    }
    throw new Error(`Upstream backend error (auth check): ${resp.status}`);
  }

  // Best-effort extraction of admin email from JWT payload (optional)
  try {
    const token = auth.split(' ')[1];
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    const email = payload?.email;
    return { email: typeof email === 'string' ? email : undefined };
  } catch {
    return {};
  }
}

export async function fetchAdminUsers(req: VercelRequest): Promise<any[]> {
  const auth = req.headers.authorization;
  const resp = await fetchWithRetries(
    `${getBackendBaseUrl()}/api/admin/users`,
    {
      method: 'GET',
      headers: {
        authorization: auth || '',
        accept: 'application/json',
      },
    },
    25000,
    2
  );

  if (!resp.ok) {
    throw new Error(`Upstream backend error (users): ${resp.status}`);
  }

  return (await resp.json()) as any[];
}
