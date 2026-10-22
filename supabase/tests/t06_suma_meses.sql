-- =============================================================================
-- t06 · Suma de meses calendario
-- -----------------------------------------------------------------------------
-- Criterio (docs/03-plan.md #8): 31/01 + 1 mes = 28/02, y 29/02 en bisiesto.
-- Se fija además el caso que rompe una suma ingenua en UTC: un vencimiento a
-- las 20:00 de Lima ya es el día siguiente en UTC, y no debe correrse un día.
-- =============================================================================

reset role;
-- Supabase corre en UTC: se fija aquí también para que la prueba no dependa del
-- huso por defecto de quien la ejecute.
set timezone = 'UTC';
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

set role authenticated;

do $$
declare
  v_got timestamptz;
begin
  v_got := public.add_months('2026-01-31 10:00:00-05', 1);
  if v_got <> '2026-02-28 10:00:00-05' then
    raise exception 'FALLO: 2026-01-31 + 1 mes => % (esperado 2026-02-28 10:00)', v_got;
  end if;

  v_got := public.add_months('2028-01-31 10:00:00-05', 1);
  if v_got <> '2028-02-29 10:00:00-05' then
    raise exception 'FALLO: 2028-01-31 + 1 mes => % (esperado 2028-02-29 10:00)', v_got;
  end if;

  -- Mismo caso en horario nocturno de Lima (UTC ya cambió de día).
  v_got := public.add_months('2026-01-30 20:00:00-05', 1);
  if v_got <> '2026-02-28 20:00:00-05' then
    raise exception 'FALLO: 2026-01-30 20:00 + 1 mes => % (esperado 2026-02-28 20:00)', v_got;
  end if;

  v_got := public.add_months('2026-03-31 10:00:00-05', 1);
  if v_got <> '2026-04-30 10:00:00-05' then
    raise exception 'FALLO: 2026-03-31 + 1 mes => % (esperado 2026-04-30)', v_got;
  end if;

  v_got := public.add_months('2026-12-15 10:00:00-05', 3);
  if v_got <> '2027-03-15 10:00:00-05' then
    raise exception 'FALLO: 2026-12-15 + 3 meses => % (esperado 2027-03-15)', v_got;
  end if;

  v_got := public.add_months('2026-02-28 10:00:00-05', 12);
  if v_got <> '2027-02-28 10:00:00-05' then
    raise exception 'FALLO: 2026-02-28 + 12 meses => % (esperado 2027-02-28)', v_got;
  end if;

  v_got := public.add_months('2026-08-31 10:00:00-05', 6);
  if v_got <> '2027-02-28 10:00:00-05' then
    raise exception 'FALLO: 2026-08-31 + 6 meses => % (esperado 2027-02-28)', v_got;
  end if;

  -- Suma de cero meses: no altera nada (ni la hora ni el día).
  v_got := public.add_months('2026-01-31 10:00:00-05', 0);
  if v_got <> '2026-01-31 10:00:00-05' then
    raise exception 'FALLO: +0 meses alteró la fecha => %', v_got;
  end if;
end $$;

reset role;
