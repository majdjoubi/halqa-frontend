import type { VercelRequest } from '@vercel/node';

const BACKEND_BASE = 'https://halqa-api-k60w.onrender.com';

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function requireAdmin(req: VercelRequest): Promise<{ email?: string }>{
  const auth = req.headers.authorization;
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    throw new Error('Missing Authorization header');
  }

  // Validate token + admin role by calling an admin-only endpoint on the existing backend.
  const resp = await fetchWithTimeout(
    `${BACKEND_BASE}/api/admin/statistics/quick`,
    {
      method: 'GET',
      headers: {
        authorization: auth,
        accept: 'application/json',
      },
    },
    8000
  );

  if (!resp.ok) {
    throw new Error('Unauthorized (admin required)');
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
  const resp = await fetchWithTimeout(
    `${BACKEND_BASE}/api/admin/users`,
    {
      method: 'GET',
      headers: {
        authorization: auth || '',
        accept: 'application/json',
      },
    },
    15000
  );

  if (!resp.ok) {
    throw new Error('Failed to fetch users from backend');
  }

  return (await resp.json()) as any[];
}
