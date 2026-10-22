# Modelo de datos — contrato técnico

Este documento es la **fuente de verdad** para migraciones, RPC y frontend. Si el código diverge,
el código está mal.

Convenciones globales:
- PK `uuid` con `gen_random_uuid()`.
- `created_at timestamptz not null default now()`, `updated_at` con trigger.
- Dinero `numeric(12,2)`, nunca `float`. PEN, un solo `CHECK (amount >= 0)`.
- Fechas `timestamptz` en UTC. "Día" = `(x AT TIME ZONE 'America/Lima')::date`.
- Borrado lógico: `archived_at timestamptz`. No se borra nada con movimientos.

## 1. Enums

| Enum | Valores |
|---|---|
| `followup_status` | `PENDIENTE`, `CONTACTADO`, `EN_CONVERSACION`, `CONFIRMADO`, `RENOVADO`, `NO_RENOVARA` |
| `payment_method` | `YAPE`, `PLIN`, `TRANSFERENCIA`, `EFECTIVO`, `OTRO` |
| `token_movement_type` | `COMPRA`, `CONSUMO`, `AJUSTE`, `REVERSION` |
| `renewal_operation_type` | `ACTIVACION`, `RENOVACION` |
| `expense_category` | `OPERATIVO`, `PUBLICIDAD`, `HERRAMIENTAS`, `OTRO` (sin tokens: ver ADR-005) |
| `contact_event_type` | `ENLACE_ABIERTO`, `MENSAJE_ENVIADO`, `RESPUESTA_RECIBIDA` |

El **estado de vigencia** (`ACTIVA`, `PROXIMA`, `URGENTE`, `VENCIDA`, `ARCHIVADA`) **no** es un enum
persistido: se calcula en `v_account_status` (ADR-006).

## 2. Tablas

### `profiles`
`id uuid pk references auth.users(id) on delete cascade`, `display_name text not null`,
`created_at`, `updated_at`.

`is_admin()` = existe fila en `profiles` para `auth.uid()`. `SECURITY DEFINER`, `search_path = public`.
La ausencia de fila = sin acceso, aunque el usuario exista en `auth.users`.

### `app_settings` (singleton)
`id smallint pk default 1 check (id = 1)`,
`urgent_days int not null default 3 check (between 0 and 30)`,
`warning_days int not null default 7 check (between 1 and 60)`,
`min_token_balance int not null default 5 check (>= 0)`,
`timezone text not null default 'America/Lima' check (timezone = 'America/Lima')`,
`updated_at`.
`check (urgent_days < warning_days)`.

### `customers`
`id`, `first_name text not null`, `last_name text not null`,
`phone text not null check (phone ~ '^[0-9]{9,15}$')` (dígitos, sin `+` ni espacios; se muestra formateado),
`notes text`, `archived_at timestamptz`, `created_at`, `updated_at`.
`phone` **no** es único (familias comparten número).

### `iptv_accounts`
`id`, `customer_id uuid not null references customers(id)`,
`external_username text not null`, `reference text` (dónde está la contraseña, ej. "gestor personal"),
`purchased_at timestamptz not null` (fecha/hora de compra en el panel externo),
`expires_at timestamptz not null` (vencimiento real, editable),
`initial_expires_at timestamptz not null` (valor del alta; base para recalcular tras reversión),
`last_verified_at timestamptz` (última vez que el admin confirmó la fecha contra el proveedor),
`notes text`, `archived_at timestamptz`, `created_by uuid references profiles(id)`,
`created_at`, `updated_at`.

Constraints:
- `check (expires_at > purchased_at)`.
- **Índice único parcial** `lower(external_username)` `where archived_at is null`
  (un usuario IPTV no puede estar duplicado entre cuentas activas locales).
- Índices: `(expires_at)`, `(customer_id)`, `(archived_at, expires_at)`.
- Prohibido `DELETE` si tiene renovaciones.

### `plans`
`id`, `key text not null unique` (`1M_1D`, `1M_3D`, `3M_3D`, `6M_3D`, `12M_3D`),
`name text not null`, `duration_months int not null check (> 0)`,
`devices int not null check (devices in (1,3))`, `suggested_price numeric(12,2) not null check (>= 0)`,
`tokens_required int not null check (>= 0)`, `is_active boolean not null default true`,
`sort_order int not null default 0`, `created_at`, `updated_at`.

