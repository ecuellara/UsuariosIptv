-- =============================================================================
-- t09 · El saldo materializado cuadra con el libro mayor
-- -----------------------------------------------------------------------------
-- Criterio (ADR-004): token_stock.quantity es el saldo de lectura y debe ser
-- exactamente SUM(token_movements.quantity_delta) después de comprar, consumir,
-- revertir y ajustar por lotes.
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
  v_stock    int;
  v_ledger   int;
  v_avg      numeric(12,6);
begin
  insert into public.customers (first_name, last_name, phone)
  values ('Carlos', 'Mendoza', '966554433')
  returning id into v_customer;

  insert into public.iptv_accounts (customer_id, external_username, purchased_at, expires_at, initial_expires_at)
  values (v_customer, 'carlos.iptv', now() - interval '15 days', now() + interval '15 days', now() + interval '15 days')
  returning id into v_account;

  select id into v_plan from public.plans where key = '6M_3D';

  -- 1) Compra: 10 tokens por S/ 50.00 => promedio 5.00.
  perform public.rpc_purchase_tokens(
    10, 50.00, now(), null, null, null, 'aaaaaaaa-0000-0000-0000-000000000009'::uuid
  );

  -- 2) Consumo: 5 tokens dentro de una renovación.
  v_renewal := public.rpc_register_renewal(
    p_account_id      => v_account,
    p_plan_id         => v_plan,
    p_operation_type  => 'RENOVACION',
    p_effective_at    => now(),
    p_new_expiration  => now() + interval '6 months',
    p_amount_agreed   => 75.00,
    p_tokens_used     => 5,
    p_notes           => null,
    p_idempotency_key => 'bbbbbbbb-0000-0000-0000-000000000009'::uuid
  );

  -- 3) Reversión: devuelve los 5.
  perform public.rpc_reverse_renewal(v_renewal.id, 'prueba de cuadre', null);

  -- 4) Ajuste negativo: 1 token de merma.
  perform public.rpc_adjust_tokens(
    -1, 'merma de inventario', 'eeeeeeee-0000-0000-0000-000000000009'::uuid
  );

  select quantity, avg_unit_cost into v_stock, v_avg
    from public.token_stock where id = 1;

  select coalesce(sum(quantity_delta), 0) into v_ledger
    from public.token_movements;

  if v_stock <> 9 then
    raise exception 'FALLO: saldo esperado 9, es %', v_stock;
  end if;
  if v_ledger <> v_stock then
    raise exception 'FALLO: el libro suma % y el saldo dice %', v_ledger, v_stock;
  end if;

  -- Desglose: +10 (compra) -5 (consumo) +5 (reversión) -1 (ajuste) = 9.
  if (select sum(quantity_delta) from public.token_movements where movement_type = 'COMPRA') <> 10 then
    raise exception 'FALLO: la compra no sumó 10 al libro';
  end if;

  -- El promedio solo lo movieron las entradas con costo: 10 a 5.00 y el ajuste
  -- negativo no lo altera.
  if v_avg <> 5.000000 then
    raise exception 'FALLO: promedio esperado 5.000000, es %', v_avg;
  end if;

  -- El costo congelado del consumo fue 5 * 5.00 = 25.00 y quedó en el margen.
  if (select token_cost from public.v_renewal_summary where id = v_renewal.id) <> 25.00 then
    raise exception 'FALLO: el costo de tokens de la renovación no es 25.00';
  end if;
end $$;

-- Un ajuste que dejaría el saldo negativo se rechaza sin escribir.
do $$
declare
  v_raised boolean := false;
  v_msg    text;
begin
  begin
    perform public.rpc_adjust_tokens(
      -100, 'ajuste imposible', 'eeeeeeee-0000-0000-0000-000000000010'::uuid
    );
  exception when others then
    v_raised := true;
    v_msg := sqlerrm;
  end;

  if not v_raised then
    raise exception 'FALLO: se permitió un ajuste que dejaba saldo negativo';
  end if;
  if v_msg not like 'STOCK_INSUFICIENTE%' then
    raise exception 'FALLO: mensaje inesperado: %', v_msg;
  end if;

  if (select quantity from public.token_stock where id = 1) <> 9 then
    raise exception 'FALLO: el ajuste rechazado modificó el saldo';
  end if;
end $$;

reset role;
