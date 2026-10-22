# 05 — Base de datos: migraciones, pruebas y decisiones

Este documento describe **cómo se materializó** `docs/02-modelo-datos.md` en SQL, cómo se
aplica, cómo se verifica y qué quedó fuera de validación. La fuente de verdad del modelo sigue
siendo `docs/02-modelo-datos.md`; si el SQL y ese documento discrepan, el SQL está mal.

Fecha de la última ejecución verificada: **2026-10-21**. Motor de referencia del proyecto:
PostgreSQL 17 (Supabase). Motor usado para validar: **PostgreSQL 18.6 sobre PGlite 0.5.11**.

---

## 1. Archivos

```
supabase/
  config.toml                       configuración local (sin secretos, site_url placeholder)
  seed.sql                          app_settings + 5 planes + 4 plantillas + token_stock
  migrations/
    20261021090000_enums.sql        tipos enumerados (§1)
    20261021090100_core_tables.sql  profiles, app_settings, customers, iptv_accounts, plans
    20261021090200_ledger_tables.sql renewals … audit_log (libro de operaciones)
    20261021090300_functions_triggers.sql  is_admin, account_status, add_months, triggers
    20261021090400_views.sql        v_account_status, v_cash_movements, v_renewal_summary
    20261021090500_rls_grants.sql   RLS, políticas y GRANT/REVOKE (§5)
    20261021090600_rpc.sql          las 7 RPC de §4
  tests/
    t01_idempotencia_renovacion.sql
    t02_stock_insuficiente.sql
    t03_reversion.sql
    t04_pago_excede_acordado.sql
    t05_account_status.sql
    t06_suma_meses.sql
    t07_cash_movements.sql
    t08_escritura_denegada.sql
    t09_saldo_cuadra_libro.sql
tools/sqlcheck/
  run.mjs                           runner de pruebas (PGlite)
  mutate.mjs                        verifica que las pruebas detectan regresiones
  introspect.mjs                    utilidad: imprime vistas, firmas RPC y privilegios
  harness/stub.sql                  roles + auth.users + auth.uid() (solo PGlite)
  harness/fixtures.sql              administrador de pruebas (solo PGlite)
```

---

## 2. Cómo aplicar las migraciones

### 2.1 Con Supabase CLI (requiere Docker)

```bash
supabase start          # levanta Postgres + Auth + Studio en local
supabase db reset       # aplica migrations/ en orden y luego seed.sql
```

`supabase db reset` es la verificación "desde cero": borra el volumen local, corre las siete
migraciones en orden lexicográfico y después el seed.

En un proyecto remoto:

```bash
supabase link --project-ref <ref>
supabase db push        # aplica solo las migraciones pendientes
```

Reglas operativas:

- Cada archivo de migración es **inmutable** una vez aplicado en un entorno con datos.
  Cualquier cambio de modelo es una migración nueva.
- `supabase db push` aplica los archivos pendientes en orden; si uno falla, se detiene.
- Antes de aplicar en el proyecto real: backup verificado (§9).

### 2.2 Sin Docker (PGlite)

Docker está instalado pero el daemon estaba apagado, y no se inició. Por eso la validación real
se hizo con PGlite, que es PostgreSQL compilado a WebAssembly:

```bash
cd tools/sqlcheck
npm install
npm test          # node run.mjs
npm run mutate     # opcional: comprueba que las pruebas tienen dientes
```

`run.mjs` **no** es un emulador de Supabase: crea el stub de `auth`, aplica las migraciones de
verdad, el seed y las pruebas.

---

## 3. Cómo correr las pruebas

```bash
cd tools/sqlcheck
npm test
```

Salida esperada (exit code 0):

```
[PASS] supabase/tests/t01_idempotencia_renovacion.sql
[PASS] supabase/tests/t02_stock_insuficiente.sql
...
RESULTADO: 9/9 pruebas OK
```

Decisiones del arnés de pruebas:

