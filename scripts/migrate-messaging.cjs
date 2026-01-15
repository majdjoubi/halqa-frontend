/*
  Run the Admin Messaging PostgreSQL schema migration.

  Usage:
    node scripts/migrate-messaging.cjs --env .env.production.local

  Notes:
    - Does NOT print DATABASE_URL.
    - Safe to re-run: migration uses IF NOT EXISTS.
*/

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function parseArgs(argv) {
  const out = { envFile: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--env') {
      out.envFile = argv[i + 1];
      i++;
    }
  }
  return out;
}

function parseEnvFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function splitSqlStatements(sql) {
  // Naive splitter is OK for this migration file (no semicolons inside strings).
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'));
}

async function main() {
  const { envFile } = parseArgs(process.argv);
  if (envFile) {
    const resolved = path.resolve(process.cwd(), envFile);
    if (!fs.existsSync(resolved)) {
      console.error(`Env file not found: ${resolved}`);
      process.exit(1);
    }
    parseEnvFile(resolved);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set. Provide --env or export DATABASE_URL.');
    process.exit(1);
  }

  const sqlPath = path.resolve(process.cwd(), 'db', 'migrations', '001_admin_messaging.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error(`Migration file not found: ${sqlPath}`);
    process.exit(1);
  }

  const sqlText = fs.readFileSync(sqlPath, 'utf8');
  const statements = splitSqlStatements(sqlText);
  if (statements.length === 0) {
    console.error('No SQL statements found in migration file.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });

  await client.connect();
  try {
    await client.query('begin');
    for (const st of statements) {
      await client.query(st);
    }
    await client.query('commit');

    const tables = [
      'messaging_campaigns',
      'messaging_recipients',
      'messaging_send_jobs',
      'messaging_send_events',
      'messaging_unsubscribe_tokens',
      'messaging_unsubscribes',
    ];

    const { rows } = await client.query(
      `select table_name
       from information_schema.tables
       where table_schema='public'
         and table_name = any($1::text[])
       order by table_name`,
      [tables]
    );

    console.log(`Migration applied. Found ${rows.length}/${tables.length} tables.`);
    if (rows.length !== tables.length) {
      console.log('Missing tables:', tables.filter((t) => !rows.some((r) => r.table_name === t)));
      process.exitCode = 2;
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('Migration failed:', e && e.message ? e.message : e);
  process.exit(1);
});
