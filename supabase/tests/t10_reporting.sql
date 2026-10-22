-- =============================================================================
-- t10 · Vistas de reporte: agregados en SQL, sin doble conteo
-- -----------------------------------------------------------------------------
-- Criterios:
--   1. v_cash_monthly: la compra de tokens aparece UNA sola vez en outflow y
--      también en token_purchases; net cuadra exacto (ADR-005).
--   2. v_profit_monthly: comprar tokens NO altera operating_expenses; consumir
--      sí aparece en token_cost; una renovación revertida NO suma en
--      agreed_revenue (y su consumo tampoco en token_cost).
--   3. v_customer_summary: cuenta archivada fuera de accounts_active,
--      next_expiration y worst_status; peor estado = VENCIDA.
--   4. v_token_summary: inventory_value = quantity * avg_unit_cost y
--      below_minimum respeta min_token_balance.
-- =============================================================================

reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

set role authenticated;

do $$
declare
  v_customer     uuid;
  v_account      uuid;
  v_plan         uuid;
  v_r1           public.renewals;
  v_r2           public.renewals;

  -- Mes bajo prueba: mayo 2026 (fijo, no depende del reloj).
  v_month        date := date '2026-05-01';

  v_income       numeric(12,2);
  v_outflow      numeric(12,2);
  v_net          numeric(12,2);
  v_payments     int;
  v_token_cash   numeric(12,2);

  v_revenue      numeric(12,2);
  v_token_cost   numeric(12,2);
  v_expenses     numeric(12,2);
  v_margin       numeric(12,2);

  v_count        int;
  v_sum          numeric(12,2);
  v_qty          int;
  v_avg          numeric(12,6);
  v_inventory    numeric(12,2);
  v_min_balance  int;
  v_below        boolean;

  v_c1           uuid;
  v_c2           uuid;
  v_c3           uuid;
  v_vencida_exp  timestamptz;
  v_total        int;
  v_active       int;
  v_next         timestamptz;
  v_worst        text;
  v_last         timestamptz;