### `renewals`
`id`, `account_id uuid not null`, `plan_id uuid not null references plans(id)`,
`operation_type renewal_operation_type not null`,
**snapshots** (congelados al registrar): `plan_name`, `duration_months`, `devices`,
`price_snapshot numeric(12,2) not null`, `amount_agreed numeric(12,2) not null`,
`tokens_used int not null check (>= 0)`,
`previous_expiration timestamptz`, `new_expiration timestamptz not null`,
`expiration_edited boolean not null default false`,
`effective_at timestamptz not null` (fecha/hora real de la operación en el proveedor),
`idempotency_key uuid not null unique`, `notes text`,
`reversed_at timestamptz`, `reversal_reason text`, `reversed_by uuid`,
`created_by uuid`, `created_at`, `recorded_at timestamptz not null default now()`.

- `check (reversed_at is null or reversal_reason is not null)`.
- Estado derivado: `REVERSIONADA` si `reversed_at is not null`, si no `CONFIRMADA`. No columna `status`.
- Índices: `(account_id, recorded_at desc)`, `(effective_at)`, `(reversed_at)`.

### `payments`
`id`, `renewal_id uuid not null references renewals(id)`, `amount numeric(12,2) not null check (> 0)`,
`method payment_method not null`, `paid_at timestamptz not null`, `reference text`, `notes text`,
`idempotency_key uuid not null unique`, `created_by`, `created_at`.
Índices: `(paid_at)`, `(renewal_id)`. Sin `status` (ADR-003).

### `expenses`
`id`, `category expense_category not null`, `amount numeric(12,2) not null check (> 0)`,
`spent_at timestamptz not null`, `description text not null`, `reference text`,
`created_by`, `created_at`, `updated_at`.
Índice `(spent_at)`. Sin categoría de tokens por diseño.

### `token_purchases`
`id`, `quantity int not null check (> 0)`, `total_cost numeric(12,2) not null check (> 0)`,
`unit_cost numeric(12,4) generated always as (total_cost / quantity) stored`,
`purchased_at timestamptz not null`, `supplier text`, `reference text`, `notes text`,
`idempotency_key uuid not null unique`, `created_by`, `created_at`.
Índice `(purchased_at)`.

### `token_stock` (singleton)
`id smallint pk default 1 check (id = 1)`,
`quantity int not null default 0 check (quantity >= 0)`,
`avg_unit_cost numeric(12,6) not null default 0 check (>= 0)`,
`updated_at`.
Es el saldo de lectura. Toda mutación pasa por RPC con `FOR UPDATE`.

### `token_movements`
`id`, `movement_type token_movement_type not null`,
`quantity_delta int not null check (quantity_delta <> 0)`,
`unit_cost numeric(12,6) not null check (>= 0)` — congelado,
`cost_amount numeric(12,2) not null check (>= 0)` — congelado,
`renewal_id uuid references renewals(id)`, `purchase_id uuid references token_purchases(id)`,
`reason text`, `idempotency_key uuid not null unique`, `created_by`, `created_at`.

Check de origen (obligatorio, evita movimientos huérfanos):
```
COMPRA      → purchase_id not null and renewal_id null
CONSUMO     → renewal_id not null and purchase_id null
REVERSION   → renewal_id not null and purchase_id null and reason not null
AJUSTE      → renewal_id null and purchase_id null and reason not null
```
Índices: `(created_at)`, `(renewal_id)`, `(purchase_id)`.

### `renewal_followups`
`id`, `account_id uuid not null unique references iptv_accounts(id)`,
`status followup_status not null default 'PENDIENTE'`,
`last_contact_at timestamptz`, `next_followup_at timestamptz`, `notes text`,
`updated_at`, `created_at`.
Se crea automáticamente con la cuenta (trigger). Es el **estado actual**; el historial vive en
`contact_logs`. Toda transición se hace por RPC para que ambos queden sincronizados.

