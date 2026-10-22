-- =============================================================================
-- 0003 · Libro de operaciones y bitácoras
-- -----------------------------------------------------------------------------
-- Origen: docs/02-modelo-datos.md §2 (renewals … audit_log).
--
-- Estas tablas son de escritura crítica: el rol authenticated solo puede leerlas
-- (ver 0006). Toda mutación pasa por las RPC de 0007 (ADR-008).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- renewals · una fila = una operación registrada en el panel del proveedor.
-- Los campos comerciales son snapshots congelados: cambiar el plan después no
-- altera el histórico ni el margen.
-- -----------------------------------------------------------------------------
create table public.renewals (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.iptv_accounts (id) on delete restrict,
  plan_id            uuid not null references public.plans (id) on delete restrict,
  operation_type     public.renewal_operation_type not null,

  -- snapshots del plan al momento de registrar
  plan_name          text not null,
  duration_months    int  not null check (duration_months > 0),
  devices            int  not null check (devices in (1, 3)),
  price_snapshot     numeric(12,2) not null check (price_snapshot >= 0),

  amount_agreed      numeric(12,2) not null check (amount_agreed >= 0),
  tokens_used        int not null check (tokens_used >= 0),

  previous_expiration timestamptz,
  new_expiration      timestamptz not null,
  expiration_edited   boolean not null default false,
  effective_at        timestamptz not null,

  idempotency_key    uuid not null unique,
  notes              text,

  reversed_at        timestamptz,
  reversal_reason    text,
  reversed_by        uuid references public.profiles (id) on delete set null,

  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  recorded_at        timestamptz not null default now(),

  -- Una reversión sin motivo no es auditable.
  constraint renewals_reversion_con_motivo_chk
    check (reversed_at is null or (reversal_reason is not null and length(btrim(reversal_reason)) > 0)),
  -- La fecha final no puede quedar antes del día de la operación.
  constraint renewals_fechas_coherentes_chk
    check (new_expiration > effective_at - interval '1 day')
);

comment on table public.renewals is
  'Estado derivado: REVERSIONADA si reversed_at no es null, si no CONFIRMADA. No hay columna status.';

-- Historial de una cuenta, más reciente primero.
create index renewals_account_recorded_idx
  on public.renewals (account_id, recorded_at desc);
-- Reportes por fecha real de la operación en el proveedor.
create index renewals_effective_at_idx on public.renewals (effective_at);
-- Listado de reversiones / filtro "solo confirmadas".
create index renewals_reversed_at_idx on public.renewals (reversed_at);

-- -----------------------------------------------------------------------------
-- payments · dinero que YA entró (ADR-003). Sin status, sin abonos previos.
-- El pendiente es siempre amount_agreed − Σ payments, calculado.
-- -----------------------------------------------------------------------------
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  renewal_id      uuid not null references public.renewals (id) on delete restrict,
  amount          numeric(12,2) not null check (amount > 0),
  method          public.payment_method not null,
  paid_at         timestamptz not null,
  reference       text,
  notes           text,
  idempotency_key uuid not null unique,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

-- Caja por rango de fechas (v_cash_movements y cierre de mes).
create index payments_paid_at_idx on public.payments (paid_at);
-- Σ payments por renovación (pendiente y margen).
create index payments_renewal_id_idx on public.payments (renewal_id);

-- -----------------------------------------------------------------------------
-- expenses · gastos operativos. Sin categoría de tokens (ADR-005).
-- -----------------------------------------------------------------------------
create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  category    public.expense_category not null,
  amount      numeric(12,2) not null check (amount > 0),
  spent_at    timestamptz not null,
  description text not null check (length(btrim(description)) > 0),
  reference   text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index expenses_spent_at_idx on public.expenses (spent_at);

