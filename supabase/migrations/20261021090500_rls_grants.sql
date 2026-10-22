-- =============================================================================
-- 0006 · RLS y privilegios
-- -----------------------------------------------------------------------------
-- Origen: docs/02-modelo-datos.md §5 + ADR-008.
--
-- Modelo de seguridad: un solo rol de aplicación (`authenticated`) y una sola
-- pregunta de autorización (`is_admin()`). La RLS no distingue tenants porque no
-- hay tenants: hay un administrador.
--
-- Doble barrera sobre las tablas críticas:
--   1. GRANT: authenticated NO tiene INSERT/UPDATE/DELETE (falla con 42501).
--   2. RLS: aunque se concediera el privilegio, no hay política de escritura.
-- =============================================================================

alter table public.profiles          enable row level security;
alter table public.app_settings      enable row level security;
alter table public.customers         enable row level security;
alter table public.iptv_accounts     enable row level security;
alter table public.plans             enable row level security;
alter table public.renewals          enable row level security;
alter table public.payments          enable row level security;
alter table public.expenses          enable row level security;
alter table public.token_purchases   enable row level security;
alter table public.token_stock       enable row level security;
alter table public.token_movements   enable row level security;
alter table public.renewal_followups enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.contact_logs      enable row level security;
alter table public.audit_log         enable row level security;

-- -----------------------------------------------------------------------------
-- Políticas
-- -----------------------------------------------------------------------------

-- profiles · se leen todas (para mostrar autoría) pero solo se edita el propio
-- display_name, y solo esa columna (GRANT por columna).
create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.is_admin());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- app_settings · lectura y edición del singleton; los CHECK validan el rango.
create policy app_settings_select_admin on public.app_settings
  for select to authenticated
  using (public.is_admin());

create policy app_settings_update_admin on public.app_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Maestros editables desde la UI.
create policy customers_manage_admin on public.customers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy iptv_accounts_manage_admin on public.iptv_accounts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy plans_manage_admin on public.plans
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy whatsapp_templates_manage_admin on public.whatsapp_templates
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- expenses · gasto operativo simple: no tiene RPC ni invariantes cruzadas, así
-- que se edita directo (sigue validado por tipos, CHECK y auditoría de cambios
-- vía updated_at).
create policy expenses_manage_admin on public.expenses
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Tablas críticas: SOLO lectura. Sin política de INSERT/UPDATE/DELETE, cualquier
-- intento de escritura es rechazado aunque alguien concediera el privilegio.
create policy renewals_select_admin on public.renewals
  for select to authenticated using (public.is_admin());

create policy payments_select_admin on public.payments
  for select to authenticated using (public.is_admin());

create policy token_purchases_select_admin on public.token_purchases
  for select to authenticated using (public.is_admin());

create policy token_stock_select_admin on public.token_stock
  for select to authenticated using (public.is_admin());

create policy token_movements_select_admin on public.token_movements
  for select to authenticated using (public.is_admin());

create policy renewal_followups_select_admin on public.renewal_followups
  for select to authenticated using (public.is_admin());

create policy contact_logs_select_admin on public.contact_logs
  for select to authenticated using (public.is_admin());

create policy audit_log_select_admin on public.audit_log
  for select to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- Privilegios · se parte de cero y se concede lo mínimo.
-- (En Supabase, los privilegios por defecto del esquema public conceden ALL a
-- anon y authenticated; por eso el REVOKE explícito es obligatorio.)
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

-- Lectura para el panel.
grant select on
  public.profiles,
  public.app_settings,
  public.customers,
  public.iptv_accounts,
  public.plans,
  public.expenses,
  public.renewals,
  public.payments,
  public.token_purchases,
  public.token_stock,
  public.token_movements,
  public.renewal_followups,
  public.whatsapp_templates,
  public.contact_logs,
  public.audit_log
to authenticated;

-- Escritura directa permitida solo en maestros y gastos.
-- customers e iptv_accounts NO llevan DELETE: la regla 9 exige archivar
-- (archived_at), no borrar. Sin el privilegio, un bug de UI no puede destruir
-- historial ni arrastrar en cascada renewal_followups.
grant insert, update on public.customers     to authenticated;
grant insert, update on public.iptv_accounts to authenticated;
grant insert, update, delete on public.plans              to authenticated;
grant insert, update, delete on public.whatsapp_templates to authenticated;
grant insert, update, delete on public.expenses           to authenticated;

-- profiles · únicamente el nombre visible de la propia fila.
grant update (display_name) on public.profiles to authenticated;

-- app_settings · el singleton se corrige desde configuración.
grant update on public.app_settings to authenticated;

-- Vistas (security_invoker: la RLS de las tablas base se aplica igual).
grant select on public.v_account_status  to authenticated;
grant select on public.v_cash_movements  to authenticated;
grant select on public.v_renewal_summary to authenticated;

-- anon no ve nada: sin registro público, sin acceso anónimo.
