-- =============================================================================
-- t04 · Un pago no puede exceder amount_agreed
-- -----------------------------------------------------------------------------
-- Criterio: admitir pagos parciales, rechazar cualquier suma que supere lo
-- acordado y no dejar filas escritas cuando se rechaza (invariante 6 de
-- docs/03-plan.md).
-- =============================================================================

reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

set role authenticated;

do $$
declare
  v_customer uuid;
  v_account  uuid;
  v_plan     uuid;
  v_renewal  public.renewals;
  v_count    int;
  v_total    numeric(12,2);
  v_msg      text;
  v_raised   boolean;
begin
  insert into public.customers (first_name, last_name, phone)
  values ('Jorge', 'Salas', '955443322')
  returning id into v_customer;

  insert into public.iptv_accounts (
    customer_id, external_username, purchased_at, expires_at, initial_expires_at
  ) values (
    v_customer, 'jorge.iptv', now() - interval '40 days', now() + interval '2 days', now() + interval '2 days'
  )
  returning id into v_account;

  select id into v_plan from public.plans where key = '1M_1D';

  v_renewal := public.rpc_register_renewal(
    p_account_id      => v_account,
    p_plan_id         => v_plan,
    p_operation_type  => 'RENOVACION',
    p_effective_at    => now(),
    p_new_expiration  => now() + interval '1 month',
    p_amount_agreed   => 15.00,
    p_tokens_used     => 0,
    p_notes           => null,
    p_idempotency_key => 'bbbbbbbb-0000-0000-0000-000000000004'::uuid
  );

  -- Pago parcial válido.
  perform public.rpc_record_payment(
    v_renewal.id, 10.00, 'PLIN', now(), null, null,
    'cccccccc-0000-0000-0000-000000000041'::uuid
  );

  -- Exceso: 10 + 6 > 15.
  v_raised := false;
  begin
    perform public.rpc_record_payment(
      v_renewal.id, 6.00, 'EFECTIVO', now(), null, null,
      'cccccccc-0000-0000-0000-000000000042'::uuid
    );
  exception when others then
    v_raised := true;
    v_msg := sqlerrm;
  end;

  if not v_raised then
    raise exception 'FALLO: el sobrepago fue aceptado';
  end if;
  if v_msg not like 'PAGO_EXCEDE_MONTO_ACORDADO%' then
    raise exception 'FALLO: mensaje inesperado: %', v_msg;
  end if;

  select count(*), coalesce(sum(amount), 0) into v_count, v_total
    from public.payments where renewal_id = v_renewal.id;
  if v_count <> 1 or v_total <> 10.00 then
    raise exception 'FALLO: el pago rechazado dejó rastro (% filas, total %)', v_count, v_total;
  end if;

  -- Completar exactamente lo acordado sí se permite.
  perform public.rpc_record_payment(
    v_renewal.id, 5.00, 'EFECTIVO', now(), null, null,
    'cccccccc-0000-0000-0000-000000000043'::uuid
  );

  select coalesce(sum(amount), 0) into v_total
    from public.payments where renewal_id = v_renewal.id;
  if v_total <> 15.00 then
    raise exception 'FALLO: se esperaba 15.00 pagado, hay %', v_total;
  end if;

  -- Un céntimo más vuelve a ser exceso.
  v_raised := false;
  begin
    perform public.rpc_record_payment(
      v_renewal.id, 0.01, 'OTRO', now(), null, null,
      'cccccccc-0000-0000-0000-000000000044'::uuid
    );
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FALLO: se aceptó un céntimo por encima de lo acordado';
  end if;

  -- El pendiente derivado cuadra al céntimo.
  if (select amount_pending from public.v_renewal_summary where id = v_renewal.id) <> 0.00 then
    raise exception 'FALLO: el pendiente derivado no es 0.00';
  end if;
end $$;

reset role;
