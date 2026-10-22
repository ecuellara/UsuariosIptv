-- =============================================================================
-- 0007 · RPC de escritura crítica
-- -----------------------------------------------------------------------------
-- Origen: docs/02-modelo-datos.md §4 + ADR-008.
--
-- Contrato común de TODAS las funciones de este archivo:
--   · SECURITY DEFINER + search_path = public  (corren como dueño, no como el
--     navegador; por eso pueden escribir tablas que authenticated no puede tocar).
--   · Chequeo explícito `is_admin()`: la autorización no depende de la RLS.
--   · Validación de invariantes ANTES de escribir.
--   · Idempotencia: misma clave => mismo resultado, sin excepción.
--   · Un registro en audit_log por operación efectiva.
--   · Códigos de error con prefijo legible (STOCK_INSUFICIENTE, PAGO_EXCEDE...)
--     para que el frontend traduzca sin parsear texto libre.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- rpc_register_renewal · registra una activación/renovación ya hecha en el panel
-- del proveedor. Es la operación central del sistema.
--
-- Atómico: renovación + consumo de tokens + saldo + vencimiento de la cuenta.
-- Si algo falla, no queda nada escrito.
-- -----------------------------------------------------------------------------
create or replace function public.rpc_register_renewal(
  p_account_id        uuid,
  p_plan_id           uuid,
  p_operation_type    public.renewal_operation_type,
  p_effective_at      timestamptz,
  p_new_expiration    timestamptz,
  p_amount_agreed     numeric,
  p_tokens_used       integer,
  p_notes             text,
  p_idempotency_key   uuid,
  p_expiration_edited boolean default false
)
returns public.renewals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_row     public.renewals;
  v_account public.iptv_accounts;
  v_plan    public.plans;
  v_stock   public.token_stock;
  v_cost    numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'NO_AUTORIZADO' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUERIDA' using errcode = '22023';
  end if;

  -- Reintento exacto (doble clic): devolvemos la fila ya creada.
  select * into v_row from public.renewals where idempotency_key = p_idempotency_key;
  if found then
    return v_row;
  end if;

  if p_operation_type is null then
    raise exception 'TIPO_OPERACION_REQUERIDO' using errcode = '22023';
  end if;
  if p_effective_at is null or p_new_expiration is null then
    raise exception 'FECHAS_REQUERIDAS' using errcode = '22023';
  end if;
  if p_tokens_used is null or p_tokens_used < 0 then
    raise exception 'TOKENS_INVALIDOS' using errcode = '22023';
  end if;
  if p_amount_agreed is null or p_amount_agreed < 0 then
    raise exception 'MONTO_INVALIDO' using errcode = '22023';
  end if;
  if p_new_expiration <= p_effective_at - interval '1 day' then
    raise exception 'FECHA_VENCIMIENTO_INVALIDA' using errcode = '22023';
  end if;

  -- Lock de la cuenta: dos renovaciones simultáneas de la misma cuenta se
  -- serializan y la segunda ve el expires_at actualizado.
  select * into v_account
    from public.iptv_accounts
   where id = p_account_id
   for update;
  if not found then
    raise exception 'CUENTA_NO_ENCONTRADA' using errcode = '22023';
  end if;
  if v_account.archived_at is not null then
    raise exception 'CUENTA_ARCHIVADA' using errcode = '23514';
  end if;

  select * into v_plan from public.plans where id = p_plan_id;
  if not found then
    raise exception 'PLAN_NO_ENCONTRADO' using errcode = '22023';
  end if;

  -- Lock del saldo: la validación de existencias es una resta sobre una fila
  -- bloqueada, nunca un agregado (ADR-004).
  select * into v_stock from public.token_stock where id = 1 for update;
  if not found then
    raise exception 'STOCK_NO_INICIALIZADO' using errcode = '23514';
  end if;
  if v_stock.quantity < p_tokens_used then
    raise exception 'STOCK_INSUFICIENTE: disponible %, solicitado %',
      v_stock.quantity, p_tokens_used using errcode = '23514';
  end if;

  insert into public.renewals (
    account_id, plan_id, operation_type,
    plan_name, duration_months, devices, price_snapshot,
    amount_agreed, tokens_used, previous_expiration, new_expiration,
    expiration_edited, effective_at, idempotency_key, notes, created_by
  ) values (
    v_account.id, v_plan.id, p_operation_type,
    v_plan.name, v_plan.duration_months, v_plan.devices, v_plan.suggested_price,
    p_amount_agreed, p_tokens_used, v_account.expires_at, p_new_expiration,
    coalesce(p_expiration_edited, false), p_effective_at, p_idempotency_key, p_notes, v_actor
  )
  on conflict (idempotency_key) do nothing
  returning * into v_row;

  if v_row.id is null then
    -- Otra transacción ganó la carrera con la misma clave.
    select * into v_row from public.renewals where idempotency_key = p_idempotency_key;
    return v_row;
  end if;

  if p_tokens_used > 0 then
    -- Costo congelado: se guarda el promedio vigente AHORA y no se recalcula nunca.
    v_cost := round(p_tokens_used * v_stock.avg_unit_cost, 2);

    insert into public.token_movements (
      movement_type, quantity_delta, unit_cost, cost_amount,
      renewal_id, idempotency_key, created_by
    ) values (
      'CONSUMO', -p_tokens_used, v_stock.avg_unit_cost, v_cost,
      v_row.id, p_idempotency_key, v_actor
    );

    update public.token_stock
       set quantity = v_stock.quantity - p_tokens_used
     where id = 1;
  end if;

  update public.iptv_accounts
     set expires_at = p_new_expiration,
         last_verified_at = now()
   where id = v_account.id;

  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (
    v_actor, 'REGISTER_RENEWAL', 'renewals', v_row.id,
    jsonb_build_object(
      'account_id', v_row.account_id,
      'plan_key', v_plan.key,
      'operation_type', p_operation_type,
      'amount_agreed', p_amount_agreed,
      'tokens_used', p_tokens_used,
      'previous_expiration', v_row.previous_expiration,
      'new_expiration', p_new_expiration,
      'idempotency_key', p_idempotency_key
    )
  );

  return v_row;