- **Una base PGlite nueva por archivo de prueba.** Las pruebas no comparten estado y, de paso,
  el DDL se aplica desde cero nueve veces.
- `harness/stub.sql` crea los roles `anon` y `authenticated`, el esquema `auth`, `auth.users` y un
  `auth.uid()` que lee `current_setting('request.jwt.claim.sub')`.
- `harness/fixtures.sql` inserta el administrador (usuario + `profiles`). Se ejecuta como dueño
  de las tablas, porque un rol sin fila en `profiles` no puede crear su propio perfil — y eso es
  exactamente lo que se quiere.
- El huso de sesión se fija en **UTC**, que es como corre Supabase. PGlite arranca en
  `Etc/GMT+5`; sin este ajuste, una suma de meses hecha en el huso de sesión parecería correcta
  aquí y fallaría en producción (se comprobó con `mutate.mjs`).
- Las pruebas corren como `authenticated` con `auth.uid()` apuntando al administrador. Es el
  camino real del navegador: RLS y privilegios activos, no superusuario.

### 3.1 `mutate.mjs` — las pruebas deben fallar cuando el código está mal

Una prueba que pasa tanto con el código correcto como con el roto no prueba nada. `mutate.mjs`
rompe a propósito ocho reglas, exige que falle la prueba correspondiente y restaura el archivo:

| Mutación | Debe fallar |
|---|---|
| `renewals.idempotency_key` sin `unique` | t01 |
| Sin validación de stock | t02 |
| Reversión al promedio actual en vez del costo congelado | t03 |
| Sin tope de pago contra `amount_agreed` | t04 |
| Umbral urgente en cero | t05 |
| Suma de meses en UTC en vez de hora de Lima | t06 |
| Compra de tokens duplicada como gasto | t07 |
| `GRANT INSERT` en `renewals` | t08 |

---

## 4. Contrato para el frontend

### 4.1 `account_status` — el estado NO se reimplementa en TypeScript

```sql
public.account_status(
  p_expires_at  timestamptz,
  p_archived_at timestamptz,       -- null si la cuenta no está archivada
  p_at          timestamptz default now()
) returns text
```

Devuelve exactamente uno de: `'ARCHIVADA' | 'VENCIDA' | 'URGENTE' | 'PROXIMA' | 'ACTIVA'`.

Reglas:

1. `ARCHIVADA` si `p_archived_at is not null` (prevalece sobre todo).
2. `VENCIDA` si `p_at >= p_expires_at` (instante real, no día calendario).
3. `URGENTE` si `days_left <= app_settings.urgent_days` (por defecto 3, incluye 0 = vence hoy).
4. `PROXIMA` si `days_left <= app_settings.warning_days` (por defecto 7).
5. `ACTIVA` en el resto.

`days_left = (p_expires_at at time zone 'America/Lima')::date - (p_at at time zone 'America/Lima')::date`.

Es **determinista respecto de `p_at`** y depende solo de los umbrales de `app_settings`. Por eso
las pruebas pueden fijar un instante y no dependen del reloj. `v_account_status` la usa; el
frontend debe hacer lo mismo si necesita recalcular un estado con otra fecha, por ejemplo al
previsualizar un cambio de vencimiento:

```ts
// correcto
const status = await rpc('account_status', { p_expires_at, p_archived_at, p_at })
// prohibido
const status = daysLeft <= 3 ? 'URGENTE' : ...   // ❌ duplica la regla
```

### 4.2 `add_months` — la fecha sugerida tampoco se reimplementa

```sql
public.add_months(p_ts timestamptz, p_months integer) returns timestamptz
```

Suma meses calendario con ajuste a fin de mes, calculada sobre el reloj de `America/Lima`
(31 ene + 1 mes = 28 feb; 31 ene 2028 + 1 mes = 29 feb 2028). Se opera en hora local y se vuelve
a `timestamptz` porque sumar el intervalo directamente sobre UTC corre un día cuando el
vencimiento es de noche en Lima.

