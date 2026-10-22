-- =============================================================================
-- t01 · Idempotencia de la renovación
-- -----------------------------------------------------------------------------
-- Criterio: la misma idempotency_key dos veces produce UNA renovación y UN
-- consumo de tokens, y la segunda llamada devuelve el mismo resultado sin error.
-- También comprueba que el trigger de seguimiento creó exactamente una fila.
-- =============================================================================

reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

set role authenticated;

-- Contexto: una cuenta vigente, stock comprado y un plan de 1 token.
do $$
declare
  v_customer uuid;
  v_account  uuid;
  v_plan     uuid;
  v_r1       public.renewals;
  v_r2       public.renewals;
  v_count    int;
  v_stock    int;
begin
  insert into public.customers (first_name, last_name, phone)
  values ('Ana', 'Quispe', '987654321')
  returning id into v_customer;

  insert into public.iptv_accounts (
    customer_id, external_username, purchased_at, expires_at, initial_expires_at
  ) values (
    v_customer, 'ana.iptv', now() - interval '20 days', now() + interval '10 days', now() + interval '10 days'
  )
  returning id into v_account;

  select id into v_plan from public.plans where key = '1M_3D';

  perform public.rpc_purchase_tokens(
    5, 25.00, now(), 'Proveedor', 'REF-1', null,
    'aaaaaaaa-0000-0000-0000-000000000001'::uuid
  );

  -- Primer clic.
  v_r1 := public.rpc_register_renewal(
    p_account_id      => v_account,
    p_plan_id         => v_plan,
    p_operation_type  => 'RENOVACION',
    p_effective_at    => now(),
    p_new_expiration  => public.add_months(now() + interval '10 days', 1),
    p_amount_agreed   => 15.00,
    p_tokens_used     => 1,
    p_notes           => 'renovación de prueba',
    p_idempotency_key => 'bbbbbbbb-0000-0000-0000-000000000001'::uuid
  );

  -- Segundo clic (reintento): misma clave, mismos datos.
  v_r2 := public.rpc_register_renewal(
    p_account_id      => v_account,
    p_plan_id         => v_plan,
    p_operation_type  => 'RENOVACION',
    p_effective_at    => now(),
    p_new_expiration  => public.add_months(now() + interval '10 days', 1),
    p_amount_agreed   => 15.00,
    p_tokens_used     => 1,
    p_notes           => 'renovación de prueba',
    p_idempotency_key => 'bbbbbbbb-0000-0000-0000-000000000001'::uuid
  );

  if v_r1.id is null then
    raise exception 'FALLO: la primera llamada no devolvió renovación';
  end if;
  if v_r2.id is distinct from v_r1.id then
    raise exception 'FALLO: el reintento devolvió otra renovación (% vs %)', v_r1.id, v_r2.id;
  end if;

  select count(*) into v_count
    from public.renewals
   where idempotency_key = 'bbbbbbbb-0000-0000-0000-000000000001';
  if v_count <> 1 then
    raise exception 'FALLO: se esperaba 1 renovación, hay %', v_count;
  end if;

  select count(*) into v_count
    from public.token_movements
   where renewal_id = v_r1.id and movement_type = 'CONSUMO';
  if v_count <> 1 then
    raise exception 'FALLO: se esperaba 1 movimiento de consumo, hay %', v_count;
  end if;

  -- 5 comprados - 1 consumido = 4 (no 3: el reintento no volvió a consumir).
  select quantity into v_stock from public.token_stock where id = 1;
  if v_stock <> 4 then
    raise exception 'FALLO: stock esperado 4, quedó %', v_stock;
  end if;

  -- El trigger de alta creó exactamente un seguimiento.
  select count(*) into v_count
    from public.renewal_followups
   where account_id = v_account;
  if v_count <> 1 then
    raise exception 'FALLO: se esperaba 1 fila de seguimiento, hay %', v_count;
  end if;

  if not exists (
    select 1 from public.renewal_followups
     where account_id = v_account and status = 'PENDIENTE'
  ) then
    raise exception 'FALLO: el seguimiento no nació en PENDIENTE';
  end if;
end $$;

reset role;
