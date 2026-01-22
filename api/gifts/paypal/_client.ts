function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function paypalBaseUrl(): string {
  const env = String(process.env['PAYPAL_ENV'] || process.env['PAYPAL_MODE'] || 'live').toLowerCase();
  return env === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
}

let cachedToken: { accessToken: string; expiresAtMs: number } | null = null;

export async function getPayPalAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs - now > 60_000) {
    return cachedToken.accessToken;
  }

  const clientId = requireEnv('PAYPAL_CLIENT_ID');
  const secret = requireEnv('PAYPAL_CLIENT_SECRET');

  const basic = Buffer.from(`${clientId}:${secret}`, 'utf8').toString('base64');

  const resp = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    throw new Error(data?.error_description || `PayPal token error ${resp.status}`);
  }

  const accessToken = String(data?.access_token || '');
  const expiresIn = Number(data?.expires_in || 0);
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('Invalid PayPal token response');
  }

  cachedToken = { accessToken, expiresAtMs: now + expiresIn * 1000 };
  return accessToken;
}

export async function paypalApi(path: string, init: RequestInit): Promise<any> {
  const token = await getPayPalAccessToken();
  const resp = await fetch(`${paypalBaseUrl()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
      ...(init.headers || {}),
    },
  });

  const text = await resp.text().catch(() => '');
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!resp.ok) {
    const msg = data?.message || data?.error_description || text || `PayPal error ${resp.status}`;
    throw new Error(msg);
  }

  return data;
}