```sql
-- Cuenta vencida o nueva: desde la fecha de la operación.
select public.add_months(p_effective_at, p.duration_months);
-- Cuenta aún vigente: desde el vencimiento actual.
select public.add_months(a.expires_at, p.duration_months);
```

La fecha final sigue siendo **editable**: si el admin la cambia, se envía `p_expiration_edited =
true` y `p_new_expiration` con lo que muestra el proveedor (ADR-007).

### 4.3 Vistas (todas `security_invoker = true`)

**`v_account_status`** — 21 columnas. Datos de la cuenta (`id`, `customer_id`,
`external_username`, `reference`, `purchased_at`, `expires_at`, `initial_expires_at`,
`last_verified_at`, `notes`, `archived_at`, `created_by`, `created_at`, `updated_at`) más
`customer_name`, `phone`, `expires_on` (date de Lima), `days_left` (int), `status` (text),
`followup_status` (enum), `is_stale_verification` (bool) y `status_rank` (int).

`status_rank` existe para que el orden canónico viva en un solo sitio:
`VENCIDA=0, URGENTE=1, PROXIMA=2, ACTIVA=3, ARCHIVADA=4`. La vista ya viene ordenada por
`status_rank, expires_on`; el frontend debe ordenar igual y no recalcular el rango.

`is_stale_verification` = `last_verified_at is null or last_verified_at < now() - interval '30 days'`.

**`v_cash_movements`** — `direction` (`IN`/`OUT`), `amount`, `occurred_at`, `kind`
(`COBRO`/`GASTO`/`COMPRA_TOKENS`), `source_id`, `description`, `reference`. Saldo neto =
`SUM(amount) FILTER (WHERE direction='IN') - SUM(amount) FILTER (WHERE direction='OUT')`.
`source_id` apunta a la tabla de origen según `kind` (`payments.id`, `expenses.id` o
`token_purchases.id`), para abrir el detalle.

**`v_renewal_summary`** — todas las columnas de `renewals` más `amount_paid`, `amount_pending`
(`greatest(amount_agreed - paid, 0)`), `token_cost` (Σ de los `CONSUMO`), `gross_margin`
(`amount_agreed - token_cost`) e `is_reversed`.

> Los agregados de negocio (ingresos, margen del mes) deben filtrar `is_reversed = false`. Una
> renovación revertida conserva sus importes históricos y sus pagos a propósito.

### 4.4 RPC

Todas son `SECURITY DEFINER`, `search_path = public`, verifican `is_admin()` y escriben en
`audit_log`. Se invocan por PostgREST con argumentos nombrados:

| RPC | Parámetros | Devuelve |
|---|---|---|
| `rpc_register_renewal` | `p_account_id, p_plan_id, p_operation_type, p_effective_at, p_new_expiration, p_amount_agreed, p_tokens_used, p_notes, p_idempotency_key, p_expiration_edited=false` | `renewals` |
| `rpc_record_payment` | `p_renewal_id, p_amount, p_method, p_paid_at, p_reference, p_notes, p_idempotency_key` | `payments` |
| `rpc_purchase_tokens` | `p_quantity, p_total_cost, p_purchased_at, p_supplier, p_reference, p_notes, p_idempotency_key` | `token_purchases` |
| `rpc_adjust_tokens` | `p_delta, p_reason, p_idempotency_key` | `token_movements` |
| `rpc_reverse_renewal` | `p_renewal_id, p_reason, p_idempotency_key=null` | `renewals` |
| `rpc_set_account_expiration` | `p_account_id, p_expires_at, p_reason, p_idempotency_key=null` | `iptv_accounts` |
| `rpc_update_followup` | `p_account_id, p_status=null, p_notes=null, p_next_followup_at=null, p_template_key=null, p_rendered_body=null, p_wa_url=null, p_event_type='MENSAJE_ENVIADO', p_idempotency_key=null` | `renewal_followups` |

