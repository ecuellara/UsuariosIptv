-- =============================================================================
-- 0005 · Vistas de lectura
-- -----------------------------------------------------------------------------
-- Origen: docs/02-modelo-datos.md §3.
-- TODAS con security_invoker = true: la vista se ejecuta con los privilegios y
-- las políticas del usuario que consulta. Sin esto, una vista en Postgres se
-- ejecuta como su dueño y se saltaría la RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- v_account_status · estado de vigencia derivado.
-- No existe columna status en iptv_accounts: el estado se lee SIEMPRE de aquí
-- (o de public.account_status) para que listado y dashboard coincidan (ADR-006).
--
-- status_rank es el orden canónico del dashboard/seguimiento y existe para que
-- el frontend no tenga que replicar el CASE.
-- -----------------------------------------------------------------------------
create view public.v_account_status
with (security_invoker = true)
as
with base as (
  select
    a.id,
    a.customer_id,
    a.external_username,
    a.reference,
    a.purchased_at,
    a.expires_at,
    a.initial_expires_at,
    a.last_verified_at,
    a.notes,
    a.archived_at,
    a.created_by,
    a.created_at,
    a.updated_at,
    c.first_name || ' ' || c.last_name as customer_name,
    c.phone,
    (a.expires_at at time zone 'America/Lima')::date as expires_on,
    (a.expires_at at time zone 'America/Lima')::date
      - (now() at time zone 'America/Lima')::date as days_left,
    public.account_status(a.expires_at, a.archived_at) as status
  from public.iptv_accounts a
  join public.customers c on c.id = a.customer_id
)
select
  b.*,
  f.status as followup_status,
  (b.last_verified_at is null
   or b.last_verified_at < now() - interval '30 days') as is_stale_verification,
  case b.status
    when 'VENCIDA'  then 0
    when 'URGENTE'  then 1
    when 'PROXIMA'  then 2
    when 'ACTIVA'   then 3
    else 4
  end as status_rank
from base b
left join public.renewal_followups f on f.account_id = b.id
order by status_rank, b.expires_on;

comment on view public.v_account_status is
  'Estado derivado por cuenta. Orden canónico: VENCIDA, URGENTE, PROXIMA, ACTIVA, ARCHIVADA.';

-- -----------------------------------------------------------------------------
-- v_cash_movements · la caja es una vista, no un libro duplicado (ADR-005).
-- Cada hecho se lee de su tabla de origen y aparece UNA sola vez:
--   payments        -> IN  / COBRO
--   expenses        -> OUT / GASTO
--   token_purchases -> OUT / COMPRA_TOKENS
-- El saldo neto es SUM(IN) - SUM(OUT) sobre esta vista.
-- -----------------------------------------------------------------------------
create view public.v_cash_movements
with (security_invoker = true)
as
select
  'IN'::text                as direction,
  p.amount                  as amount,
  p.paid_at                 as occurred_at,
  'COBRO'::text             as kind,
  p.id                      as source_id,
  ('Cobro ' || p.method::text)::text as description,
  p.reference               as reference
from public.payments p
union all
select
  'OUT'::text               as direction,
  e.amount                  as amount,
  e.spent_at                as occurred_at,
  'GASTO'::text             as kind,
  e.id                      as source_id,
  e.description             as description,
  e.reference               as reference
from public.expenses e
union all
select
  'OUT'::text               as direction,
  tp.total_cost             as amount,
  tp.purchased_at           as occurred_at,
  'COMPRA_TOKENS'::text     as kind,
  tp.id                     as source_id,
  ('Compra de ' || tp.quantity || ' tokens')::text as description,
  tp.reference              as reference
from public.token_purchases tp;

comment on view public.v_cash_movements is
  'Caja unificada IN/OUT. Comprar tokens sale de caja una sola vez y no crea expense.';

-- -----------------------------------------------------------------------------
-- v_renewal_summary · renovación con sus totales derivados.
-- amount_pending nunca es negativo (ADR-003: lo pendiente es derivado, no se
-- almacena). gross_margin es bruto: no descuenta gastos operativos.
--
-- OJO: las filas con is_reversed = true conservan sus importes históricos. Los
-- agregados de negocio deben filtrar is_reversed = false.
-- -----------------------------------------------------------------------------
create view public.v_renewal_summary
with (security_invoker = true)
as
select
  r.id,
  r.account_id,
  r.plan_id,
  r.operation_type,
  r.plan_name,
  r.duration_months,
  r.devices,
  r.price_snapshot,
  r.amount_agreed,
  r.tokens_used,
  r.previous_expiration,
  r.new_expiration,
  r.expiration_edited,
  r.effective_at,
  r.idempotency_key,
  r.notes,
  r.reversed_at,
  r.reversal_reason,
  r.reversed_by,
  r.created_by,
  r.created_at,
  r.recorded_at,
  coalesce(p.amount_paid, 0)::numeric(12,2) as amount_paid,
  greatest(r.amount_agreed - coalesce(p.amount_paid, 0), 0)::numeric(12,2) as amount_pending,
  coalesce(t.token_cost, 0)::numeric(12,2) as token_cost,
  (r.amount_agreed - coalesce(t.token_cost, 0))::numeric(12,2) as gross_margin,
  (r.reversed_at is not null) as is_reversed
from public.renewals r
left join lateral (
  select sum(pay.amount) as amount_paid
  from public.payments pay
  where pay.renewal_id = r.id
) p on true
left join lateral (
  select sum(m.cost_amount) as token_cost
  from public.token_movements m
  where m.renewal_id = r.id
    and m.movement_type = 'CONSUMO'
) t on true;

comment on view public.v_renewal_summary is
  'Totales por renovación calculados en SQL: pagado, pendiente, costo de tokens y margen bruto.';
