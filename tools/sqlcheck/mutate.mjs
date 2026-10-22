// =============================================================================
// mutate.mjs · verifica que las pruebas detectan regresiones de verdad
// -----------------------------------------------------------------------------
// Una prueba que pasa con el código correcto y también con el código roto no
// prueba nada. Este script rompe a propósito una regla del SQL, corre la batería
// y exige que la prueba correspondiente FALLE; después restaura el archivo.
//
// Uso: node mutate.mjs
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..', '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const TESTS = join(ROOT, 'supabase', 'tests');

const MUTACIONES = [
  {
    nombre: 'sin validación de stock',
    archivo: '20261021090600_rpc.sql',
    buscar: 'if v_stock.quantity < p_tokens_used then',
    reemplazar: 'if false then',
    debeFallar: 't02_stock_insuficiente.sql',
  },
  {
    nombre: 'umbral urgente en cero',
    archivo: '20261021090300_functions_triggers.sql',
    buscar: 'when d.days_left <= coalesce(s.urgent_days, 3) then',
    reemplazar: 'when d.days_left <= 0 then',
    debeFallar: 't05_account_status.sql',
  },
  {
    nombre: 'suma de meses en UTC en vez de hora de Lima',
    archivo: '20261021090300_functions_triggers.sql',
    buscar:
      "select ((p_ts at time zone 'America/Lima') + make_interval(months => p_months))\n         at time zone 'America/Lima';",
    reemplazar: 'select p_ts + make_interval(months => p_months);',
    debeFallar: 't06_suma_meses.sql',
  },
  {
    nombre: 'GRANT de escritura en renewals',
    archivo: '20261021090500_rls_grants.sql',
    buscar: 'grant insert, update on public.customers     to authenticated;',
    reemplazar:
      'grant insert, update on public.customers     to authenticated;\ngrant insert on public.renewals to authenticated;',
    debeFallar: 't08_escritura_denegada.sql',
  },
  {
    nombre: 'reversión al promedio actual en vez del costo congelado',
    archivo: '20261021090600_rpc.sql',
    buscar: '      \'REVERSION\', v_tokens, coalesce(v_unit, 0), v_cost,',
    reemplazar: '      \'REVERSION\', v_tokens, v_stock.avg_unit_cost, v_cost,',
    debeFallar: 't03_reversion.sql',
  },
  {
    nombre: 'sin tope de pago contra amount_agreed',
    archivo: '20261021090600_rpc.sql',
    buscar: 'if v_paid + p_amount > v_renewal.amount_agreed then',
    reemplazar: 'if false then',
    debeFallar: 't04_pago_excede_acordado.sql',
  },
  {
    nombre: 'compra de tokens duplicada como gasto',
    archivo: '20261021090600_rpc.sql',
    buscar: "  update public.token_stock\n     set quantity = v_qty,",
    reemplazar:
      "  insert into public.expenses (category, amount, spent_at, description)\n" +
      "  values ('OPERATIVO', p_total_cost, p_purchased_at, 'compra de tokens');\n\n" +
      "  update public.token_stock\n     set quantity = v_qty,",
    debeFallar: 't07_cash_movements.sql',
  },
  {
    nombre: 'renewals.idempotency_key sin restricción unique',
    archivo: '20261021090200_ledger_tables.sql',
    buscar: '  idempotency_key    uuid not null unique,',
    reemplazar: '  idempotency_key    uuid not null,',
    debeFallar: 't01_idempotencia_renovacion.sql',
  },
];

const run = () => {
  const r = spawnSync(process.execPath, [join(HERE, 'run.mjs')], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

console.log('== mutaciones: cada regla rota debe romper su prueba ==');
let fallos = 0;

for (const m of MUTACIONES) {
  const path = join(MIGRATIONS, m.archivo);
  const original = readFileSync(path, 'utf8');

  if (!original.includes(m.buscar)) {
    console.log(`[ERROR] no se encontró el fragmento a mutar en ${m.archivo}`);
    fallos += 1;
    continue;
  }

  writeFileSync(path, original.replace(m.buscar, m.reemplazar), 'utf8');
  try {
    const { code, out } = run();
    const linea = out
      .split('\n')
      .find((l) => l.includes(m.debeFallar) && l.startsWith('[FAIL]'));
    const ok = code !== 0 && Boolean(linea);
    console.log(
      ok
        ? `[OK]    ${m.nombre} -> ${m.debeFallar} falla como debe`
        : `[GRAVE] ${m.nombre} -> la prueba NO detectó la regresión`,
    );
    if (!ok) fallos += 1;
  } finally {
    writeFileSync(path, original, 'utf8');
  }
}

console.log(
  fallos === 0
    ? 'RESULTADO: todas las mutaciones fueron detectadas'
    : `RESULTADO: ${fallos} mutación(es) NO detectada(s)`,
);
process.exitCode = fallos === 0 ? 0 : 1;