**Idempotencia.** `p_idempotency_key` la genera el frontend con `crypto.randomUUID()` **una vez
por formulario**, no en cada clic; el reintento manda la misma clave. Misma clave = mismo
resultado, sin excepción y sin doble escritura. No es una clave de deduplicación de negocio: una
segunda renovación legítima de la misma cuenta necesita una clave nueva.

**Errores.** Llegan como error de PostgREST con `message` en español y prefijo estable. El
frontend debe mapear por prefijo, no por texto completo:

| Prefijo | SQLSTATE | Significado |
|---|---|---|
| `NO_AUTORIZADO` | 42501 | La sesión no es administradora |
| `STOCK_INSUFICIENTE` | 23514 | No hay tokens suficientes |
| `PAGO_EXCEDE_MONTO_ACORDADO` | 23514 | Σ pagos supera `amount_agreed` |
| `CUENTA_ARCHIVADA` | 23514 | No se renueva una cuenta archivada |
| `RENOVACION_REVERTIDA` | 23514 | No se cobra una renovación revertida |
| `CUENTA_NO_ENCONTRADA`, `PLAN_NO_ENCONTRADO`, `RENOVACION_NO_ENCONTRADA` | 22023 | Referencia inexistente |
| `MONTO_INVALIDO`, `TOKENS_INVALIDOS`, `CANTIDAD_INVALIDA`, `DELTA_INVALIDO`, `MOTIVO_REQUERIDO`, `FECHAS_REQUERIDAS`, `FECHA_VENCIMIENTO_INVALIDA` | 22023 | Entrada inválida |
| `IDEMPOTENCY_KEY_REQUERIDA` | 22023 | Falta la clave en una RPC que la exige |
| `STOCK_NO_INICIALIZADO` | 23514 | Falta la fila singleton de `token_stock` |

---

## 5. Decisiones de implementación

### 5.1 Sin `pgcrypto`

`gen_random_uuid()` es nativo desde PostgreSQL 13. No se crea ninguna extensión: así las
migraciones aplican igual en Supabase y en PGlite (que no trae `pgcrypto`).

### 5.2 `account_status` es `SECURITY DEFINER`

Es una función de cálculo, pero lee `app_settings`. Si fuera invocadora, el resultado dependería
de que el rol pudiera leer esa tabla y de su política RLS. Al ser `SECURITY DEFINER` (con
`search_path` fijo) el cálculo es el mismo para todos y la vista no puede devolver estados
distintos según quién consulte. Solo devuelve una cadena; no expone datos.

### 5.3 Suma de meses en hora de Lima

`add_months` convierte a hora local sin zona, suma el intervalo y vuelve a `timestamptz`. Sumar
`interval '1 month'` directamente sobre el `timestamptz` da el resultado correcto solo si el
huso de sesión coincide con el del negocio. Ejemplo real que rompe la versión ingenua:

```
2026-01-30 20:00 Lima  =  2026-01-31 01:00 UTC
+ 1 mes en UTC         =  2026-02-28 01:00 UTC  =  2026-02-27 20:00 Lima  ❌ (se perdió un día)
```

### 5.4 Reversión: el promedio no se mueve

El consumo congela el costo y **no** altera `avg_unit_cost`; su inverso tampoco. Devolver los
tokens con el costo original y sin tocar el promedio hace que revertir sea exactamente deshacer:
`quantity` vuelve al valor previo y `avg_unit_cost` también. Si en el medio entró una compra más
cara, el promedio sigue siendo el vigente y la devolución queda registrada a su costo histórico
en `token_movements` (que es el dato auditable). Ver §7, punto 2.

### 5.5 El promedio se redondea a 6 decimales

`token_stock.avg_unit_cost` es `numeric(12,6)`; el cálculo se redondea explícitamente a 6 antes
de escribir. `cost_amount` de cada movimiento se redondea a 2 (`numeric(12,2)`) en el momento de
congelarlo, para que la suma de costos cuadre al céntimo con la caja.