-- -----------------------------------------------------------------------------
-- token_purchases · egreso de caja por compra de inventario. unit_cost es
-- derivado (generated) para que nunca se pueda escribir un costo incoherente.
-- -----------------------------------------------------------------------------
create table public.token_purchases (
  id              uuid primary key default gen_random_uuid(),
  quantity        int not null check (quantity > 0),
  total_cost      numeric(12,2) not null check (total_cost > 0),
  unit_cost       numeric(12,4) generated always as (total_cost / quantity) stored,
  purchased_at    timestamptz not null,
  supplier        text,
  reference       text,
  notes           text,
  idempotency_key uuid not null unique,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index token_purchases_purchased_at_idx on public.token_purchases (purchased_at);

-- -----------------------------------------------------------------------------
-- token_stock · singleton con el saldo materializado (ADR-004).
-- Es la fuente del saldo; se muta SOLO dentro de RPC con SELECT ... FOR UPDATE.
-- -----------------------------------------------------------------------------
create table public.token_stock (
  id            smallint primary key default 1 check (id = 1),
  quantity      int not null default 0 check (quantity >= 0),
  avg_unit_cost numeric(12,6) not null default 0 check (avg_unit_cost >= 0),
  updated_at    timestamptz not null default now()
);

comment on table public.token_stock is
  'Saldo de tokens. quantity debe coincidir siempre con SUM(token_movements.quantity_delta).';

-- -----------------------------------------------------------------------------
-- token_movements · libro mayor inmutable con costo congelado.
-- El CHECK de origen impide movimientos huérfanos: cada fila dice de dónde viene.
-- -----------------------------------------------------------------------------
create table public.token_movements (
  id              uuid primary key default gen_random_uuid(),
  movement_type   public.token_movement_type not null,
  quantity_delta  int not null check (quantity_delta <> 0),
  unit_cost       numeric(12,6) not null check (unit_cost >= 0),
  cost_amount     numeric(12,2) not null check (cost_amount >= 0),
  renewal_id      uuid references public.renewals (id) on delete restrict,
  purchase_id     uuid references public.token_purchases (id) on delete restrict,
  reason          text,
  idempotency_key uuid not null unique,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),

  -- Origen obligatorio por tipo de movimiento (docs/02 §2).
  constraint token_movements_origen_chk check (
    (movement_type = 'COMPRA'
       and purchase_id is not null and renewal_id is null)
    or (movement_type = 'CONSUMO'
       and renewal_id is not null and purchase_id is null)
    or (movement_type = 'REVERSION'
       and renewal_id is not null and purchase_id is null
       and reason is not null and length(btrim(reason)) > 0)
    or (movement_type = 'AJUSTE'
       and renewal_id is null and purchase_id is null
       and reason is not null and length(btrim(reason)) > 0)
  ),
  -- Signo coherente con el tipo: las existencias entran por compra y por
  -- reversión, y salen por consumo. Un ajuste admite ambos signos.
  constraint token_movements_signo_chk check (
    (movement_type <> 'COMPRA'    or quantity_delta > 0)
    and (movement_type <> 'CONSUMO'   or quantity_delta < 0)
    and (movement_type <> 'REVERSION' or quantity_delta > 0)
  )
);

-- Auditoría cronológica del libro.
create index token_movements_created_at_idx on public.token_movements (created_at);
-- Movimientos de una renovación (costo y reversión).
create index token_movements_renewal_id_idx on public.token_movements (renewal_id);
-- Movimientos de una compra.
create index token_movements_purchase_id_idx on public.token_movements (purchase_id);

-- -----------------------------------------------------------------------------
-- renewal_followups · estado ACTUAL del seguimiento (1:1 con la cuenta).
-- Se crea por trigger al insertar la cuenta; el historial vive en contact_logs.
-- -----------------------------------------------------------------------------
create table public.renewal_followups (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null unique references public.iptv_accounts (id) on delete cascade,
  status           public.followup_status not null default 'PENDIENTE',
  last_contact_at  timestamptz,
  next_followup_at timestamptz,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- whatsapp_templates · textos editables. Las variables permitidas se validan en
-- la app; prohibido {password} (ADR-002). Se guarda el mensaje renderizado en
-- contact_logs para que editar la plantilla no reescriba el historial.
-- -----------------------------------------------------------------------------
create table public.whatsapp_templates (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique check (key ~ '^[A-Z0-9_]+$'),
  name       text not null check (length(btrim(name)) > 0),
  body       text not null check (length(btrim(body)) > 0),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Defensa en profundidad: ni por error de escritura se cuela una contraseña.
  constraint whatsapp_templates_sin_password_chk check (body not ilike '%{password}%')
);

-- -----------------------------------------------------------------------------
-- contact_logs · historial de contactos. rendered_body es un snapshot: sobrevive
-- a la edición o borrado de la plantilla.
-- -----------------------------------------------------------------------------
create table public.contact_logs (
  id                     uuid primary key default gen_random_uuid(),
  customer_id            uuid not null references public.customers (id) on delete restrict,
  account_id             uuid references public.iptv_accounts (id) on delete restrict,
  template_key           text,
  rendered_body          text,
  wa_url                 text,
  event_type             public.contact_event_type not null,
  followup_status_after  public.followup_status,
  notes                  text,
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now()
);

create index contact_logs_account_created_idx
  on public.contact_logs (account_id, created_at desc);

-- -----------------------------------------------------------------------------
-- audit_log · rastro de toda operación crítica. Solo INSERT por RPC; SELECT para
-- admin. Sin UPDATE ni DELETE (privilegios revocados en 0006).
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null check (length(btrim(action)) > 0),
  entity     text not null check (length(btrim(entity)) > 0),
  entity_id  uuid,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Pantalla de auditoría: últimas N acciones.
create index audit_log_created_at_idx on public.audit_log (created_at desc);

-- Garantía de idempotencia para las RPC que no tienen una columna unique propia
-- (reversión, corrección de vencimiento, seguimiento): una clave, un registro.
-- Se incluye `action` para que la misma clave pueda reutilizarse entre acciones
-- distintas (renovación + su cobro) sin bloquear una operación legítima.
create unique index audit_log_idempotency_key_ux
  on public.audit_log (action, ((payload ->> 'idempotency_key')))
  where payload ? 'idempotency_key';
