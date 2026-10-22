-- =============================================================================
-- 0008 · Vistas de reporte (agregados en SQL)
-- -----------------------------------------------------------------------------
-- Motivo: PostgREST de este proyecto tiene las agregaciones deshabilitadas
-- (PGRST123). El frontend NO puede sumar dinero en JavaScript (AGENTS.md), así
-- que todo total que se muestre en pantalla tiene que venir ya calculado por
-- SQL. Estas vistas son ese contrato.
--
-- Origen: ADR-005 (caja = vista, comprar tokens no es gasto del mes) y
-- docs/02-modelo-datos.md §3. Se apoyan en las vistas existentes
-- (v_cash_movements, v_account_status) y en account_status(), sin duplicar
-- reglas de negocio.
--
-- TODAS con security_invoker = true: la RLS de las tablas base se aplica con el
-- rol que consulta. Nada de datos nuevos: son solo lecturas agregadas.
--
-- No se crean índices: son agregados de historia completa por mes. Los índices
-- existentes (paid_at, spent_at, purchased_at, effective_at,
-- token_movements.renewal_id) sirven al detalle y a los rangos; un índice sobre
-- date_trunc(... AT TIME ZONE ...) no se usaría para este GROUP BY y solo
-- encarecería la escritura. Ver docs/05-sql.md §11.
--
-- Rollback (no hay down migrations, ver docs/05 §9.4):
--   drop view if exists public.v_token_summary;
--   drop view if exists public.v_customer_summary;
--   drop view if exists public.v_profit_monthly;
--   drop view if exists public.v_cash_monthly;
-- Son vistas: no contienen datos, así que borrarlas no pierde información.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- v_cash_monthly · caja por mes calendario de Lima.
-- Fuente única: v_cash_movements (ADR-005). Cada hecho aparece UNA sola vez:
--   payments        -> IN  (COBRO)
--   expenses        -> OUT (GASTO)
--   token_purchases -> OUT (COMPRA_TOKENS)
-- `token_purchases` es informativo: ya está dentro de `outflow`, no se suma
-- aparte. net = income - outflow (puede ser negativo: es un dato, no un error).
-- -----------------------------------------------------------------------------
create view public.v_cash_monthly
with (security_invoker = true)
as
with movements as (
  select
    date_trunc('month', m.occurred_at at time zone 'America/Lima')::date as month,
    m.direction,
    m.kind,
    m.amount
  from public.v_cash_movements m
)
select
  mv.month,
  coalesce(sum(mv.amount) filter (where mv.direction = 'IN'), 0)::numeric(12,2)  as income,
  coalesce(sum(mv.amount) filter (where mv.direction = 'OUT'), 0)::numeric(12,2) as outflow,
  (coalesce(sum(mv.amount) filter (where mv.direction = 'IN'), 0)
   - coalesce(sum(mv.amount) filter (where mv.direction = 'OUT'), 0))::numeric(12,2) as net,
  (count(*) filter (where mv.direction = 'IN'))::int as payments_count,
  coalesce(sum(mv.amount) filter (where mv.kind = 'COMPRA_TOKENS'), 0)::numeric(12,2) as token_purchases
from movements mv
group by mv.month;

comment on view public.v_cash_monthly is
  'Caja por mes de Lima: income (IN), outflow (OUT, incluye compras de tokens una sola vez), net, payments_count y token_purchases (informativo, ya dentro de outflow).';

-- -----------------------------------------------------------------------------
-- v_profit_monthly · rentabilidad por mes, separada de la caja.
--
-- Reglas (ADR-005):
--   · agreed_revenue    = Σ amount_agreed de renovaciones NO revertidas, por
--                         effective_at en hora de Lima.
--   · token_cost        = costo CONGELADO de los CONSUMO de esas mismas
--                         renovaciones. Comprar tokens NO entra aquí: el costo
--                         aparece cuando se consume.
--   · operating_expenses= SOLO public.expenses. Nunca token_purchases.
--   · gross_margin      = agreed_revenue - token_cost - operating_expenses.
--
-- Una renovación revertida conserva sus importes históricos y sus movimientos
-- (para auditoría), pero no participa del resultado del mes. Su REVERSION
-- devuelve los tokens y tampoco se cuenta como costo.
-- -----------------------------------------------------------------------------
create view public.v_profit_monthly
with (security_invoker = true)
as
with confirmed_renewals as (
  select
    r.id,
    date_trunc('month', r.effective_at at time zone 'America/Lima')::date as month,
    r.amount_agreed
  from public.renewals r
  where r.reversed_at is null
),
revenue_by_month as (
  select
    cr.month,
    sum(cr.amount_agreed)::numeric(12,2) as agreed_revenue
  from confirmed_renewals cr
  group by cr.month
),
token_cost_by_month as (
  select
    cr.month,
    sum(m.cost_amount)::numeric(12,2) as token_cost
  from confirmed_renewals cr
  join public.token_movements m
    on m.renewal_id = cr.id
   and m.movement_type = 'CONSUMO'
  group by cr.month
),
expenses_by_month as (
  select
    date_trunc('month', e.spent_at at time zone 'America/Lima')::date as month,
    sum(e.amount)::numeric(12,2) as operating_expenses
  from public.expenses e
  group by 1
),
months as (
  select month from revenue_by_month
  union
  select month from expenses_by_month
)
select
  mo.month,
  coalesce(rev.agreed_revenue, 0)::numeric(12,2)     as agreed_revenue,
  coalesce(tok.token_cost, 0)::numeric(12,2)         as token_cost,
  coalesce(exp.operating_expenses, 0)::numeric(12,2) as operating_expenses,
  (coalesce(rev.agreed_revenue, 0)
   - coalesce(tok.token_cost, 0)
   - coalesce(exp.operating_expenses, 0))::numeric(12,2) as gross_margin