### 5.6 `token_stock` y `renewals` se bloquean con `FOR UPDATE`

`rpc_register_renewal` bloquea primero la cuenta y luego el stock; `rpc_purchase_tokens`,
`rpc_adjust_tokens` y `rpc_reverse_renewal` bloquean el stock. `rpc_record_payment` bloquea la
renovación. El orden de bloqueo es siempre el mismo (cuenta → stock), lo que evita interbloqueos
entre renovación y compra.

### 5.7 Idempotencia en las RPC sin columna `unique` propia

`rpc_reverse_renewal`, `rpc_set_account_expiration` y `rpc_update_followup` no tienen una columna
`idempotency_key` en su tabla. Su clave se guarda en `audit_log.payload.idempotency_key` y hay un
índice único parcial que impide dos auditorías con la misma clave para la misma acción:

```sql
create unique index audit_log_idempotency_key_ux
  on public.audit_log (action, ((payload ->> 'idempotency_key')))
  where payload ? 'idempotency_key';
```

Se incluye `action` a propósito: la misma clave puede usarse legítimamente en dos acciones
distintas (por ejemplo registrar la renovación y luego su cobro) sin que la segunda falle por una
restricción que no tiene nada que ver con su propia idempotencia.

`rpc_reverse_renewal` es además idempotente por naturaleza: revertir una renovación ya revertida
devuelve la fila existente sin crear otro movimiento.

### 5.8 Doble barrera en las tablas críticas

`GRANT` revocado **y** RLS sin política de escritura. La prueba 8 comprueba las dos cosas:
`has_table_privilege('authenticated', 'public.renewals', 'INSERT') = false` y que el `INSERT`
real falla con SQLSTATE 42501 (PostgreSQL usa el mismo código para "permission denied" y para
"row-level security policy violation", así que la prueba verifica el efecto, no el origen).

### 5.9 `expenses` y `renewal_followups` en §5

`docs/02-modelo-datos.md` §5 no clasifica estas dos tablas. Decisión:

- **`expenses`**: escritura directa para el administrador (SELECT/INSERT/UPDATE/DELETE). Es un
  gasto simple, sin invariantes cruzadas, y no existe RPC de gastos en §4. Queda validado por
  tipos, `CHECK` y `updated_at`. Como es dinero, el rastro de auditoría se deja por
  **trigger** (`expenses_audit`, acciones `EXPENSE_CREATED` / `EXPENSE_UPDATED` /
  `EXPENSE_DELETED`) en lugar de por RPC. Ver §10, punto 3.
- **`renewal_followups`**: solo lectura. Su estado se mueve por `rpc_update_followup` para que
  estado actual y `contact_logs` no se desincronicen.

### 5.10 Privilegios por columna

Solo `profiles` los usa: `grant update (display_name)` más una política que exige
`id = auth.uid()`. En el resto de tablas el `GRANT` es a nivel de tabla porque las vistas
`security_invoker` leen filas completas; un `GRANT` por columna equivalente sería ruido sin
reducir superficie real. La recomendación de "no usar `select *` en el cliente" se mantiene como
regla de consumo, no como privilegio.

### 5.11 `timezone` se cita siempre

`app_settings."timezone"` está entre comillas dobles porque `TIME ZONE` es sintaxis del lenguaje.
El `CHECK ("timezone" = 'America/Lima')` es deliberado: las funciones escriben el literal
`'America/Lima'` en lugar de leer la columna. Si algún día se admite otro huso, hay que relajar el
`CHECK` **y** cambiar las funciones; por eso el `CHECK` está ahí.

### 5.12 `status_rank`

Columna extra en `v_account_status` (no está en §3) para que el orden canónico
`VENCIDA, URGENTE, PROXIMA, ACTIVA, ARCHIVADA` exista en un solo lugar. Sin ella, el frontend
tendría que replicar el `CASE` del estado solo para ordenar.

### 5.13 Lo que **no** valida el modelo y se validó en RPC