begin
  -- ---------------------------------------------------------------------------
  -- Datos: 1 compra de tokens (10 x S/ 50), 1 gasto, 2 renovaciones con
  -- consumo (la segunda se revierte) y 1 cobro. Todo en mayo 2026.
  -- ---------------------------------------------------------------------------
  perform public.rpc_purchase_tokens(
    10, 50.00, '2026-05-02 10:00:00-05', 'Proveedor', 'F010-001', 'compra de reporte',
    'aaaa1010-0000-0000-0000-000000000010'::uuid
  );

  insert into public.expenses (category, amount, spent_at, description)
  values ('PUBLICIDAD', 12.00, '2026-05-11 10:00:00-05', 'Pauta de mayo');

  insert into public.customers (first_name, last_name, phone)
  values ('Rosa', 'Quispe', '988776655')
  returning id into v_customer;

  insert into public.iptv_accounts (
    customer_id, external_username, purchased_at, expires_at, initial_expires_at
  ) values (
    v_customer, 'rosa.tokens',
    '2026-04-01 10:00:00-05', '2026-04-15 12:00:00-05', '2026-04-15 12:00:00-05'
  )
  returning id into v_account;

  select id into v_plan from public.plans where key = '1M_3D';

  -- Renovación confirmada: 5 tokens consumidos a 5.00 = 25.00 de costo.
  v_r1 := public.rpc_register_renewal(
    p_account_id      => v_account,
    p_plan_id         => v_plan,
    p_operation_type  => 'RENOVACION',
    p_effective_at    => '2026-05-05 12:00:00-05',
    p_new_expiration  => '2026-06-05 12:00:00-05',
    p_amount_agreed   => 75.00,
    p_tokens_used     => 5,
    p_notes           => 'renovación confirmada',
    p_idempotency_key => 'bbbb1010-0000-0000-0000-000000000010'::uuid
  );

  perform public.rpc_record_payment(
    v_r1.id, 60.00, 'YAPE', '2026-05-06 09:00:00-05', 'YAPE-01', null,
    'cccc1010-0000-0000-0000-000000000010'::uuid
  );

  -- Renovación que luego se revierte: 2 tokens (10.00) que no deben contar.
  v_r2 := public.rpc_register_renewal(
    p_account_id      => v_account,
    p_plan_id         => v_plan,
    p_operation_type  => 'RENOVACION',
    p_effective_at    => '2026-05-20 12:00:00-05',
    p_new_expiration  => '2026-07-05 12:00:00-05',
    p_amount_agreed   => 40.00,
    p_tokens_used     => 2,
    p_notes           => 'renovación que se revierte',
    p_idempotency_key => 'dddd1010-0000-0000-0000-000000000010'::uuid
  );

  perform public.rpc_reverse_renewal(
    v_r2.id, 'error de registro', 'eeee1010-0000-0000-0000-000000000010'::uuid
  );

  -- ---------------------------------------------------------------------------
  -- 1) v_cash_monthly
  --    IN  = 60.00 (cobro)
  --    OUT = 50.00 (tokens) + 12.00 (gasto) = 62.00
  --    net = 60.00 - 62.00 = -2.00
  -- ---------------------------------------------------------------------------
  select income, outflow, net, payments_count, token_purchases
    into v_income, v_outflow, v_net, v_payments, v_token_cash
    from public.v_cash_monthly
   where month = v_month;

  if not found then
    raise exception 'FALLO: v_cash_monthly no devolvió fila para %', v_month;
  end if;
  if v_income <> 60.00 then
    raise exception 'FALLO: income de mayo esperado 60.00, es %', v_income;
  end if;
  if v_outflow <> 62.00 then
    raise exception 'FALLO: outflow de mayo esperado 62.00 (50 tokens + 12 gasto), es %', v_outflow;
  end if;
  if v_net <> -2.00 then
    raise exception 'FALLO: net de mayo esperado -2.00, es %', v_net;
  end if;
  if v_payments <> 1 then
    raise exception 'FALLO: payments_count esperado 1, es %', v_payments;
  end if;
  if v_token_cash <> 50.00 then
    raise exception 'FALLO: token_purchases de mayo esperado 50.00, es %', v_token_cash;
  end if;

  -- La compra aparece exactamente una vez en la caja: si estuviera duplicada,
  -- outflow sería 112.00 y el conteo de COMPRA_TOKENS sería 2.
  select count(*), coalesce(sum(amount), 0)
    into v_count, v_sum
    from public.v_cash_movements
   where kind = 'COMPRA_TOKENS';
  if v_count <> 1 then
    raise exception 'FALLO: la compra de tokens aparece % veces en la caja (esperado 1)', v_count;
  end if;
  if v_sum <> 50.00 then
    raise exception 'FALLO: la caja suma % en compras de tokens (esperado 50.00)', v_sum;
  end if;

  -- Y no existe la fila espejo en expenses.
  select count(*), coalesce(sum(amount), 0)
    into v_count, v_sum
    from public.expenses;
  if v_count <> 1 or v_sum <> 12.00 then
    raise exception 'FALLO: expenses tiene % fila(s) por % (esperado 1 por 12.00)', v_count, v_sum;
  end if;

  -- ---------------------------------------------------------------------------
  -- 2) v_profit_monthly
  --    agreed_revenue     = 75.00  (la revertida de 40.00 NO suma)
  --    token_cost         = 25.00  (solo el CONSUMO de la confirmada)
  --    operating_expenses = 12.00  (solo expenses; la compra de tokens NO suma)
  --    gross_margin       = 38.00
  -- ---------------------------------------------------------------------------
  select agreed_revenue, token_cost, operating_expenses, gross_margin
    into v_revenue, v_token_cost, v_expenses, v_margin
    from public.v_profit_monthly
   where month = v_month;

  if not found then
    raise exception 'FALLO: v_profit_monthly no devolvió fila para %', v_month;
  end if;
  if v_expenses <> 12.00 then
    raise exception 'FALLO: operating_expenses de mayo esperado 12.00 (sin la compra de tokens), es %', v_expenses;
  end if;
  if v_token_cost <> 25.00 then
    raise exception 'FALLO: token_cost de mayo esperado 25.00, es %', v_token_cost;
  end if;
  if v_revenue <> 75.00 then
    raise exception 'FALLO: agreed_revenue de mayo esperado 75.00 (la revertida no suma), es %', v_revenue;
  end if;
  if v_margin <> 38.00 then
    raise exception 'FALLO: gross_margin de mayo esperado 38.00, es %', v_margin;
  end if;

  -- Aseguramos que el dato es discriminante: hay 2 CONSUMO por 35.00 en el
  -- libro, pero la vista solo toma los 25.00 de la renovación confirmada.
  select count(*), coalesce(sum(cost_amount), 0)
    into v_count, v_sum
    from public.token_movements
   where movement_type = 'CONSUMO';
  if v_count <> 2 or v_sum <> 35.00 then
    raise exception 'FALLO: el libro debería tener 2 CONSUMO por 35.00, tiene % por %', v_count, v_sum;
  end if;

  -- ---------------------------------------------------------------------------
  -- 3) v_customer_summary
  --    Cliente con 3 cuentas: 1 archivada (la que vence antes), 1 vencida, 1 urgente.
  -- ---------------------------------------------------------------------------
  insert into public.customers (first_name, last_name, phone)
  values ('Lucia', 'Ramos', '977665544')
  returning id into v_c1;

  -- Archivada: vence hace 100 días. Si la vista no la excluyera, next_expiration
  -- sería esta fecha y no la de la cuenta vencida de ayer.
  insert into public.iptv_accounts (
    customer_id, external_username, purchased_at, expires_at, initial_expires_at, archived_at
  ) values (
    v_c1, 'lucia.archivada',
    now() - interval '200 days', now() - interval '100 days', now() - interval '100 days', now()
  );

  -- Vencida: expiró ayer.
  v_vencida_exp := now() - interval '1 day';
  insert into public.iptv_accounts (
    customer_id, external_username, purchased_at, expires_at, initial_expires_at
  ) values (
    v_c1, 'lucia.vencida',
    now() - interval '40 days', v_vencida_exp, v_vencida_exp
  );

  -- Urgente: vence en 2 días (urgent_days = 3).
  insert into public.iptv_accounts (
    customer_id, external_username, purchased_at, expires_at, initial_expires_at
  ) values (
    v_c1, 'lucia.urgente',
    now() - interval '10 days', now() + interval '2 days', now() + interval '2 days'
  );

  select accounts_total, accounts_active, next_expiration, worst_status
    into v_total, v_active, v_next, v_worst
    from public.v_customer_summary
   where customer_id = v_c1;

  if not found then
    raise exception 'FALLO: v_customer_summary no devolvió al cliente %', v_c1;
  end if;
  if v_total <> 3 then
    raise exception 'FALLO: accounts_total esperado 3, es %', v_total;
  end if;
  if v_active <> 2 then
    raise exception 'FALLO: accounts_active esperado 2 (la archivada no cuenta), es %', v_active;
  end if;
  if v_worst <> 'VENCIDA' then
    raise exception 'FALLO: worst_status esperado VENCIDA, es %', coalesce(v_worst, 'NULL');
  end if;
  if v_next is distinct from v_vencida_exp then
    raise exception 'FALLO: next_expiration esperado % (vencida, no la archivada), es %',
      v_vencida_exp, coalesce(v_next::text, 'NULL');
  end if;

  -- Cliente sin cuentas: conteos en 0 y estado nulo.
  insert into public.customers (first_name, last_name, phone)
  values ('Sin', 'Cuentas', '966554433')
  returning id into v_c2;

  select accounts_total, accounts_active, next_expiration, worst_status
    into v_total, v_active, v_next, v_worst
    from public.v_customer_summary
   where customer_id = v_c2;
  if v_total <> 0 or v_active <> 0 or v_next is not null or v_worst is not null then
    raise exception 'FALLO: cliente sin cuentas devuelve total=%, activas=%, next=%, worst=%',
      v_total, v_active, coalesce(v_next::text, 'NULL'), coalesce(v_worst, 'NULL');
  end if;

  -- Cliente con solo cuentas archivadas: activas 0, estado nulo, sin vencimiento.
  insert into public.customers (first_name, last_name, phone)
  values ('Solo', 'Archivada', '955443322')
  returning id into v_c3;

  insert into public.iptv_accounts (
    customer_id, external_username, purchased_at, expires_at, initial_expires_at, archived_at
  ) values (
    v_c3, 'solo.archivada',
    now() - interval '60 days', now() + interval '30 days', now() + interval '30 days', now()
  );

  select accounts_total, accounts_active, next_expiration, worst_status
    into v_total, v_active, v_next, v_worst
    from public.v_customer_summary
   where customer_id = v_c3;
  if v_total <> 1 or v_active <> 0 or v_next is not null or v_worst is not null then
    raise exception 'FALLO: cliente solo-archivada devuelve total=%, activas=%, next=%, worst=%',
      v_total, v_active, coalesce(v_next::text, 'NULL'), coalesce(v_worst, 'NULL');
  end if;

  -- last_renewal_at ignora la renovación revertida: la última válida es R1.
  select last_renewal_at into v_last
    from public.v_customer_summary
   where customer_id = v_customer;
  if v_last is distinct from '2026-05-05 12:00:00-05'::timestamptz then
    raise exception 'FALLO: last_renewal_at esperado 2026-05-05 12:00-05, es %',
      coalesce(v_last::text, 'NULL');
  end if;

  -- ---------------------------------------------------------------------------
  -- 4) v_token_summary
  --    10 comprados - 5 (R1) - 2 (R2) + 2 (reversión) = 5; promedio 5.000000.
  -- ---------------------------------------------------------------------------
  select count(*) into v_count from public.v_token_summary;
  if v_count <> 1 then
    raise exception 'FALLO: v_token_summary debe devolver 1 fila, devuelve %', v_count;
  end if;

  select quantity, avg_unit_cost, inventory_value, min_balance, below_minimum
    into v_qty, v_avg, v_inventory, v_min_balance, v_below
    from public.v_token_summary;

  if v_qty <> 5 then
    raise exception 'FALLO: quantity esperado 5, es %', v_qty;
  end if;
  if v_avg <> 5.000000 then
    raise exception 'FALLO: avg_unit_cost esperado 5.000000, es %', v_avg;
  end if;
  if v_inventory <> round(v_qty * v_avg, 2) then
    raise exception 'FALLO: inventory_value % no cuadra con % x %', v_inventory, v_qty, v_avg;
  end if;
  if v_inventory <> 25.00 then
    raise exception 'FALLO: inventory_value esperado 25.00, es %', v_inventory;
  end if;
  if v_min_balance <> 5 then
    raise exception 'FALLO: min_balance esperado 5 (seed), es %', v_min_balance;
  end if;
  if v_below then
    raise exception 'FALLO: below_minimum debe ser false con saldo 5 y mínimo 5';
  end if;

  -- Subir el umbral a 6: el mismo saldo queda por debajo.
  update public.app_settings set min_token_balance = 6 where id = 1;

  select min_balance, below_minimum into v_min_balance, v_below
    from public.v_token_summary;
  if v_min_balance <> 6 then
    raise exception 'FALLO: min_balance esperado 6 tras el cambio, es %', v_min_balance;
  end if;
  if not v_below then
    raise exception 'FALLO: below_minimum debe ser true con saldo 5 y mínimo 6';
  end if;

  -- Se restaura el valor del seed para no dejar el entorno alterado.
  update public.app_settings set min_token_balance = 5 where id = 1;
end $$;

-- -----------------------------------------------------------------------------
-- 5) Aislamiento: un usuario `authenticated` sin fila en `profiles` no es admin.
-- Las vistas son security_invoker, así que la RLS de las tablas base debe
-- devolver 0 filas (no basta con tener GRANT SELECT en la vista).
-- -----------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', false);

set role authenticated;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.v_cash_monthly;
  if v_count <> 0 then
    raise exception 'FUGA: v_cash_monthly devuelve % fila(s) a un no administrador', v_count;
  end if;

  select count(*) into v_count from public.v_profit_monthly;
  if v_count <> 0 then
    raise exception 'FUGA: v_profit_monthly devuelve % fila(s) a un no administrador', v_count;
  end if;

  select count(*) into v_count from public.v_customer_summary;
  if v_count <> 0 then
    raise exception 'FUGA: v_customer_summary devuelve % fila(s) a un no administrador', v_count;
  end if;

  select count(*) into v_count from public.v_token_summary;
  if v_count <> 0 then
    raise exception 'FUGA: v_token_summary devuelve % fila(s) a un no administrador', v_count;
  end if;
end $$;

reset role;