end;
$$;

comment on function public.rpc_register_renewal(uuid, uuid, public.renewal_operation_type, timestamptz, timestamptz, numeric, integer, text, uuid, boolean) is
  'Registra activación/renovación con snapshot del plan, consumo de tokens y actualización de vencimiento.';

-- -----------------------------------------------------------------------------
-- rpc_record_payment · registra dinero que YA entró. Nunca sobrepasa lo acordado.
-- -----------------------------------------------------------------------------
create or replace function public.rpc_record_payment(
  p_renewal_id      uuid,
  p_amount          numeric,
  p_method          public.payment_method,
  p_paid_at         timestamptz,
  p_reference       text,
  p_notes           text,
  p_idempotency_key uuid
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_row     public.payments;
  v_renewal public.renewals;
  v_paid    numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'NO_AUTORIZADO' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUERIDA' using errcode = '22023';
  end if;

  select * into v_row from public.payments where idempotency_key = p_idempotency_key;
  if found then
    return v_row;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'MONTO_INVALIDO' using errcode = '22023';
  end if;
  if p_method is null then
    raise exception 'METODO_REQUERIDO' using errcode = '22023';
  end if;
  if p_paid_at is null then
    raise exception 'FECHA_PAGO_REQUERIDA' using errcode = '22023';
  end if;

  -- Lock de la renovación: dos pagos simultáneos no pueden sumar de más.
  select * into v_renewal from public.renewals where id = p_renewal_id for update;
  if not found then
    raise exception 'RENOVACION_NO_ENCONTRADA' using errcode = '22023';
  end if;
  if v_renewal.reversed_at is not null then
    raise exception 'RENOVACION_REVERTIDA' using errcode = '23514';
  end if;

  select coalesce(sum(p.amount), 0) into v_paid
    from public.payments p
   where p.renewal_id = p_renewal_id;

  if v_paid + p_amount > v_renewal.amount_agreed then
    raise exception 'PAGO_EXCEDE_MONTO_ACORDADO: acordado %, pagado %, intento %',
      v_renewal.amount_agreed, v_paid, p_amount using errcode = '23514';
  end if;

  insert into public.payments (
    renewal_id, amount, method, paid_at, reference, notes, idempotency_key, created_by
  ) values (
    p_renewal_id, p_amount, p_method, p_paid_at, p_reference, p_notes, p_idempotency_key, v_actor
  )
  on conflict (idempotency_key) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.payments where idempotency_key = p_idempotency_key;
    return v_row;
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (
    v_actor, 'RECORD_PAYMENT', 'payments', v_row.id,
    jsonb_build_object(
      'renewal_id', p_renewal_id,
      'amount', p_amount,
      'method', p_method,
      'paid_at', p_paid_at,
      'amount_paid_total', v_paid + p_amount,
      'amount_agreed', v_renewal.amount_agreed,
      'idempotency_key', p_idempotency_key
    )
  );

  return v_row;
end;
$$;

comment on function public.rpc_record_payment(uuid, numeric, public.payment_method, timestamptz, text, text, uuid) is
  'Registra un cobro recibido. Rechaza cualquier suma que exceda amount_agreed.';

-- -----------------------------------------------------------------------------
-- rpc_purchase_tokens · egreso de caja + entrada de inventario + promedio
-- ponderado. Aparece en caja una sola vez (ADR-005).
-- -----------------------------------------------------------------------------
create or replace function public.rpc_purchase_tokens(
  p_quantity        integer,
  p_total_cost      numeric,
  p_purchased_at    timestamptz,
  p_supplier        text,
  p_reference       text,
  p_notes           text,
  p_idempotency_key uuid
)
returns public.token_purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_row     public.token_purchases;
  v_stock   public.token_stock;
  v_qty     integer;
  v_avg     numeric(12,6);
begin
  if not public.is_admin() then
    raise exception 'NO_AUTORIZADO' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUERIDA' using errcode = '22023';
  end if;

  select * into v_row from public.token_purchases where idempotency_key = p_idempotency_key;
  if found then
    return v_row;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'CANTIDAD_INVALIDA' using errcode = '22023';
  end if;
  if p_total_cost is null or p_total_cost <= 0 then
    raise exception 'COSTO_INVALIDO' using errcode = '22023';
  end if;
  if p_purchased_at is null then
    raise exception 'FECHA_COMPRA_REQUERIDA' using errcode = '22023';
  end if;

  select * into v_stock from public.token_stock where id = 1 for update;
  if not found then
    raise exception 'STOCK_NO_INICIALIZADO' using errcode = '23514';
  end if;

  v_qty := v_stock.quantity + p_quantity;
  -- Promedio ponderado: (existencias a costo actual + costo de la compra) / nuevo saldo.
  v_avg := round(((v_stock.quantity::numeric * v_stock.avg_unit_cost) + p_total_cost) / v_qty, 6);

  insert into public.token_purchases (
    quantity, total_cost, purchased_at, supplier, reference, notes, idempotency_key, created_by
  ) values (
    p_quantity, p_total_cost, p_purchased_at, p_supplier, p_reference, p_notes,
    p_idempotency_key, v_actor
  )
  on conflict (idempotency_key) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.token_purchases where idempotency_key = p_idempotency_key;
    return v_row;
  end if;

  insert into public.token_movements (
    movement_type, quantity_delta, unit_cost, cost_amount,
    purchase_id, idempotency_key, created_by
  ) values (
    'COMPRA', p_quantity, round(p_total_cost / p_quantity, 6), p_total_cost,
    v_row.id, p_idempotency_key, v_actor
  );

  update public.token_stock
     set quantity = v_qty,
         avg_unit_cost = v_avg
   where id = 1;

  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (
    v_actor, 'PURCHASE_TOKENS', 'token_purchases', v_row.id,
    jsonb_build_object(
      'quantity', p_quantity,
      'total_cost', p_total_cost,
      'avg_unit_cost_before', v_stock.avg_unit_cost,
      'avg_unit_cost_after', v_avg,
      'quantity_after', v_qty,
      'idempotency_key', p_idempotency_key
    )
  );

  return v_row;
end;
$$;

comment on function public.rpc_purchase_tokens(integer, numeric, timestamptz, text, text, text, uuid) is
  'Compra de tokens: registra el egreso, entra inventario y recalcula el promedio ponderado.';

-- -----------------------------------------------------------------------------
-- rpc_adjust_tokens · corrección auditada del inventario (merma, error de carga).
-- Usa el promedio vigente como costo del ajuste y nunca deja saldo negativo.
-- -----------------------------------------------------------------------------
create or replace function public.rpc_adjust_tokens(
  p_delta           integer,
  p_reason          text,
  p_idempotency_key uuid
)
returns public.token_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_row     public.token_movements;
  v_stock   public.token_stock;
  v_qty     integer;
  v_avg     numeric(12,6);
  v_cost    numeric(12,2);
  v_key     uuid;
begin
  if not public.is_admin() then
    raise exception 'NO_AUTORIZADO' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUERIDA' using errcode = '22023';
  end if;

  select * into v_row from public.token_movements where idempotency_key = p_idempotency_key;
  if found then
    return v_row;
  end if;

  if p_delta is null or p_delta = 0 then
    raise exception 'DELTA_INVALIDO' using errcode = '22023';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = '22023';
  end if;

  select * into v_stock from public.token_stock where id = 1 for update;
  if not found then
    raise exception 'STOCK_NO_INICIALIZADO' using errcode = '23514';
  end if;

  v_qty := v_stock.quantity + p_delta;
  if v_qty < 0 then
    raise exception 'STOCK_INSUFICIENTE: disponible %, ajuste %',
      v_stock.quantity, p_delta using errcode = '23514';
  end if;

  v_cost := round(abs(p_delta) * v_stock.avg_unit_cost, 2);

  if p_delta > 0 then
    -- Un ajuste positivo entra al inventario y por tanto mueve el promedio.
    v_avg := round(((v_stock.quantity::numeric * v_stock.avg_unit_cost) + v_cost) / v_qty, 6);
  else
    -- Una salida no cambia el promedio: el costo queda congelado en el movimiento.
    v_avg := v_stock.avg_unit_cost;
  end if;

  v_key := p_idempotency_key;

  insert into public.token_movements (
    movement_type, quantity_delta, unit_cost, cost_amount,
    reason, idempotency_key, created_by
  ) values (
    'AJUSTE', p_delta, v_stock.avg_unit_cost, v_cost,
    p_reason, v_key, v_actor
  )
  on conflict (idempotency_key) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.token_movements where idempotency_key = v_key;
    return v_row;
  end if;

  update public.token_stock
     set quantity = v_qty,
         avg_unit_cost = v_avg
   where id = 1;

  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (
    v_actor, 'ADJUST_TOKENS', 'token_movements', v_row.id,
    jsonb_build_object(
      'delta', p_delta,
      'reason', p_reason,
      'quantity_after', v_qty,
      'idempotency_key', p_idempotency_key
    )
  );

  return v_row;
end;
$$;

comment on function public.rpc_adjust_tokens(integer, text, uuid) is
  'Ajuste manual del inventario con motivo obligatorio. No permite saldo negativo.';

-- -----------------------------------------------------------------------------
-- rpc_reverse_renewal · deshace una renovación.
--   · devuelve los tokens al costo CONGELADO original (no al promedio actual)
--   · restaura expires_at según el último new_expiration no revertido, o
--     initial_expires_at si no queda ninguno (docs/02 §4)
--   · NO toca payments: la caja es un hecho histórico
-- -----------------------------------------------------------------------------
create or replace function public.rpc_reverse_renewal(
  p_renewal_id      uuid,
  p_reason          text,
  p_idempotency_key uuid default null
)
returns public.renewals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_row      public.renewals;
  v_stock    public.token_stock;
  v_tokens   integer;
  v_cost     numeric(12,2);
  v_unit     numeric(12,6);
  v_restored timestamptz;
begin
  if not public.is_admin() then
    raise exception 'NO_AUTORIZADO' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = '22023';
  end if;

  -- Idempotencia por clave (opcional: la firma del contrato no la incluye).
  if p_idempotency_key is not null and exists (
    select 1 from public.audit_log
     where action = 'REVERSE_RENEWAL'
       and payload ->> 'idempotency_key' = p_idempotency_key::text
  ) then
    select * into v_row from public.renewals where id = p_renewal_id;
    return v_row;
  end if;

  select * into v_row from public.renewals where id = p_renewal_id for update;
  if not found then
    raise exception 'RENOVACION_NO_ENCONTRADA' using errcode = '22023';
  end if;

  -- Revertir algo ya revertido devuelve el mismo estado: no es un error.
  if v_row.reversed_at is not null then
    return v_row;
  end if;

  select coalesce(sum(-m.quantity_delta), 0),
         coalesce(sum(m.cost_amount), 0),
         max(m.unit_cost)
    into v_tokens, v_cost, v_unit
    from public.token_movements m
   where m.renewal_id = v_row.id
     and m.movement_type = 'CONSUMO';

  update public.renewals
     set reversed_at = now(),
         reversal_reason = p_reason,
         reversed_by = v_actor
   where id = v_row.id
  returning * into v_row;

  if v_tokens > 0 then
    select * into v_stock from public.token_stock where id = 1 for update;
    if not found then
      raise exception 'STOCK_NO_INICIALIZADO' using errcode = '23514';
    end if;

    insert into public.token_movements (
      movement_type, quantity_delta, unit_cost, cost_amount,
      renewal_id, reason, idempotency_key, created_by
    ) values (
      'REVERSION', v_tokens, coalesce(v_unit, 0), v_cost,
      v_row.id, p_reason, coalesce(p_idempotency_key, gen_random_uuid()), v_actor
    );

    -- El consumo no movió el promedio (congeló el costo), así que su inverso
    -- tampoco lo mueve: el saldo vuelve exactamente al estado anterior.
    update public.token_stock
       set quantity = v_stock.quantity + v_tokens
     where id = 1;
  end if;

  select coalesce(
           (select r2.new_expiration
              from public.renewals r2
             where r2.account_id = v_row.account_id
               and r2.reversed_at is null
             order by r2.recorded_at desc, r2.id desc
             limit 1),
           a.initial_expires_at)
    into v_restored
    from public.iptv_accounts a
   where a.id = v_row.account_id;

  update public.iptv_accounts
     set expires_at = v_restored
   where id = v_row.account_id;

  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (
    v_actor, 'REVERSE_RENEWAL', 'renewals', v_row.id,
    jsonb_build_object(
      'reason', p_reason,
      'tokens_returned', v_tokens,
      'cost_returned', v_cost,
      'expires_at_restored', v_restored
    ) || case
           when p_idempotency_key is not null
             then jsonb_build_object('idempotency_key', p_idempotency_key)
           else '{}'::jsonb
         end
  );

  return v_row;
end;
$$;

comment on function public.rpc_reverse_renewal(uuid, text, uuid) is
  'Revierte una renovación confirmada: devuelve tokens a costo congelado y restaura el vencimiento.';

-- -----------------------------------------------------------------------------
-- rpc_set_account_expiration · corrección manual del vencimiento, auditada.
-- Evita la edición silenciosa del dato más delicado del sistema.
-- -----------------------------------------------------------------------------
create or replace function public.rpc_set_account_expiration(
  p_account_id      uuid,
  p_expires_at      timestamptz,
  p_reason          text,
  p_idempotency_key uuid default null
)
returns public.iptv_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_account public.iptv_accounts;
  v_before  timestamptz;
begin
  if not public.is_admin() then
    raise exception 'NO_AUTORIZADO' using errcode = '42501';
  end if;
  if p_expires_at is null then
    raise exception 'FECHA_REQUERIDA' using errcode = '22023';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = '22023';
  end if;

  select * into v_account from public.iptv_accounts where id = p_account_id for update;
  if not found then
    raise exception 'CUENTA_NO_ENCONTRADA' using errcode = '22023';
  end if;

  -- Misma clave = operación ya aplicada: no se reescribe ni se audita de nuevo.
  if p_idempotency_key is not null and exists (
    select 1 from public.audit_log
     where action = 'SET_ACCOUNT_EXPIRATION'
       and payload ->> 'idempotency_key' = p_idempotency_key::text
  ) then
    return v_account;
  end if;

  if p_expires_at <= v_account.purchased_at then
    raise exception 'FECHA_VENCIMIENTO_INVALIDA: debe ser posterior a purchased_at %',
      v_account.purchased_at using errcode = '22023';
  end if;

  v_before := v_account.expires_at;

  update public.iptv_accounts
     set expires_at = p_expires_at,
         last_verified_at = now()
   where id = p_account_id
  returning * into v_account;

  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (
    v_actor, 'SET_ACCOUNT_EXPIRATION', 'iptv_accounts', v_account.id,
    jsonb_build_object(
      'reason', p_reason,
      'expires_at_before', v_before,
      'expires_at_after', p_expires_at
    ) || case
           when p_idempotency_key is not null
             then jsonb_build_object('idempotency_key', p_idempotency_key)
           else '{}'::jsonb
         end
  );

  return v_account;
end;
$$;

comment on function public.rpc_set_account_expiration(uuid, timestamptz, text, uuid) is
  'Corrección manual del vencimiento con motivo obligatorio y rastro en audit_log.';

-- -----------------------------------------------------------------------------
-- rpc_update_followup · mueve el estado de seguimiento y deja el historial.
-- Estado actual y bitácora se escriben en la misma transacción: no pueden
-- desincronizarse (docs/02 §2).
-- -----------------------------------------------------------------------------
create or replace function public.rpc_update_followup(
  p_account_id      uuid,
  p_status          public.followup_status default null,
  p_notes           text default null,
  p_next_followup_at timestamptz default null,
  p_template_key    text default null,
  p_rendered_body   text default null,
  p_wa_url          text default null,
  p_event_type      public.contact_event_type default 'MENSAJE_ENVIADO',
  p_idempotency_key uuid default null
)
returns public.renewal_followups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_account public.iptv_accounts;
  v_row     public.renewal_followups;
  v_log     public.contact_logs;
begin
  if not public.is_admin() then
    raise exception 'NO_AUTORIZADO' using errcode = '42501';
  end if;

  select * into v_account from public.iptv_accounts where id = p_account_id;
  if not found then
    raise exception 'CUENTA_NO_ENCONTRADA' using errcode = '22023';
  end if;

  select * into v_row from public.renewal_followups where account_id = p_account_id for update;
  if not found then
    raise exception 'SEGUIMIENTO_NO_ENCONTRADO' using errcode = '23514';
  end if;

  if p_idempotency_key is not null and exists (
    select 1 from public.audit_log
     where action = 'UPDATE_FOLLOWUP'
       and payload ->> 'idempotency_key' = p_idempotency_key::text
  ) then
    return v_row;
  end if;

  update public.renewal_followups
     set status = coalesce(p_status, v_row.status),
         notes = coalesce(p_notes, v_row.notes),
         next_followup_at = coalesce(p_next_followup_at, v_row.next_followup_at),
         last_contact_at = case
                             when p_event_type in ('MENSAJE_ENVIADO'::public.contact_event_type,
                                                   'RESPUESTA_RECIBIDA'::public.contact_event_type)
                               then now()
                             else v_row.last_contact_at
                           end
   where account_id = p_account_id
  returning * into v_row;

  insert into public.contact_logs (
    customer_id, account_id, template_key, rendered_body, wa_url,
    event_type, followup_status_after, notes, created_by
  ) values (
    v_account.customer_id, v_account.id, p_template_key, p_rendered_body, p_wa_url,
    coalesce(p_event_type, 'MENSAJE_ENVIADO'::public.contact_event_type),
    v_row.status, p_notes, v_actor
  )
  returning * into v_log;

  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (
    v_actor, 'UPDATE_FOLLOWUP', 'renewal_followups', v_row.id,
    jsonb_build_object(
      'account_id', p_account_id,
      'status', v_row.status,
      'event_type', p_event_type,
      'contact_log_id', v_log.id,
      'template_key', p_template_key
    ) || case
           when p_idempotency_key is not null
             then jsonb_build_object('idempotency_key', p_idempotency_key)
           else '{}'::jsonb
         end
  );

  return v_row;
end;
$$;

comment on function public.rpc_update_followup(uuid, public.followup_status, text, timestamptz, text, text, text, public.contact_event_type, uuid) is
  'Actualiza el seguimiento y registra el contacto en la misma transacción.';

-- -----------------------------------------------------------------------------
-- Privilegios de ejecución · solo el rol autenticado puede invocar las RPC.
-- anon queda fuera por completo (no hay registro público).
-- -----------------------------------------------------------------------------
revoke all on all functions in schema public from public;
revoke all on all functions in schema public from anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.account_status(timestamptz, timestamptz, timestamptz) to authenticated;
grant execute on function public.add_months(timestamptz, integer) to authenticated;

grant execute on function public.rpc_register_renewal(uuid, uuid, public.renewal_operation_type, timestamptz, timestamptz, numeric, integer, text, uuid, boolean) to authenticated;
grant execute on function public.rpc_record_payment(uuid, numeric, public.payment_method, timestamptz, text, text, uuid) to authenticated;
grant execute on function public.rpc_purchase_tokens(integer, numeric, timestamptz, text, text, text, uuid) to authenticated;
grant execute on function public.rpc_adjust_tokens(integer, text, uuid) to authenticated;
grant execute on function public.rpc_reverse_renewal(uuid, text, uuid) to authenticated;
grant execute on function public.rpc_set_account_expiration(uuid, timestamptz, text, uuid) to authenticated;
grant execute on function public.rpc_update_followup(uuid, public.followup_status, text, timestamptz, text, text, text, public.contact_event_type, uuid) to authenticated;