- Que `tokens_used` coincida con `plans.tokens_required`: es una decisión del formulario. Una
  renovación puede consumir 0 tokens si el admin ya los tenía fuera del sistema. Forzarlo
  rompería el registro de operaciones reales ya hechas en el proveedor.
- Que `p_new_expiration` respete `duration_months`: la fecha es editable por diseño (ADR-007).
  Solo se exige `new_expiration > effective_at - interval '1 day'`.
- Que un plan esté `is_active` para renovar: se permite a propósito (un plan retirado puede
  seguir usándose en una operación ya pactada).

---

## 6. Vistas y consultas que justifican los índices

| Índice | Consulta real |
|---|---|
| `iptv_accounts (expires_at)` | "qué vence en los próximos 3/7 días" (dashboard) |
| `iptv_accounts (archived_at, expires_at)` | listado principal sin archivadas, ordenado por vencimiento |
| `iptv_accounts (customer_id)` | cuentas de un cliente en su ficha |
| `iptv_accounts unique lower(external_username) where archived_at is null` | impedir duplicar un usuario IPTV activo sin bloquear el histórico |
| `renewals (account_id, recorded_at desc)` | historial de la cuenta, más reciente primero |
| `renewals (effective_at)` | reporte por fecha real de la operación |
| `renewals (reversed_at)` | filtrar confirmadas / listar reversiones |
| `payments (paid_at)` | caja por rango de fechas |
| `payments (renewal_id)` | Σ pagos por renovación (pendiente y margen) |
| `expenses (spent_at)` | caja por rango de fechas |
| `token_purchases (purchased_at)` | caja por rango de fechas y costo de inventario |
| `token_movements (created_at)` | auditoría cronológica del libro |
| `token_movements (renewal_id)` | costo de una renovación y su reversión |
| `token_movements (purchase_id)` | movimientos de una compra |
| `contact_logs (account_id, created_at desc)` | historial de contactos de una cuenta |
| `audit_log (created_at desc)` | pantalla de auditoría (últimas N acciones) |
| `audit_log unique (payload->>'idempotency_key') where ...` | idempotencia de las RPC sin columna propia |

No se creó ningún índice "por si acaso". Los `unique` de `idempotency_key`, `plans.key`,
`whatsapp_templates.key` y `renewal_followups.account_id` son constraints, no índices de consulta.

---

## 7. Invariantes y dónde se garantizan

| Invariante | Dónde |
|---|---|
| Un usuario IPTV no se duplica entre cuentas activas | índice único parcial |
| El saldo de tokens nunca es negativo | `CHECK (quantity >= 0)` + validación con `FOR UPDATE` |
| `token_stock.quantity == SUM(token_movements.quantity_delta)` | ADR-004 + pruebas t09 (no hay constraint cruzada: se verifica) |
| Un movimiento siempre tiene origen | `token_movements_origen_chk` |
| Signo coherente con el tipo de movimiento | `token_movements_signo_chk` |
| Σ pagos ≤ `amount_agreed` | `rpc_record_payment` con lock de la renovación |
| Una renovación revertida tiene motivo | `renewals_reversion_con_motivo_chk` |
| Comprar tokens no crea un gasto | ADR-005 (no hay categoría de tokens en `expense_category`) |
| Nadie escribe `renewals`/`payments`/`token_*`/`audit_log`/`contact_logs` desde el cliente | REVOKE + RLS sin política de escritura |
| Todo movimiento de dinero deja rastro | RPC → `audit_log`; `expenses` → trigger `expenses_audit` |
| Una cuenta con renovaciones no se borra | FK `on delete restrict` |
| La plantilla de WhatsApp no puede contener `{password}` | `whatsapp_templates_sin_password_chk` |

---

## 8. Limitaciones reales y qué **no** quedó validado

Se ejecutó SQL de verdad, pero en un entorno concreto. Lo que **no** está verificado:

