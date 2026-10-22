-- =============================================================================
-- 0004 · Funciones base y triggers
-- -----------------------------------------------------------------------------
-- · is_admin()      · autorización única del panel (SECURITY DEFINER).
-- · account_status()· cálculo de vigencia aislado y determinista (ADR-006).
-- · add_months()    · suma de meses calendario con ajuste a fin de mes (ADR-007).
-- · updated_at      · trigger común.
-- · followup        · alta automática del seguimiento al crear la cuenta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- is_admin() · SECURITY DEFINER para que las políticas RLS no se llamen a sí
-- mismas (recursión sobre profiles) y para no depender de los privilegios del
-- rol que consulta. search_path fijo = evita secuestro de esquema.
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
  );
$$;

comment on function public.is_admin() is
  'true si auth.uid() tiene fila en profiles. Única fuente de autorización.';

revoke all on function public.is_admin() from public;

-- -----------------------------------------------------------------------------
-- account_status() · ÚNICA implementación del cálculo de vigencia.
-- Determinista respecto de p_at: las pruebas fijan el instante y no dependen
-- del reloj. Los umbrales salen de app_settings (3 y 7 por defecto); si la fila
-- singleton no existiera, se usan esos mismos valores.
--
-- Orden de precedencia: ARCHIVADA > VENCIDA (instante real) > días calendario
-- de Lima. days_left = 0 (vence hoy pero aún no llegó la hora) => URGENTE.
-- -----------------------------------------------------------------------------
create or replace function public.account_status(
  p_expires_at  timestamptz,
  p_archived_at timestamptz,
  p_at          timestamptz default now()
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when p_archived_at is not null then 'ARCHIVADA'
           when p_at >= p_expires_at then 'VENCIDA'
           when d.days_left <= coalesce(s.urgent_days, 3) then 'URGENTE'
           when d.days_left <= coalesce(s.warning_days, 7) then 'PROXIMA'
           else 'ACTIVA'
         end
  from (
    select (p_expires_at at time zone 'America/Lima')::date
         - (p_at at time zone 'America/Lima')::date as days_left
  ) d
  left join public.app_settings s on s.id = 1;
$$;

comment on function public.account_status(timestamptz, timestamptz, timestamptz) is
  'Estado de vigencia (ARCHIVADA/VENCIDA/URGENTE/PROXIMA/ACTIVA). Firma pública para el frontend.';

revoke all on function public.account_status(timestamptz, timestamptz, timestamptz) from public;

-- -----------------------------------------------------------------------------
-- add_months() · suma de meses calendario sobre el reloj de Lima.
-- Se opera en hora local (sin zona) y se vuelve a timestamptz: así "31 ene 20:00"
-- + 1 mes cae en "28 feb 20:00" y no se corre un día por el desfase UTC-5.
-- Postgres ajusta al último día del mes destino (31 ene + 1 = 28/29 feb).
-- -----------------------------------------------------------------------------
create or replace function public.add_months(p_ts timestamptz, p_months integer)
returns timestamptz
language sql
stable
as $$
  select ((p_ts at time zone 'America/Lima') + make_interval(months => p_months))
         at time zone 'America/Lima';
$$;

comment on function public.add_months(timestamptz, integer) is
  'Suma meses calendario con ajuste a fin de mes, en hora de America/Lima.';

revoke all on function public.add_months(timestamptz, integer) from public;

-- -----------------------------------------------------------------------------
-- updated_at · un solo trigger reutilizable.
-- -----------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.tg_set_updated_at();

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.tg_set_updated_at();

create trigger iptv_accounts_set_updated_at
  before update on public.iptv_accounts
  for each row execute function public.tg_set_updated_at();

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.tg_set_updated_at();

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.tg_set_updated_at();

create trigger token_stock_set_updated_at
  before update on public.token_stock
  for each row execute function public.tg_set_updated_at();

create trigger renewal_followups_set_updated_at
  before update on public.renewal_followups
  for each row execute function public.tg_set_updated_at();

create trigger whatsapp_templates_set_updated_at
  before update on public.whatsapp_templates
  for each row execute function public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- Alta automática del seguimiento. La cuenta y su fila de seguimiento nacen
-- juntas: así la vista nunca tiene que hacer LEFT JOIN defensivo.
-- -----------------------------------------------------------------------------
create or replace function public.tg_create_renewal_followup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.renewal_followups (account_id)
  values (new.id)
  on conflict (account_id) do nothing;
  return new;
end;
$$;

create trigger iptv_accounts_create_followup
  after insert on public.iptv_accounts
  for each row execute function public.tg_create_renewal_followup();

-- -----------------------------------------------------------------------------
-- Auditoría de gastos. `expenses` es la única tabla con dinero que se escribe
-- directo desde el panel (docs/02 §5); AGENTS.md exige que todo movimiento de
-- dinero quede auditado, así que el rastro se deja por trigger en vez de por RPC.
-- No valida nada: solo registra quién cambió qué.
-- -----------------------------------------------------------------------------
create or replace function public.tg_audit_expenses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (
    auth.uid(),
    case tg_op
      when 'INSERT' then 'EXPENSE_CREATED'
      when 'UPDATE' then 'EXPENSE_UPDATED'
      else 'EXPENSE_DELETED'
    end,
    'expenses',
    coalesce(new.id, old.id),
    jsonb_build_object(
      'category', coalesce(new.category, old.category),
      'amount_before', case when tg_op <> 'INSERT' then old.amount end,
      'amount_after', case when tg_op <> 'DELETE' then new.amount end,
      'spent_at', coalesce(new.spent_at, old.spent_at),
      'description', coalesce(new.description, old.description)
    )
  );
  -- AFTER trigger: el valor de retorno se ignora.
  return null;
end;
$$;

create trigger expenses_audit
  after insert or update or delete on public.expenses
  for each row execute function public.tg_audit_expenses();
