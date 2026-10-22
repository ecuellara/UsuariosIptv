import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..', '..');
const db = new PGlite();

await db.exec(readFileSync(join(HERE, 'harness', 'stub.sql'), 'utf8'));
for (const f of readdirSync(join(ROOT, 'supabase', 'migrations')).sort()) {
  await db.exec(readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8'));
}
await db.exec(readFileSync(join(ROOT, 'supabase', 'seed.sql'), 'utf8'));

const q = async (label, sql) => {
  const r = await db.query(sql);
  console.log('\n### ' + label);
  for (const row of r.rows) console.log(Object.values(row).join(' | '));
};

await q('v_account_status', `
  select ordinal_position::text || ' · ' || column_name || ' · ' || data_type
  from information_schema.columns
  where table_name = 'v_account_status' order by ordinal_position`);

await q('v_cash_movements', `
  select ordinal_position::text || ' · ' || column_name || ' · ' || data_type
  from information_schema.columns
  where table_name = 'v_cash_movements' order by ordinal_position`);

await q('v_renewal_summary', `
  select ordinal_position::text || ' · ' || column_name || ' · ' || data_type
  from information_schema.columns
  where table_name = 'v_renewal_summary' order by ordinal_position`);

await q('rpc signatures', `
  select p.proname || '(' || pg_get_function_arguments(p.oid) || ') -> ' || pg_get_function_result(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'rpc_%' order by p.proname`);

await q('tablas + rls + grants', `
  select c.relname || ' · rls=' || c.relrowsecurity::text || ' · auth=' ||
    concat_ws(',', case when has_table_privilege('authenticated', c.oid, 'SELECT') then 'S' end,
                   case when has_table_privilege('authenticated', c.oid, 'INSERT') then 'I' end,
                   case when has_table_privilege('authenticated', c.oid, 'UPDATE') then 'U' end,
                   case when has_table_privilege('authenticated', c.oid, 'DELETE') then 'D' end)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','v') order by c.relname`);

await db.close();
