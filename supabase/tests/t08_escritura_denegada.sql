-- =============================================================================
-- t08 · El rol authenticated no puede escribir tablas críticas
-- -----------------------------------------------------------------------------
-- Criterio (ADR-008): renewals, payments, token_*, audit_log y contact_logs solo
-- se leen. La escritura directa debe fallar por privilegios, incluso siendo
-- administrador (is_admin() = true).
-- =============================================================================

reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

set role authenticated;

do $$
declare
  v_admin_ok boolean;
  v_count    int;
begin
  -- Confirmamos que la sesión SÍ es administradora: si fallara por falta de
  -- sesión, la prueba no demostraría nada.
  v_admin_ok := public.is_admin();
  if v_admin_ok is not true then
    raise exception 'FALLO: la sesión de prueba no es administradora';
  end if;

  -- Y que la lectura sí funciona.
  select count(*) into v_count from public.renewals;
  if v_count is null then
    raise exception 'FALLO: el administrador no puede leer renewals';
  end if;
end $$;

-- INSERT directo en renewals.
do $$
begin
  insert into public.renewals (
    account_id, plan_id, operation_type, plan_name, duration_months, devices,
    price_snapshot, amount_agreed, tokens_used, new_expiration, effective_at, idempotency_key
  ) values (
    gen_random_uuid(), gen_random_uuid(), 'RENOVACION', 'x', 1, 1,
    0, 0, 0, now(), now(), gen_random_uuid()
  );
  raise exception 'FALLO: INSERT directo en renewals fue permitido';
exception
  when insufficient_privilege then null;   -- comportamiento esperado
end $$;

-- INSERT en payments.
do $$
begin
  insert into public.payments (renewal_id, amount, method, paid_at, idempotency_key)
  values (gen_random_uuid(), 10, 'YAPE', now(), gen_random_uuid());
  raise exception 'FALLO: INSERT directo en payments fue permitido';
exception
  when insufficient_privilege then null;
end $$;

-- INSERT en token_movements.
do $$
begin
  insert into public.token_movements (movement_type, quantity_delta, unit_cost, cost_amount, idempotency_key)
  values ('AJUSTE', 1, 0, 0, gen_random_uuid());
  raise exception 'FALLO: INSERT directo en token_movements fue permitido';
exception
  when insufficient_privilege then null;
end $$;

-- INSERT en token_purchases.
do $$
begin
  insert into public.token_purchases (quantity, total_cost, purchased_at, idempotency_key)
  values (1, 1, now(), gen_random_uuid());
  raise exception 'FALLO: INSERT directo en token_purchases fue permitido';
exception
  when insufficient_privilege then null;
end $$;

-- UPDATE de token_stock.
do $$
begin
  update public.token_stock set quantity = 999 where id = 1;
  raise exception 'FALLO: UPDATE directo en token_stock fue permitido';
exception
  when insufficient_privilege then null;
end $$;

-- INSERT en audit_log.
do $$
begin
  insert into public.audit_log (action, entity) values ('FAKE', 'renewals');
  raise exception 'FALLO: INSERT directo en audit_log fue permitido';
exception
  when insufficient_privilege then null;
end $$;

-- INSERT en contact_logs.
do $$
begin
  insert into public.contact_logs (customer_id, event_type)
  values (gen_random_uuid(), 'ENLACE_ABIERTO');
  raise exception 'FALLO: INSERT directo en contact_logs fue permitido';
exception
  when insufficient_privilege then null;
end $$;

-- UPDATE de renewal para cambiar el acuerdo de precio.
do $$
begin
  update public.renewals set amount_agreed = 0;
  raise exception 'FALLO: UPDATE directo en renewals fue permitido';
exception
  when insufficient_privilege then null;
end $$;

-- DELETE de audit_log (la bitácora no se borra).
do $$
begin
  delete from public.audit_log;
  raise exception 'FALLO: DELETE directo en audit_log fue permitido';
exception
  when insufficient_privilege then null;
end $$;

-- Los maestros SÍ se pueden escribir (si no, el panel no podría dar de alta).
do $$
declare
  v_id uuid;
begin
  insert into public.customers (first_name, last_name, phone)
  values ('Prueba', 'Permisos', '900000001')
  returning id into v_id;

  if v_id is null then
    raise exception 'FALLO: el administrador no pudo crear un cliente';
  end if;

  update public.customers set notes = 'actualizado' where id = v_id;
end $$;

-- Pero NO se pueden borrar: la regla 9 exige archivar (archived_at).
do $$
begin
  delete from public.customers;
  raise exception 'FALLO: DELETE directo en customers fue permitido';
exception
  when insufficient_privilege then null;
end $$;

do $$
begin
  delete from public.iptv_accounts;
  raise exception 'FALLO: DELETE directo en iptv_accounts fue permitido';
exception
  when insufficient_privilege then null;
end $$;

-- Privilegios efectivos: la barrera de GRANT debe estar puesta, no solo la RLS.
do $$
declare
  v_tabla text;
  v_perm  text;
begin
  foreach v_tabla in array array[
    'renewals', 'payments', 'token_purchases', 'token_stock',
    'token_movements', 'audit_log', 'contact_logs'
  ] loop
    foreach v_perm in array array['INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('authenticated', 'public.' || v_tabla, v_perm) then
        raise exception 'FALLO: authenticated conserva % sobre %', v_perm, v_tabla;
      end if;
    end loop;
    if not has_table_privilege('authenticated', 'public.' || v_tabla, 'SELECT') then
      raise exception 'FALLO: authenticated no puede leer %', v_tabla;
    end if;
  end loop;

  -- Los maestros sí deben ser escribibles, pero sin DELETE (regla 9: archivar).
  if not has_table_privilege('authenticated', 'public.customers', 'INSERT') then
    raise exception 'FALLO: authenticated no puede crear clientes';
  end if;
  if has_table_privilege('authenticated', 'public.customers', 'DELETE') then
    raise exception 'FALLO: authenticated conserva DELETE sobre customers';
  end if;
  if has_table_privilege('authenticated', 'public.iptv_accounts', 'DELETE') then
    raise exception 'FALLO: authenticated conserva DELETE sobre iptv_accounts';
  end if;
end $$;

-- Y toda tabla de public debe tener RLS activa.
do $$
declare
  v_sin_rls int;
begin
  select count(*) into v_sin_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relrowsecurity = false;

  if v_sin_rls <> 0 then
    raise exception 'FALLO: % tabla(s) de public sin RLS activa', v_sin_rls;
  end if;
end $$;

reset role;

-- anon no tiene acceso a nada (el panel no se expone sin sesión).
set role anon;

do $$
begin
  perform count(*) from public.renewals;
  raise exception 'FALLO: anon pudo leer renewals';
exception
  when insufficient_privilege then null;
end $$;

do $$
begin
  perform count(*) from public.v_account_status;
  raise exception 'FALLO: anon pudo leer v_account_status';
exception
  when insufficient_privilege then null;
end $$;

reset role;
