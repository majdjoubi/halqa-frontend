import { Pool } from 'pg';

let pool: Pool | null = null;

function shouldUseSsl(connectionString: string): boolean {
  // Many managed Postgres providers require TLS.
  // Prefer explicit signal via URL params/env, otherwise enable for non-local hosts.
  const envMode = process.env['PGSSLMODE'];
  if (envMode && envMode.toLowerCase() === 'disable') return false;

  try {
    const u = new URL(connectionString);
    const sslmode = (u.searchParams.get('sslmode') || '').toLowerCase();
    if (sslmode) return sslmode !== 'disable';
    const host = (u.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return false;
    return true;
  } catch {
    // If parsing fails, fall back to enabling SSL.
    return true;
  }
}

export function getDbPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const useSsl = shouldUseSsl(connectionString);

  pool = new Pool({
    connectionString,
    ...(useSsl
      ? {
          ssl: {
            rejectUnauthorized: false,
          },
        }
      : {}),
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  return pool;
}

export async function dbQuery<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const p = getDbPool();
  const result = await p.query(text, params);
  return result.rows as T[];
}
