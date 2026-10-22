-- =============================================================================
-- Stub del entorno Supabase para PGlite (SOLO pruebas, no es una migración)
-- -----------------------------------------------------------------------------
-- PGlite es PostgreSQL puro: no trae los roles de Supabase ni el esquema auth.
-- Este archivo reproduce lo mínimo que las migraciones necesitan para aplicar:
--   · roles anon / authenticated (los que la RLS necesita)
--   · auth.users  (destino del FK de profiles)
--   · auth.uid()  (configurable con set_config('request.jwt.claim.sub', ...))
--
-- NO se aplica en Supabase: allí estos objetos ya existen.
-- =============================================================================

create role anon nologin noinherit;
create role authenticated nologin noinherit;

-- Supabase ejecuta las sesiones con TimeZone = UTC. PGlite arranca en
-- Etc/GMT+5, así que se iguala el entorno: si no, una suma de meses hecha en el
-- huso de sesión parecería correcta aquí y fallaría en producción.
set timezone = 'UTC';

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key,
  email text
);

-- Equivalente simplificado del auth.uid() de Supabase: lee el claim `sub` de la
-- sesión. En las pruebas se fija con:
--   select set_config('request.jwt.claim.sub', '<uuid>', false);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

comment on function auth.uid() is
  'Stub de pruebas: devuelve el claim sub de la sesión o NULL.';
