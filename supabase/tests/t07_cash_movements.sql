-- =============================================================================
-- t07 · Caja sin doble conteo
-- -----------------------------------------------------------------------------
-- Criterio (ADR-005, docs/03-plan.md #5): comprar tokens aparece UNA sola vez en
-- v_cash_movements, con dirección OUT, y NO crea ninguna fila equivalente en
-- expenses.
-- =============================================================================

reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

set role authenticated;

do $$
declare
  v_customer  uuid;
  v_account   uuid;
  v_plan      uuid;
  v_renewal   public.renewals;
  v_expense   uuid;
  v_count     int;
  v_in        numeric(12,2);
  v_out       numeric(12,2);
begin
  -- Compra de 4 tokens por S/ 40.00.
  perform public.rpc_purchase_tokens(
    4, 40.00, '2026-05-10 09:00:00-05', 'Proveedor', 'F001-123', 'compra de prueba',
    'aaaaaaaa-0000-0000-0000-000000000007'::uuid
  );

  select count(*) into v_count
    from public.v_cash_movements
   where kind = 'COMPRA_TOKENS';
  if v_count <> 1 then
    raise exception 'FALLO: la compra de tokens aparece % veces (esperado 1)', v_count;
  end if;

  if not exists (
    select 1 from public.v_cash_movements
     where kind = 'COMPRA_TOKENS' and direction = 'OUT' and amount = 40.00
  ) then
    raise exception 'FALLO: la compra de tokens no está como OUT por 40.00';
  end if;

  -- No existe fila espejo en expenses.
  select count(*) into v_count from public.expenses;
  if v_count <> 0 then
    raise exception 'FALLO: la compra de tokens creó % fila(s) en expenses', v_count;
  end if;

  -- Un gasto real y un cobro sí entran, cada uno con su dirección.
  insert into public.expenses (category, amount, spent_at, description)
  values ('PUBLICIDAD', 12.00, '2026-05-11 10:00:00-05', 'Pauta en redes')
  returning id into v_expense;

  insert into public.customers (first_name, last_name, phone)
  values ('Elena', 'Cruz', '977665544')
  returning id into v_customer;

  insert into public.iptv_accounts (customer_id, external_username, purchased_at, expires_at, initial_expires_at)
  values (v_customer, 'elena.iptv', now() - interval '40 days', now() + interval '20 days', now() + interval '20 days')
  returning id into v_account;

  select id into v_plan from public.plans where key = '1M_3D';

  v_renewal := public.rpc_register_renewal(
    p_account_id      => v_account,
    p_plan_id         => v_plan,
    p_operation_type  => 'RENOVACION',
    p_effective_at    => now(),
    p_new_expiration  => now() + interval '1 month',
    p_amount_agreed   => 15.00,
    p_tokens_used     => 1,
    p_notes           => null,
    p_idempotency_key => 'bbbbbbbb-0000-0000-0000-000000000007'::uuid
  );

  perform public.rpc_record_payment(
    v_renewal.id, 15.00, 'YAPE', now(), null, null,
    'cccccccc-0000-0000-0000-000000000007'::uuid
  );

  select coalesce(sum(amount) filter (where direction = 'IN'), 0),
         coalesce(sum(amount) filter (where direction = 'OUT'), 0)
    into v_in, v_out
    from public.v_cash_movements;

  if v_in <> 15.00 then
    raise exception 'FALLO: entradas de caja esperadas 15.00, hay %', v_in;
  end if;
  -- 40 de tokens + 12 de publicidad. Si la compra estuviera duplicada serían 92.
  if v_out <> 52.00 then
    raise exception 'FALLO: salidas de caja esperadas 52.00, hay %', v_out;
  end if;

  -- Cada hecho exactamente una vez.
  select count(*) into v_count from public.v_cash_movements;
  if v_count <> 3 then
    raise exception 'FALLO: se esperaban 3 movimientos de caja, hay %', v_count;
  end if;

  -- Y el total no cuadra con un doble egreso.
  if (select count(*) from public.expenses where category = 'OPERATIVO' and amount = 40.00) > 0 then
    raise exception 'FALLO: existe un gasto con el importe de la compra de tokens';
  end if;

  -- El gasto se edita y se borra directo (es un maestro), pero deja auditoría:
  -- AGENTS.md exige rastro en todo movimiento de dinero.
  update public.expenses set amount = 13.00, description = 'Pauta en redes (corregido)'
   where id = v_expense;
  delete from public.expenses where id = v_expense;

  select count(*) into v_count
    from public.audit_log
   where entity = 'expenses' and action = 'EXPENSE_CREATED';
  if v_count <> 1 then
    raise exception 'FALLO: el alta del gasto no quedó auditada (% filas)', v_count;
  end if;

  select count(*) into v_count
    from public.audit_log
   where entity = 'expenses' and action = 'EXPENSE_UPDATED';
  if v_count <> 1 then
    raise exception 'FALLO: la edición del gasto no quedó auditada (% filas)', v_count;
  end if;

  select count(*) into v_count
    from public.audit_log
   where entity = 'expenses' and action = 'EXPENSE_DELETED';
  if v_count <> 1 then
    raise exception 'FALLO: el borrado del gasto no quedó auditado (% filas)', v_count;
  end if;
end $$;

reset role;
