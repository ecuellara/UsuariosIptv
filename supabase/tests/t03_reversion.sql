-- =============================================================================
-- t03 · Reversión de una renovación
-- -----------------------------------------------------------------------------
-- Criterios:
--   · los tokens vuelven al COSTO CONGELADO original, no al promedio vigente
--   · expires_at vuelve al valor anterior (initial_expires_at si no queda
--     ninguna renovación confirmada)
--   · los pagos quedan intactos
--   · revertir dos veces no duplica la devolución
-- =============================================================================

reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

set role authenticated;

do $$
declare
  v_customer uuid;
  v_account  uuid;
  v_plan     uuid;
  v_initial  timestamptz;
  v_renewal  public.renewals;
  v_again    public.renewals;
  v_stock    public.token_stock;
  v_mov      public.token_movements;
  v_paid     numeric(12,2);
  v_count    int;
begin
  insert into public.customers (first_name, last_name, phone)
  values ('María', 'Flores', '998877665')
  returning id into v_customer;

  v_initial := now() + interval '8 days';
  insert into public.iptv_accounts (
    customer_id, external_username, purchased_at, expires_at, initial_expires_at
  ) values (
    v_customer, 'maria.iptv', now() - interval '22 days', v_initial, v_initial
  )
  returning id into v_account;

  select id into v_plan from public.plans where key = '1M_3D';

  -- Inventario inicial: 3 tokens a S/ 10.00 cada uno.
  perform public.rpc_purchase_tokens(
    3, 30.00, now(), null, null, null, 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  );

  v_renewal := public.rpc_register_renewal(
    p_account_id      => v_account,
    p_plan_id         => v_plan,
    p_operation_type  => 'RENOVACION',
    p_effective_at    => now(),
    p_new_expiration  => public.add_months(v_initial, 1),
    p_amount_agreed   => 15.00,
    p_tokens_used     => 1,
    p_notes           => null,
    p_idempotency_key => 'bbbbbbbb-0000-0000-0000-000000000003'::uuid
  );

  -- Se cobra parte del servicio.
  perform public.rpc_record_payment(
    v_renewal.id, 5.00, 'YAPE', now(), 'YP-1', null,
    'cccccccc-0000-0000-0000-000000000003'::uuid
  );

  -- Entra mercancía más cara: el promedio sube a (2*10 + 2*20) / 4 = 15.
  perform public.rpc_purchase_tokens(
    2, 40.00, now(), null, null, null, 'aaaaaaaa-0000-0000-0000-000000000004'::uuid
  );

  select * into v_stock from public.token_stock where id = 1;
  if v_stock.quantity <> 4 then
    raise exception 'FALLO: stock previo a la reversión esperado 4, hay %', v_stock.quantity;
  end if;
  if v_stock.avg_unit_cost <> 15.000000 then
    raise exception 'FALLO: promedio previo esperado 15.000000, es %', v_stock.avg_unit_cost;
  end if;

  v_renewal := public.rpc_reverse_renewal(
    v_renewal.id, 'el proveedor no aplicó la renovación',
    'dddddddd-0000-0000-0000-000000000003'::uuid
  );

  if v_renewal.reversed_at is null then
    raise exception 'FALLO: la renovación no quedó marcada como revertida';
  end if;
  if v_renewal.reversal_reason is null then
    raise exception 'FALLO: la reversión no guardó motivo';
  end if;

  -- Tokens devueltos.
  select * into v_stock from public.token_stock where id = 1;
  if v_stock.quantity <> 5 then
    raise exception 'FALLO: stock tras reversión esperado 5, hay %', v_stock.quantity;
  end if;
  -- El promedio NO cambia: el consumo tampoco lo había movido.
  if v_stock.avg_unit_cost <> 15.000000 then
    raise exception 'FALLO: el promedio cambió a % (no debía moverse)', v_stock.avg_unit_cost;
  end if;

  select * into v_mov
    from public.token_movements
   where renewal_id = v_renewal.id and movement_type = 'REVERSION';
  if not found then
    raise exception 'FALLO: no se creó el movimiento de reversión';
  end if;
  if v_mov.quantity_delta <> 1 then
    raise exception 'FALLO: tokens devueltos esperados 1, son %', v_mov.quantity_delta;
  end if;
  -- Costo congelado del consumo original (10.00), no el promedio actual (15.00).
  if v_mov.unit_cost <> 10.000000 then
    raise exception 'FALLO: costo unitario devuelto % (esperado 10.000000)', v_mov.unit_cost;
  end if;
  if v_mov.cost_amount <> 10.00 then
    raise exception 'FALLO: importe devuelto % (esperado 10.00)', v_mov.cost_amount;
  end if;

  -- Vencimiento restaurado al valor anterior.
  if (select expires_at from public.iptv_accounts where id = v_account) <> v_initial then
    raise exception 'FALLO: expires_at no volvió al valor anterior';
  end if;

  -- Pagos intactos.
  select count(*), coalesce(sum(amount), 0) into v_count, v_paid
    from public.payments where renewal_id = v_renewal.id;
  if v_count <> 1 or v_paid <> 5.00 then
    raise exception 'FALLO: los pagos cambiaron (% filas, total %)', v_count, v_paid;
  end if;

  -- Segunda reversión: idempotente, sin devolver tokens otra vez.
  v_again := public.rpc_reverse_renewal(v_renewal.id, 'repetición del reintento', null);
  if v_again.id is distinct from v_renewal.id then
    raise exception 'FALLO: la segunda reversión devolvió otra fila';
  end if;
  select count(*) into v_count
    from public.token_movements
   where renewal_id = v_renewal.id and movement_type = 'REVERSION';
  if v_count <> 1 then
    raise exception 'FALLO: se duplicó la devolución de tokens (% movimientos)', v_count;
  end if;
  if (select quantity from public.token_stock where id = 1) <> 5 then
    raise exception 'FALLO: el stock cambió al reintentar la reversión';
  end if;
end $$;

reset role;