1. **`supabase/config.toml` no fue validado por la CLI.** Docker estaba apagado y no se inició
   (`supabase start` no se ejecutó). Las claves usadas son las estándar (`[api]`, `[db]`,
   `[auth]`, `[auth.email]`, `[studio]`, `[storage]`, `[analytics]`), pero no hay evidencia de
   que esta versión de la CLI las acepte todas. Verificación pendiente: `supabase status` con
   Docker arriba.
2. **Concurrencia real no probada.** PGlite es una sola conexión: no se pueden lanzar dos
   transacciones simultáneas. Los `SELECT ... FOR UPDATE` están revisados y son correctos por
   diseño, pero la carrera renovación-vs-compra no se ejecutó. Verificación pendiente: dos
   sesiones `psql` contra Postgres real.
3. **`auth.uid()` es un stub.** En Supabase real lee el JWT; aquí lee
   `request.jwt.claim.sub`. `is_admin()` no se probó contra tokens JWT reales ni contra un
   usuario sin fila en `profiles` autenticado por GoTrue.
4. **`pgcrypto` no está disponible en PGlite.** No se usa, pero tampoco se probó la migración en
   un Supabase real donde el esquema `extensions` existe.
5. **PostgREST no se ejercitó.** Las firmas son correctas para llamadas con argumentos
   nombrados, pero no se probó el mapeo HTTP de errores ni el `Content-Profile`.
6. **Rendimiento sin medir.** Con cero o pocas filas, un `EXPLAIN` no dice nada. No hay
   evidencia de planes ni de uso de índices bajo volumen. Verificación pendiente cuando existan
   datos reales.
7. **Backup y restore no probados.** No hay proyecto Supabase todavía; ver §9.
8. **`supabase db reset` no ejecutado.** La aplicación "desde cero" se validó con PGlite
   nueve veces, no con la CLI.
9. **Zona horaria de la base.** Las pruebas fuerzan `TimeZone = UTC` (como Supabase). Si alguien
   corre el SQL en una base con otro huso por defecto, todo lo que no usa `AT TIME ZONE`
   explícito podría cambiar de resultado. Las funciones y vistas lo usan siempre.

---

## 9. Backup y rollback

### 9.1 Estado actual (greenfield, sin datos)

El rollback de este conjunto es trivial porque no hay datos que preservar:

```sql
-- Solo en una base local de desarrollo, nunca en producción con datos.
drop schema public cascade;
create schema public;
```

Después se vuelve a aplicar `migrations/` + `seed.sql`.

### 9.2 Antes de aplicar en el proyecto real

1. **Backup verificado**, no solo ejecutado:
   ```bash
   supabase db dump --data-only -f backup_pre_migracion.sql
   ```
2. **Restaurar ese backup en una base de prueba** y comparar conteos de
   `renewals`, `payments`, `token_movements`, `token_stock.quantity` y
   `SUM(amount)` de `v_cash_movements`. Sin esta comparación, el backup no cuenta como probado.
3. Aplicar `supabase db push`.
4. Verificar después:
   ```sql
   select quantity from public.token_stock where id = 1;
   select sum(quantity_delta) from public.token_movements;
   ```
   Ambos valores deben coincidir.

### 9.3 Criterio de aborto

- Cualquier error durante `db push` → detenerse; no reintentar a ciegas.
- Diferencia entre `token_stock.quantity` y `SUM(quantity_delta)` → restaurar backup.
- Cualquier `INSERT`/`UPDATE` inesperado sobre `renewals`, `payments` o `token_*` durante la
  ventana → restaurar backup.

### 9.4 Rollback de una migración futura

Este conjunto inicial no incluye `down migrations`: en Postgres, revertir DDL con datos no es
seguro de automatizar. El patrón obligatorio a partir de ahora es **expand/contract**:

1. Migración *expand*: agregar columnas/tablas nuevas como nullable o con `DEFAULT`, sin romper
   la versión desplegada. Backfill por lotes (`LIMIT`/`ctid`) con monitoreo.
