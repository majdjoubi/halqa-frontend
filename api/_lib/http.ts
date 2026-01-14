import type { VercelRequest, VercelResponse } from '@vercel/node';

export function sendJson(res: VercelResponse, status: number, body: any): void {
  res.status(status).setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

export async function readJson<T>(req: VercelRequest): Promise<T> {
  if (typeof req.body === 'object' && req.body !== null) return req.body as T;

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

export function requireMethod(req: VercelRequest, res: VercelResponse, method: string): boolean {
  if (req.method !== method) {
    sendJson(res, 405, { message: `Method ${req.method} not allowed` });
    return false;
  }
  return true;
}