### `whatsapp_templates`
`id`, `key text not null unique` (`BIENVENIDA`, `RECORDATORIO`, `VENCIDO`, `RENOVACION_CONFIRMADA`),
`name text not null`, `body text not null`, `is_active boolean not null default true`,
`updated_at`, `created_at`.
Variables permitidas validadas en app: `{nombre}`, `{apellido}`, `{usuario}`, `{plan}`,
`{fecha_vencimiento}`, `{dias_restantes}`. Prohibido `{password}`.

### `contact_logs`
`id`, `customer_id uuid not null`, `account_id uuid`, `template_key text`,
`rendered_body text` (snapshot del mensaje; sobrevive a la edición de la plantilla),
`wa_url text`, `event_type contact_event_type not null`,
`followup_status_after followup_status`, `notes text`, `created_by`, `created_at`.
Índice `(account_id, created_at desc)`.

### `audit_log`
`id`, `actor_id uuid`, `action text not null`, `entity text not null`, `entity_id uuid`,
`payload jsonb not null default '{}'`, `created_at`.
Solo `INSERT` por RPC. `SELECT` para admin. Sin `UPDATE`/`DELETE` (revocar privilegios).

## 3. Vistas

Todas `WITH (security_invoker = true)` para que RLS aplique.

### `v_account_status`
Columnas: datos de la cuenta + `customer_name`, `phone`, `expires_on date`, `days_left int`,
`status text`, `followup_status`, `last_verified_at`, `is_stale_verification boolean`.

Reglas exactas:
```sql
status = case
  when a.archived_at is not null then 'ARCHIVADA'
  when now() >= a.expires_at then 'VENCIDA'
  when days_left <= s.urgent_days then 'URGENTE'   -- incluye 0 (vence hoy)
  when days_left <= s.warning_days then 'PROXIMA'
  else 'ACTIVA'
end
-- days_left = (a.expires_at at time zone 'America/Lima')::date
--           - (now() at time zone 'America/Lima')::date
-- is_stale_verification = last_verified_at is null or last_verified_at < now() - interval '30 days'
```
`ORDER BY` canónico para dashboard y seguimiento: `status` (VENCIDA, URGENTE, PROXIMA, ACTIVA,
ARCHIVADA), luego `expires_on asc`.

### `v_cash_movements`
`direction` (`IN`/`OUT`), `amount`, `occurred_at`, `kind` (`COBRO`, `GASTO`, `COMPRA_TOKENS`),
`source_id`, `description`, `reference`.
```sql
payments          → IN,  paid_at
expenses          → OUT, spent_at
token_purchases   → OUT, purchased_at   -- una sola vez (ADR-005)
```

### `v_renewal_summary`
Renovación + `amount_paid` (`Σ payments`), `amount_pending` (`amount_agreed − paid`, puede ser 0),
`token_cost` (`Σ cost_amount` de sus CONSUMO), `gross_margin` (`amount_agreed − token_cost`),
`is_reversed`.

### `v_cash_monthly` (flujo de caja por mes)
`month date`, `income`, `outflow`, `net`, `payments_count`, `token_purchases`.
Agrupa `v_cash_movements` por mes calendario de Lima. `token_purchases` es **informativo**: ya está
incluido en `outflow`, no se suma aparte.

### `v_profit_monthly` (rentabilidad por mes)
`month date`, `agreed_revenue`, `token_cost`, `operating_expenses`, `gross_margin`.
- `agreed_revenue` = renovaciones **no revertidas** por `effective_at`.
- `token_cost` = costo congelado de los consumos de esas renovaciones.
- `operating_expenses` = solo `expenses`; **nunca** compras de tokens.
- `gross_margin = agreed_revenue − token_cost − operating_expenses`.

Caja y rentabilidad son vistas distintas a propósito (ADR-005): comprar tokens mueve caja, no gasto.

### `v_customer_summary`
`customer_id`, `first_name`, `last_name`, `phone`, `archived_at`, `accounts_total`,
`accounts_active`, `next_expiration`, `worst_status`, `last_renewal_at`.
`accounts_active`, `next_expiration` y `worst_status` ignoran cuentas archivadas. `last_renewal_at`
ignora renovaciones revertidas.