2. Desplegar el código que usa lo nuevo.
3. Migración *contract*: quitar lo viejo en una migración posterior, solo después de confirmar
   que nada lo usa.

---

## 10. Contradicciones y ambigüedades detectadas en `docs/02-modelo-datos.md`

No se cambió el documento. Son puntos donde hubo que interpretar:

1. **§4, idempotencia vs firma.** El encabezado dice "Todas son idempotentes por
   `p_idempotency_key`", pero la tabla de entradas de `rpc_reverse_renewal` (renewal_id, reason),
   `rpc_set_account_expiration` (account_id, expires_at, reason) y `rpc_update_followup` no
   incluye esa clave. **Resolución:** se agregó un `p_idempotency_key uuid default null` al final
   de esas tres firmas. Sigue siendo compatible con la llamada descrita en el documento y cumple
   ADR-008. Si se prefiere no exponer el parámetro, habría que quitar la exigencia de
   idempotencia para esas tres.
2. **§4, promedio ponderado en reversiones.** "En consumos y reversiones negativas, `avg` no
   cambia" mezcla dos casos: un consumo tiene delta negativo, una reversión tiene delta positivo.
   **Resolución:** ninguna de las dos mueve el promedio; solo las compras y los ajustes positivos
   lo recalculan. Queda documentado en §5.4.
3. **§5, tablas sin clasificar.** `expenses` y `renewal_followups` no aparecen ni en las tablas
   escribibles ni en las denegadas. **Resolución:** `expenses` escribible directo (no hay RPC de
   gastos), `renewal_followups` solo lectura (se mueve por RPC). Ver §5.9. Además, `AGENTS.md`
   dice que "dinero y tokens siempre pasan por RPC + auditoría", pero §4 no define RPC de gastos:
   se mantuvo la escritura directa y se añadió un trigger de auditoría para cumplir la parte de
   trazabilidad. Si se quiere que `expenses` pase por RPC, hace falta un ADR que lo agregue a §4.
4. **§2 `renewals.account_id`.** Se declara `uuid not null` sin `references`, pero más abajo se
   exige "prohibido `DELETE` si tiene renovaciones". **Resolución:** FK
   `references iptv_accounts(id) on delete restrict`. Lo mismo para `reversed_by` y `created_by`
   (→ `profiles(id) on delete set null`, para que la bitácora sobreviva al borrado del perfil).
5. **§3 `v_account_status`.** `last_verified_at` aparece en la lista de "datos de la cuenta" y
   otra vez en la lista de columnas añadidas. Se expone una sola vez.
6. **§5, "GRANT de columnas explícito".** Se interpretó como GRANT explícitos (nada implícito por
   privilegios por defecto) más privilegio por columna solo donde aporta (`profiles.display_name`).
   Un GRANT por columna en todas las tablas sería equivalente a nivel de tabla porque las vistas
   leen filas completas. Ver §5.10.
7. **§1/§2, `min_token_balance`.** Se define y se siembra, pero ninguna RPC ni vista lo usa: es
   un umbral de alerta de la UI. No se inventó lógica de negocio con él.

---

## 11. Siguiente paso

Para `frontend-web`:

1. Generar `p_idempotency_key` con `crypto.randomUUID()` al abrir el formulario de renovación y
   reutilizarla en cada reintento.
2. Leer estados **solo** de `v_account_status` y, cuando necesite otra fecha, llamar a
   `account_status(...)`. No reimplementar el `CASE`.
3. Usar `add_months(...)` para la fecha sugerida (o `date-fns` con la misma regla, pero la
   verificación final debe pasar por `add_months`).
4. Escribir en `renewals`, `payments`, `token_*`, `audit_log` y `contact_logs` **solo** por RPC.
5. Para `db-architect` en la Ola 3: prueba de concurrencia con dos conexiones reales y `EXPLAIN`
   con datos de volumen antes de tocar cualquier índice.
