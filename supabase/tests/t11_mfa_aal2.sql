-- =============================================================================
-- t11 · is_admin() exige AAL2 cuando el usuario tiene MFA verificado
-- -----------------------------------------------------------------------------
-- Contrato (migración 20261022090000):
--   is_admin() = fila en profiles para auth.uid()
--                AND ( sin factores MFA verificados
--                      OR auth.jwt()->>'aal' = 'aal2' )
--
-- El `aal` se lee del JWT (`request.jwt.claims` en el stub). Los factores se leen
-- de auth.mfa_factors, que en el stub tiene RLS activa y sin políticas: la prueba
-- solo pasa si is_admin() sigue siendo SECURITY DEFINER con un dueño que lee.
-- =============================================================================

reset role;

-- Sesión del administrador de fixtures: sub para auth.uid() y claims (con aal)
-- para auth.jwt().
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","aal":"aal1"}',
  false
);

-- -----------------------------------------------------------------------------
-- 0. La función mantiene sus propiedades de seguridad
-- -----------------------------------------------------------------------------
do $$
declare
  v_secdef   boolean;
  v_volatile "char";
  v_config   text[];
begin
  select p.prosecdef, p.provolatile, p.proconfig
    into v_secdef, v_volatile, v_config
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname = 'is_admin'
     and p.pronargs = 0;

  if v_secdef is not true then
    raise exception 'FALLO (0): is_admin() dejó de ser SECURITY DEFINER';
  end if;
  if v_volatile <> 's' then
    raise exception 'FALLO (0): is_admin() dejó de ser STABLE (%)', v_volatile;
  end if;
  if v_config is null or not ('search_path=public' = any (v_config)) then
    raise exception 'FALLO (0): is_admin() perdió search_path=public (%)', v_config;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Sin factores MFA + aal1 → true
-- -----------------------------------------------------------------------------
set role authenticated;

do $$
begin
  if public.is_admin() is not true then
    raise exception 'FALLO (1): aal1 sin factores MFA debe ser administrador';
  end if;
end $$;

reset role;

-- -----------------------------------------------------------------------------
-- 2. Un factor `verified` + aal1 → false
-- -----------------------------------------------------------------------------
insert into auth.mfa_factors (user_id, friendly_name, factor_type, status)
values ('11111111-1111-1111-1111-111111111111', 'Telefono admin', 'totp', 'verified');

set role authenticated;

do $$
begin
  if public.is_admin() is not false then
    raise exception 'FALLO (2): con factor verificado y aal1, is_admin() debe ser false';
  end if;
end $$;

reset role;

-- -----------------------------------------------------------------------------
-- 3. El mismo factor `verified` + aal2 → true
-- -----------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","aal":"aal2"}',
  false
);

set role authenticated;

do $$
begin
  if public.is_admin() is not true then
    raise exception 'FALLO (3): con factor verificado y aal2, is_admin() debe ser true';
  end if;
end $$;

reset role;

-- -----------------------------------------------------------------------------
-- 4. Un factor `unverified` + aal1 → true (no cuenta hasta verificarlo)
-- -----------------------------------------------------------------------------
delete from auth.mfa_factors
 where user_id = '11111111-1111-1111-1111-111111111111';

insert into auth.mfa_factors (user_id, friendly_name, factor_type, status)
values ('11111111-1111-1111-1111-111111111111', 'Telefono admin', 'totp', 'unverified');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","aal":"aal1"}',
  false
);

set role authenticated;

do $$
begin
  if public.is_admin() is not true then
    raise exception 'FALLO (4): un factor sin verificar no debe exigir aal2';
  end if;
end $$;

reset role;

-- -----------------------------------------------------------------------------
-- 5. auth.uid() nulo → false
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '', false);

set role authenticated;

do $$
begin
  if public.is_admin() is not false then
    raise exception 'FALLO (5): sin auth.uid() is_admin() debe ser false';
  end if;
end $$;

reset role;

-- -----------------------------------------------------------------------------
-- 6. Factor verificado y JWT ausente (llamada interna) → aal ausente = aal1
-- -----------------------------------------------------------------------------
delete from auth.mfa_factors
 where user_id = '11111111-1111-1111-1111-111111111111';

insert into auth.mfa_factors (user_id, friendly_name, factor_type, status)
values ('11111111-1111-1111-1111-111111111111', 'Telefono admin', 'totp', 'verified');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
-- Sin claims: auth.jwt() = null. No debe romper ni devolver true.
select set_config('request.jwt.claims', '', false);

set role authenticated;

do $$
begin
  if public.is_admin() is not false then
    raise exception 'FALLO (6): JWT ausente con factor verificado debe ser false, no null/true';
  end if;
end $$;

reset role;

-- -----------------------------------------------------------------------------
-- 7. Sin fila en profiles sigue sin haber acceso, aunque no haya MFA
-- -----------------------------------------------------------------------------
insert into auth.users (id, email)
values ('22222222-2222-2222-2222-222222222222', 'sin-perfil@iptv.local')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","aal":"aal2"}',
  false
);

set role authenticated;

do $$
begin
  if public.is_admin() is not false then
    raise exception 'FALLO (7): un usuario sin fila en profiles nunca es administrador';
  end if;
end $$;

reset role;

-- -----------------------------------------------------------------------------
-- 8. Al quitar el último factor verificado vuelve a bastar aal1
-- -----------------------------------------------------------------------------
delete from auth.mfa_factors
 where user_id = '11111111-1111-1111-1111-111111111111';

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","aal":"aal1"}',
  false
);

set role authenticated;

do $$
begin
  if public.is_admin() is not true then
    raise exception 'FALLO (8): sin factores verificados aal1 debe volver a ser administrador';
  end if;
end $$;

reset role;