### `v_token_summary` (una fila)
`quantity`, `avg_unit_cost`, `inventory_value`, `min_balance`, `below_minimum`.
Si no devuelve filas, el estado es "no disponible", no "saldo 0".

## 4. RPC (todas `SECURITY DEFINER`, `search_path = public`)

Todas empiezan con `if not is_admin() then raise exception 'NO_AUTORIZADO' using errcode = '42501'`.
Todas escriben en `audit_log`. Todas son idempotentes por `p_idempotency_key uuid` (unique index);
si la clave ya existe, **devuelven el resultado existente sin error**.

| RPC | Entrada | Invariantes |
|---|---|---|
| `rpc_register_renewal` | account, plan, operation_type, effective_at, new_expiration, expiration_edited, amount_agreed, tokens_used, notes, key | Lock de cuenta y de `token_stock`; `tokens_used >= 0`; stock suficiente; `new_expiration > effective_at - interval '1 day'`; inserta CONSUMO con costo congelado; actualiza `expires_at`; `last_verified_at = now()` |
| `rpc_record_payment` | renewal, amount, method, paid_at, reference, notes, key | `amount > 0`; `Σ payments + amount <= amount_agreed` (no se acepta sobrepago) |
| `rpc_purchase_tokens` | quantity, total_cost, purchased_at, supplier, reference, notes, key | `quantity > 0`, `total_cost > 0`; recalcula promedio ponderado |
| `rpc_adjust_tokens` | delta ≠ 0, reason, key | `reason` obligatorio; no admite resultado negativo; usa `avg_unit_cost` vigente como costo |
| `rpc_reverse_renewal` | renewal_id, reason | Debe estar confirmada; inserta REVERSION (+tokens) al costo congelado original; recalcula `expires_at`; marca `reversed_at` |
| `rpc_set_account_expiration` | account_id, expires_at, reason | Corrección manual auditada (evita edición silenciosa) |
| `rpc_update_followup` | account_id, status, notes, next_followup_at, template_key, rendered_body, wa_url, event_type | Inserta `contact_logs` y actualiza `renewal_followups` en la misma transacción |

### Recálculo de `expires_at` tras una reversión
```sql
coalesce(
  (select r.new_expiration from renewals r
    where r.account_id = a.id and r.reversed_at is null
    order by r.recorded_at desc, r.id desc limit 1),
  a.initial_expires_at
)
```
Determinista y sin importar el orden de las reversiones.

### Promedio ponderado (compras y ajustes positivos)
```
nuevo_qty = qty + delta
nuevo_avg = ((qty * avg) + cost_amount) / nuevo_qty
```
En consumos y reversiones negativas, `avg` **no** cambia: el costo ya está congelado en el movimiento.

## 5. Seguridad (RLS)

`ENABLE ROW LEVEL SECURITY` en todas las tablas. Rol `authenticated`:

| Tabla | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `profiles` | `is_admin()` | solo UPDATE de `display_name` propio |
| `customers`, `iptv_accounts`, `plans`, `whatsapp_templates` | `is_admin()` | `INSERT`/`UPDATE` permitido; `DELETE` **denegado** en `customers` e `iptv_accounts` (se archiva) |
| `app_settings` | `is_admin()` | UPDATE permitido (validado por checks) |
| `renewals`, `payments`, `token_*`, `audit_log`, `contact_logs` | `is_admin()` | **denegado**; solo RPC (ADR-008) |

Notas obligatorias:
- `is_admin()` es `SECURITY DEFINER` para evitar recursión de políticas.
- `GRANT` de columnas explícito en las tablas expuestas; no usar `select *` en el cliente.
- `service_role` nunca en `VITE_*` ni en el bundle.
- Registro público deshabilitado en Supabase Auth.

## 6. Seed

- `app_settings`: (1, 3, 7, 5, 'America/Lima').
- 5 planes de la ficha de kickoff con `sort_order` 1–5.
- 4 plantillas WhatsApp en español con las variables permitidas.
- `token_stock`: (1, 0, 0).
- Sin datos de clientes.
