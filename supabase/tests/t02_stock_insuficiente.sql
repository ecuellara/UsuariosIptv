-- =============================================================================
-- t02 · Consumo mayor al stock
-- -----------------------------------------------------------------------------
-- Criterio: la operación se rechaza y no deja NADA escrito (renovación,
-- movimiento de consumo ni cambio de stock o de vencimiento).
-- =============================================================================

reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

set role authenticated;

do $$
declare
  v_customer    uuid;
  v_account     uuid;
  v_plan        uuid;
  v_expires     timestamptz;
  v_expires_ini timestamptz;
  v_stock       int;
  v_renewals    int;
  v_moves       int;
  v_msg         text;
  v_raised      boolean := false;
begin
  insert into public.customers (first_name, last_name, phone)
  values ('Luis', 'Rojas', '912345678')
  returning id into v_customer;

  v_expires := now() + interval '5 days';
  insert into public.iptv_accounts (
    customer_id, external_username, purchased_at, expires_at, initial_expires_at
  ) values (
    v_customer, 'luis.iptv', now() - interval '25 days', v_expires, v_expires
  )
  returning id into v_account;

  select id into v_plan from public.plans where key = '3M_3D';

  -- Solo 2 tokens en inventario...
  perform public.rpc_purchase_tokens(
    2, 20.00, now(), null, null, null, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
  );

  -- ...y se intenta renovar consumiendo 5.
  begin
    perform public.rpc_register_renewal(
      p_account_id      => v_account,
      p_plan_id         => v_plan,
      p_operation_type  => 'RENOVACION',
      p_effective_at    => now(),
      p_new_expiration  => now() + interval '3 months',
      p_amount_agreed   => 40.00,
      p_tokens_used     => 5,
      p_notes           => null,
      p_idempotency_key => 'bbbbbbbb-0000-0000-0000-000000000002'::uuid
    );
  exception when others then
    v_raised := true;
    v_msg := sqlerrm;
  end;

  if not v_raised then
    raise exception 'FALLO: el consumo mayor al stock no fue rechazado';
  end if;
  if v_msg not like 'STOCK_INSUFICIENTE%' then
    raise exception 'FALLO: mensaje inesperado: %', v_msg;
  end if;

  select count(*) into v_renewals
    from public.renewals
   where idempotency_key = 'bbbbbbbb-0000-0000-0000-000000000002';
  if v_renewals <> 0 then
    raise exception 'FALLO: quedó una renovación escrita (%)', v_renewals;
  end if;

  select count(*) into v_moves
    from public.token_movements
   where movement_type = 'CONSUMO';
  if v_moves <> 0 then
    raise exception 'FALLO: quedó un consumo escrito (%)', v_moves;
  end if;

  select quantity into v_stock from public.token_stock where id = 1;
  if v_stock <> 2 then
    raise exception 'FALLO: el stock cambió a % (esperado 2)', v_stock;
  end if;

  select expires_at, initial_expires_at into v_expires, v_expires_ini
    from public.iptv_accounts where id = v_account;
  if v_expires is distinct from v_expires_ini then
    raise exception 'FALLO: el vencimiento se modificó pese al rechazo';
  end if;
end $$;

reset role;
