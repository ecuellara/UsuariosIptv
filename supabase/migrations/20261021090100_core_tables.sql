-- =============================================================================
-- 0002 · Tablas maestras y de configuración
-- -----------------------------------------------------------------------------
-- Origen: docs/02-modelo-datos.md §2 (profiles, app_settings, customers,
-- iptv_accounts, plans).
--
-- Reglas transversales:
--  · PK uuid con gen_random_uuid().
--  · created_at timestamptz not null default now(); updated_at por trigger.
--  · Dinero numeric(12,2). Nunca float.
--  · Fechas en UTC (timestamptz). El "día" de Lima se deriva con AT TIME ZONE.
--  · Borrado lógico con archived_at; nada con movimientos se borra.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles · quién puede entrar. La ausencia de fila = sin acceso, aunque el
-- usuario exista en auth.users. is_admin() = existe fila aquí para auth.uid().
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Administradores con acceso al panel. Sin fila => sin acceso (ADR: monousuario).';

-- -----------------------------------------------------------------------------
-- app_settings · singleton tipado (ADR-009). Los umbrales viven aquí, no en el
-- frontend. `timezone` se cita porque es palabra clave en AT TIME ZONE.
-- -----------------------------------------------------------------------------
create table public.app_settings (
  id             smallint primary key default 1 check (id = 1),
  urgent_days    int  not null default 3 check (urgent_days between 0 and 30),
  warning_days   int  not null default 7 check (warning_days between 1 and 60),
  min_token_balance int not null default 5 check (min_token_balance >= 0),
  "timezone"     text not null default 'America/Lima' check ("timezone" = 'America/Lima'),
  updated_at     timestamptz not null default now(),
  constraint app_settings_umbrales_chk check (urgent_days < warning_days)
);

comment on table public.app_settings is
  'Configuración única del panel. ID fijo = 1 para que las vistas lean una sola fila.';

-- -----------------------------------------------------------------------------
-- customers · datos de contacto. phone NO es único: familias comparten número.
-- Se guarda solo dígitos (9–15); el formato se aplica al mostrar.
-- -----------------------------------------------------------------------------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  first_name  text not null check (length(btrim(first_name)) > 0),
  last_name   text not null check (length(btrim(last_name)) > 0),
  phone       text not null check (phone ~ '^[0-9]{9,15}$'),
  notes       text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.customers.phone is
  'Solo dígitos, sin + ni espacios. No es único (varias cuentas por familia).';

-- -----------------------------------------------------------------------------
-- iptv_accounts · registro local de una cuenta del proveedor externo.
-- NO existe columna de contraseña (ADR-002): solo usuario externo, referencia
-- de dónde vive la clave y fechas.
-- -----------------------------------------------------------------------------
create table public.iptv_accounts (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references public.customers (id) on delete restrict,
  external_username  text not null check (length(btrim(external_username)) > 0),
  reference          text,
  purchased_at       timestamptz not null,
  expires_at         timestamptz not null,
  initial_expires_at timestamptz not null,
  last_verified_at   timestamptz,
  notes              text,
  archived_at        timestamptz,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint iptv_accounts_expira_despues_de_compra_chk check (expires_at > purchased_at)
);

comment on column public.iptv_accounts.initial_expires_at is
  'Vencimiento del alta. Base para recalcular expires_at tras una reversión.';
comment on column public.iptv_accounts.last_verified_at is
  'Última confirmación manual de la fecha contra el panel del proveedor.';

-- Un mismo usuario IPTV no puede repetirse entre cuentas activas locales.
-- Parcial: una cuenta archivada libera el nombre.
create unique index iptv_accounts_external_username_active_ux
  on public.iptv_accounts (lower(external_username))
  where archived_at is null;

-- Consulta: "qué vence en los próximos N días" (dashboard y seguimiento).
create index iptv_accounts_expires_at_idx on public.iptv_accounts (expires_at);
-- Consulta: cuentas de un cliente en su ficha.
create index iptv_accounts_customer_id_idx on public.iptv_accounts (customer_id);
-- Consulta: cuentas no archivadas ordenadas por vencimiento (listado principal).
create index iptv_accounts_archived_expires_idx on public.iptv_accounts (archived_at, expires_at);

-- -----------------------------------------------------------------------------
-- plans · catálogo editable. Los cuatro campos comerciales se congelan como
-- snapshot en cada renovación.
-- -----------------------------------------------------------------------------
create table public.plans (
  id              uuid primary key default gen_random_uuid(),
  key             text not null unique check (key ~ '^[A-Z0-9_]+$'),
  name            text not null check (length(btrim(name)) > 0),
  duration_months int not null check (duration_months > 0),
  devices         int not null check (devices in (1, 3)),
  suggested_price numeric(12,2) not null check (suggested_price >= 0),
  tokens_required int not null check (tokens_required >= 0),
  is_active       boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column public.plans.key is
  'Clave estable usada por el frontend: 1M_1D, 1M_3D, 3M_3D, 6M_3D, 12M_3D.';
