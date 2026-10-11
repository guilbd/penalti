// Roda os testes do banco (tests/db/*.sql). Cada arquivo é um bloco que termina com RAISE 'TESTS_PASSED: ...',
// o que desfaz tudo o que o teste criou; qualquer outra mensagem é falha.
// Uso: SUPABASE_DB_URL="postgresql://..." node tests/db/run.mjs   (precisa de: npm install pg)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const url = process.env.SUPABASE_DB_URL;
if (!url) { console.log('SUPABASE_DB_URL não definido: testes do banco pulados.'); process.exit(0); }
const dir = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
let fail = 0;
for (const f of files) {
  try {
    await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    console.log(`✗ ${f}: terminou sem TESTS_PASSED`); fail++;
  } catch (e) {
    if (/^TESTS_PASSED/.test(e.message)) console.log(`✓ ${f}`);
    else { console.log(`✗ ${f}: ${e.message}`); fail++; }
  }
}
await client.end();
console.log(fail ? `${fail} arquivo(s) com falha` : `${files.length} arquivo(s) ok`);
process.exit(fail ? 1 : 0);
