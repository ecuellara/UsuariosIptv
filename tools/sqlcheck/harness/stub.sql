-- =============================================================================
-- Stub del entorno Supabase para PGlite (SOLO pruebas, no es una migración)
-- -----------------------------------------------------------------------------
-- PGlite es PostgreSQL puro: no trae los roles de Supabase ni el esquema auth.
-- Este archivo reproduce lo mínimo que las migraciones necesitan para aplicar:
--   · roles anon / authenticated (los que la RLS necesita)
--   · auth.users       (destino del FK de profiles)
--   · auth.uid()       (configurable con set_config('request.jwt.claim.sub', ...))
--   · auth.jwt()       (configurable con set_config('request.jwt.claims', ...))
--   · auth.mfa_factors (factores MFA; is_admin() los consulta desde 0009)
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

-- Equivalente simplificado del auth.jwt() de Supabase: devuelve los claims del
-- JWT tal cual, o NULL si no hay request (llamada interna). En las pruebas se
-- fija con:
--   select set_config('request.jwt.claims', '{"sub":"...","aal":"aal2"}', false);
-- Se mantiene deliberadamente sin fallback a `request.jwt.claim.sub`: así la
-- prueba puede reproducir el caso "JWT ausente" de una llamada interna.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
           nullif(current_setting('request.jwt.claim', true), ''),
           nullif(current_setting('request.jwt.claims', true), '')
         )::jsonb;
$$;

comment on function auth.jwt() is
  'Stub de pruebas: devuelve los claims del JWT o NULL si no hay request.';

-- Subconjunto de auth.mfa_factors (GoTrue). Solo las columnas que is_admin()
-- consulta: user_id y status. En producción status es el enum
-- auth.factor_status ('unverified' | 'verified'); aquí es text con CHECK para
-- no tener que replicar el enum del esquema auth.
create table if not exists auth.mfa_factors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  friendly_name text,
  factor_type text not null default 'totp',
  status      text not null check (status in ('unverified', 'verified')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists mfa_factors_user_id_idx
  on auth.mfa_factors (user_id);

-- Como en producción: RLS activa y sin políticas (solo el dueño / BYPASSRLS lee).
-- Sirve de canario: si is_admin() dejara de ser SECURITY DEFINER, la lectura
-- devolvería 0 factores y la prueba 2 fallaría en vez de pasar por accidente.
alter table auth.mfa_factors enable row level security;
