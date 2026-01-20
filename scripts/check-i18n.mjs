import fs from 'node:fs/promises';
import path from 'node:path';

const workspaceRoot = path.resolve(process.cwd());
const i18nDir = path.join(workspaceRoot, 'src', 'assets', 'i18n');

const locales = ['en', 'ar', 'de', 'tr', 'fr'];

function flatten(obj, prefix = '') {
  const out = new Map();
  for (const [key, value] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of flatten(value, next)) out.set(k, v);
    } else {
      out.set(next, value);
    }
  }
  return out;
}

function extractPlaceholders(str) {
  if (typeof str !== 'string') return [];
  const matches = [...str.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)];
  return matches.map((m) => m[1]).sort();
}

function eqArray(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function readJson(locale) {
  const file = path.join(i18nDir, `${locale}.json`);
  const raw = await fs.readFile(file, 'utf8');
  return { file, json: JSON.parse(raw) };
}

const results = [];
let hasErrors = false;

const baseLocale = 'en';
const base = await readJson(baseLocale);
const baseFlat = flatten(base.json);

for (const locale of locales) {
  try {
    const { file, json } = await readJson(locale);
    const flat = flatten(json);

    const missingKeys = [];
    const extraKeys = [];
    const placeholderMismatches = [];

    for (const key of baseFlat.keys()) {
      if (!flat.has(key)) missingKeys.push(key);
    }
    for (const key of flat.keys()) {
      if (!baseFlat.has(key)) extraKeys.push(key);
    }

    for (const [key, baseValue] of baseFlat.entries()) {
      if (!flat.has(key)) continue;
      const basePlaceholders = extractPlaceholders(baseValue);
      const localePlaceholders = extractPlaceholders(flat.get(key));
      if (!eqArray(basePlaceholders, localePlaceholders)) {
        placeholderMismatches.push({ key, basePlaceholders, localePlaceholders });
      }
    }

    const summary = {
      locale,
      file: path.relative(workspaceRoot, file),
      missing: missingKeys.length,
      extra: extraKeys.length,
      placeholderMismatches: placeholderMismatches.length,
    };

    results.push(summary);

    if (missingKeys.length || extraKeys.length || placeholderMismatches.length) {
      hasErrors = true;
      console.error(`\n[${locale}] ${summary.file}`);
      if (missingKeys.length) {
        console.error(`  Missing keys (${missingKeys.length}):`);
        console.error(missingKeys.slice(0, 50).map((k) => `   - ${k}`).join('\n'));
        if (missingKeys.length > 50) console.error('   ...');
      }
      if (extraKeys.length) {
        console.error(`  Extra keys (${extraKeys.length}):`);
        console.error(extraKeys.slice(0, 50).map((k) => `   - ${k}`).join('\n'));
        if (extraKeys.length > 50) console.error('   ...');
      }
      if (placeholderMismatches.length) {
        console.error(`  Placeholder mismatches (${placeholderMismatches.length}):`);
        for (const m of placeholderMismatches.slice(0, 30)) {
          console.error(`   - ${m.key}: base=${JSON.stringify(m.basePlaceholders)} locale=${JSON.stringify(m.localePlaceholders)}`);
        }
        if (placeholderMismatches.length > 30) console.error('   ...');
      }
    }
  } catch (e) {
    hasErrors = true;
    console.error(`\n[${locale}] Failed to read/parse:`, e?.message ?? e);
  }
}

console.log('\nSummary:');
for (const r of results) {
  console.log(
    `${r.locale.padEnd(3)} missing=${String(r.missing).padStart(4)} extra=${String(r.extra).padStart(4)} placeholders=${String(r.placeholderMismatches).padStart(4)}  ${r.file}`
  );
}

if (hasErrors) process.exit(1);
