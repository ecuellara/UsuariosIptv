// =============================================================================
// run.mjs · validador SQL de IPTV Manager sobre PGlite
// -----------------------------------------------------------------------------
// Qué hace, en este orden y por cada prueba:
//   1. arranca una base PGlite nueva (en memoria)
//   2. aplica el stub de Supabase (roles + auth.uid)
//   3. aplica TODAS las migraciones en orden lexicográfico
//   4. aplica supabase/seed.sql
//   5. aplica las fixtures de administrador
//   6. ejecuta un archivo de supabase/tests/*.sql
//
// Base nueva por prueba = las pruebas no comparten estado y, de paso, el DDL se
// aplica desde cero N veces.
//
// Exit code 0 solo si todas las pruebas pasan.
// =============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..', '..');
const SUPABASE = join(ROOT, 'supabase');
const HARNESS = join(HERE, 'harness');

const rel = (p) => relative(ROOT, p).split(sep).join('/');

function listSql(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(dir, f));
}

const read = (p) => readFileSync(p, 'utf8');

async function applyFile(db, path) {
  try {
    await db.exec(read(path));
  } catch (err) {
    const error = new Error(`${rel(path)}: ${err.message}`);
    error.cause = err;
    throw error;
  }
}

async function main() {
  const migrations = listSql(join(SUPABASE, 'migrations'));
  const tests = listSql(join(SUPABASE, 'tests'));

  if (migrations.length === 0) throw new Error('No hay migraciones en supabase/migrations.');
  if (tests.length === 0) throw new Error('No hay pruebas en supabase/tests.');

  // Base "plantilla": se usa una vez para reportar la versión del motor y
  // comprobar que el DDL + seed aplican en limpio.
  const probe = new PGlite();
  const version = (await probe.query('select version() as v')).rows[0].v;
  await applyFile(probe, join(HARNESS, 'stub.sql'));
  for (const m of migrations) await applyFile(probe, m);
  await applyFile(probe, join(SUPABASE, 'seed.sql'));
  await applyFile(probe, join(HARNESS, 'fixtures.sql'));
  const counts = (
    await probe.query(`
      select
        (select count(*) from public.plans) as planes,
        (select count(*) from public.whatsapp_templates) as plantillas,
        (select count(*) from public.app_settings) as settings,
        (select count(*) from public.token_stock) as stock
    `)
  ).rows[0];
  await probe.close();

  console.log('=========================================================');
  console.log(' IPTV Manager · SQL check (PGlite, sin Docker)');
  console.log('=========================================================');
  console.log(`Motor            : ${version.split(' on ')[0]}`);
  console.log(`Migraciones      : ${migrations.length} archivo(s)`);
  console.log(`Pruebas          : ${tests.length} archivo(s)`);
  console.log(
    `Seed             : planes=${counts.planes} plantillas=${counts.plantillas} ` +
      `app_settings=${counts.settings} token_stock=${counts.stock}`,
  );
  console.log('---------------------------------------------------------');

  let failed = 0;

  for (const test of tests) {
    const db = new PGlite();
    const name = rel(test);
    const started = Date.now();
    try {
      await applyFile(db, join(HARNESS, 'stub.sql'));
      for (const m of migrations) await applyFile(db, m);
      await applyFile(db, join(SUPABASE, 'seed.sql'));
      await applyFile(db, join(HARNESS, 'fixtures.sql'));
      await applyFile(db, test);
      console.log(`[PASS] ${name}  (${Date.now() - started} ms)`);
    } catch (err) {
      failed += 1;
      console.log(`[FAIL] ${name}  (${Date.now() - started} ms)`);
      console.log(`       ${String(err.message).replace(/\n/g, '\n       ')}`);
    } finally {
      await db.close();
    }
  }

  console.log('---------------------------------------------------------');
  console.log(
    failed === 0
      ? `RESULTADO: ${tests.length}/${tests.length} pruebas OK`
      : `RESULTADO: ${tests.length - failed}/${tests.length} pruebas OK · ${failed} FALLIDA(S)`,
  );
  console.log('=========================================================');

  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('ERROR FATAL:', err.message);
  process.exitCode = 1;
});
