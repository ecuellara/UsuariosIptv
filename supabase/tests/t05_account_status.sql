-- =============================================================================
-- t05 · Cálculo de vigencia con instante fijo
-- -----------------------------------------------------------------------------
-- Criterio (docs/03-plan.md #7): la función pura recibe el instante y no depende
-- del reloj. Se fijan los umbrales por defecto de app_settings: urgente <= 3
-- días, próximo <= 7 días.
-- =============================================================================

reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

set role authenticated;

do $$
declare
  v_at timestamptz := '2026-05-01 10:00:00-05';
  v    text;
begin
  -- Vence hoy a las 08:00 y se consulta a las 10:00: el instante ya pasó.
  v := public.account_status('2026-05-01 08:00:00-05', null, v_at);
  if v <> 'VENCIDA' then
    raise exception 'FALLO: vencida a las 08:00 => % (esperado VENCIDA)', v;
  end if;

  -- Vence hoy a las 22:00: aún no llegó la hora => URGENTE (0 días).
  v := public.account_status('2026-05-01 22:00:00-05', null, v_at);
  if v <> 'URGENTE' then
    raise exception 'FALLO: vence hoy 22:00 => % (esperado URGENTE)', v;
  end if;

  -- 2 días => URGENTE.
  v := public.account_status('2026-05-03 09:00:00-05', null, v_at);
  if v <> 'URGENTE' then
    raise exception 'FALLO: 2 días => % (esperado URGENTE)', v;
  end if;

  -- Borde exacto del umbral urgente (3 días) y primer día de próximo (4).
  v := public.account_status('2026-05-04 09:00:00-05', null, v_at);
  if v <> 'URGENTE' then
    raise exception 'FALLO: 3 días => % (esperado URGENTE)', v;
  end if;

  v := public.account_status('2026-05-05 09:00:00-05', null, v_at);
  if v <> 'PROXIMA' then
    raise exception 'FALLO: 4 días => % (esperado PROXIMA)', v;
  end if;

  -- 5 días => PROXIMA.
  v := public.account_status('2026-05-06 09:00:00-05', null, v_at);
  if v <> 'PROXIMA' then
    raise exception 'FALLO: 5 días => % (esperado PROXIMA)', v;
  end if;

  -- Borde del umbral de aviso (7 días) y primer día activo (8).
  v := public.account_status('2026-05-08 09:00:00-05', null, v_at);
  if v <> 'PROXIMA' then
    raise exception 'FALLO: 7 días => % (esperado PROXIMA)', v;
  end if;

  v := public.account_status('2026-05-09 09:00:00-05', null, v_at);
  if v <> 'ACTIVA' then
    raise exception 'FALLO: 8 días => % (esperado ACTIVA)', v;
  end if;

  -- 30 días => ACTIVA.
  v := public.account_status('2026-05-31 09:00:00-05', null, v_at);
  if v <> 'ACTIVA' then
    raise exception 'FALLO: 30 días => % (esperado ACTIVA)', v;
  end if;

  -- Archivada prevalece sobre cualquier fecha.
  v := public.account_status('2020-01-01 09:00:00-05', '2026-01-01 00:00:00-05', v_at);
  if v <> 'ARCHIVADA' then
    raise exception 'FALLO: archivada y vencida => % (esperado ARCHIVADA)', v;
  end if;

  -- El día calendario es el de Lima, no el de UTC. Con estos dos instantes, en
  -- UTC la diferencia es de 3 días (URGENTE) y en Lima de 4 (PROXIMA): manda Lima.
  v := public.account_status('2026-05-05 01:00:00-05', null, '2026-05-01 21:00:00-05');
  if v <> 'PROXIMA' then
    raise exception 'FALLO: el día calendario no se calcula en hora de Lima => %', v;
  end if;
end $$;

-- La vista debe coincidir con la función para las mismas filas.
do $$
declare
  v_customer uuid;
  v_arch     uuid;
  v_past     uuid;
  v_future   uuid;
  v_mismatch int;
begin
  insert into public.customers (first_name, last_name, phone)
  values ('Rosa', 'Paredes', '900112233')
  returning id into v_customer;

  insert into public.iptv_accounts (customer_id, external_username, purchased_at, expires_at, initial_expires_at)
  values (v_customer, 'rosa.vencida', now() - interval '60 days', now() - interval '1 day', now() - interval '1 day')
  returning id into v_past;

  insert into public.iptv_accounts (customer_id, external_username, purchased_at, expires_at, initial_expires_at)
  values (v_customer, 'rosa.activa', now() - interval '1 day', now() + interval '30 days', now() + interval '30 days')
  returning id into v_future;

  insert into public.iptv_accounts (customer_id, external_username, purchased_at, expires_at, initial_expires_at, archived_at)
  values (v_customer, 'rosa.archivada', now() - interval '90 days', now() - interval '10 days', now() - interval '10 days', now())
  returning id into v_arch;

  select count(*) into v_mismatch
    from public.v_account_status v
   where v.status <> public.account_status(v.expires_at, v.archived_at);

  if v_mismatch <> 0 then
    raise exception 'FALLO: la vista y account_status difieren en % filas', v_mismatch;
  end if;

  if (select status from public.v_account_status where id = v_past) <> 'VENCIDA' then
    raise exception 'FALLO: la vista no marca VENCIDA';
  end if;
  if (select status from public.v_account_status where id = v_future) <> 'ACTIVA' then
    raise exception 'FALLO: la vista no marca ACTIVA';
  end if;
  if (select status from public.v_account_status where id = v_arch) <> 'ARCHIVADA' then
    raise exception 'FALLO: la vista no marca ARCHIVADA';
  end if;

  -- Orden canónico: las vencidas primero.
  if (select status from public.v_account_status order by status_rank, expires_on limit 1) <> 'VENCIDA' then
    raise exception 'FALLO: el orden canónico no empieza por VENCIDA';
  end if;

  -- is_stale_verification: nunca verificado.
  if (select is_stale_verification from public.v_account_status where id = v_future) is not true then
    raise exception 'FALLO: una cuenta sin last_verified_at debe estar obsoleta';
  end if;
end $$;

reset role;