from months mo
left join revenue_by_month    rev on rev.month = mo.month
left join token_cost_by_month tok on tok.month = mo.month
left join expenses_by_month   exp on exp.month = mo.month
order by mo.month;

comment on view public.v_profit_monthly is
  'Rentabilidad por mes: ingreso acordado de renovaciones confirmadas, costo de tokens consumidos y gastos operativos (sin compras de tokens).';

-- -----------------------------------------------------------------------------
-- v_customer_summary · agregados por cliente para el listado.
--
-- El estado se calcula SIEMPRE con public.account_status() (ADR-006): aquí no
-- se replica el CASE de umbrales, solo el orden de gravedad para elegir el peor.
--
-- Cuenta archivada: suma en accounts_total (es historial), pero NO en
-- accounts_active, ni en next_expiration, ni en worst_status.
-- worst_status = NULL cuando el cliente no tiene cuentas activas.
-- last_renewal_at = última renovación NO revertida (una revertida no renovó).
-- -----------------------------------------------------------------------------
create view public.v_customer_summary
with (security_invoker = true)
as
with account_status_calc as (
  select
    a.customer_id,
    a.archived_at,
    a.expires_at,
    public.account_status(a.expires_at, a.archived_at) as status
  from public.iptv_accounts a
),
ranked as (
  select
    s.customer_id,
    s.archived_at,
    s.expires_at,
    s.status,
    case s.status
      when 'VENCIDA' then 0
      when 'URGENTE' then 1
      when 'PROXIMA' then 2
      when 'ACTIVA'  then 3
      else 4
    end as status_rank
  from account_status_calc s
),
aggregated as (
  select
    r.customer_id,
    count(*)::int as accounts_total,
    (count(*) filter (where r.archived_at is null))::int as accounts_active,
    min(r.expires_at) filter (where r.archived_at is null) as next_expiration,
    (array_agg(r.status order by r.status_rank)
       filter (where r.archived_at is null))[1] as worst_status
  from ranked r
  group by r.customer_id
),
last_renewal as (
  select
    a.customer_id,
    max(r.effective_at) as last_renewal_at
  from public.renewals r
  join public.iptv_accounts a on a.id = r.account_id
  where r.reversed_at is null
  group by a.customer_id
)
select
  c.id          as customer_id,
  c.first_name,
  c.last_name,
  c.phone,
  c.archived_at,
  coalesce(ag.accounts_total, 0)  as accounts_total,
  coalesce(ag.accounts_active, 0) as accounts_active,
  ag.next_expiration,
  ag.worst_status,
  lr.last_renewal_at
from public.customers c
left join aggregated  ag on ag.customer_id = c.id
left join last_renewal lr on lr.customer_id = c.id;

comment on view public.v_customer_summary is
  'Totales por cliente para el listado. Estado calculado con account_status(); las cuentas archivadas no cuentan como activas.';

-- -----------------------------------------------------------------------------
-- v_token_summary · una sola fila para la tarjeta de tokens.
-- inventory_value = quantity * avg_unit_cost (valorizado al promedio vigente).
-- below_minimum = saldo por debajo del umbral configurado (estricto).
-- Si falta el singleton de token_stock o de app_settings, no devuelve filas:
-- la UI debe tratar 0 filas como "no disponible", no como saldo 0.
-- -----------------------------------------------------------------------------
create view public.v_token_summary
with (security_invoker = true)
as
select
  s.quantity,
  s.avg_unit_cost,
  round(s.quantity * s.avg_unit_cost, 2)::numeric(12,2) as inventory_value,
  st.min_token_balance as min_balance,
  (s.quantity < st.min_token_balance) as below_minimum
from public.token_stock s
join public.app_settings st on st.id = 1
where s.id = 1;

comment on view public.v_token_summary is
  'Saldo, costo promedio, valor del inventario y alerta de mínimo, calculados en SQL.';

-- -----------------------------------------------------------------------------
-- Privilegios · mismo criterio que las vistas de 0005: solo lectura y solo para
-- el rol autenticado. anon no ve nada (no hay registro público).
--
-- OJO: en Supabase, los privilegios por defecto del esquema public conceden ALL
-- sobre toda relación NUEVA a anon y authenticated. Las vistas de 0005 no lo
-- sufren porque se crearon antes del REVOKE global de 0006; estas nacen después,
-- así que hay que revocar explícitamente. Verificado en la base local: sin este
-- REVOKE, anon y authenticated quedaban con DELETE/INSERT/UPDATE/TRUNCATE.
-- No se tocan privilegios existentes.
-- -----------------------------------------------------------------------------
revoke all on
  public.v_cash_monthly,
  public.v_profit_monthly,
  public.v_customer_summary,
  public.v_token_summary
from anon, authenticated;

grant select on public.v_cash_monthly      to authenticated;
grant select on public.v_profit_monthly    to authenticated;
grant select on public.v_customer_summary  to authenticated;
grant select on public.v_token_summary     to authenticated;
