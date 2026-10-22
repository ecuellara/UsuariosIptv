-- =============================================================================
-- 0001 · Tipos enumerados
-- -----------------------------------------------------------------------------
-- Origen: docs/02-modelo-datos.md §1.
-- El estado de vigencia (ACTIVA/PROXIMA/URGENTE/VENCIDA/ARCHIVADA) NO es un tipo
-- persistido: se deriva en public.account_status() y en v_account_status (ADR-006).
--
-- Nota: no se crea la extensión pgcrypto. gen_random_uuid() es nativo del motor
-- desde PostgreSQL 13, así la migración aplica igual en Supabase y en PGlite.
-- =============================================================================

create type public.followup_status as enum (
  'PENDIENTE',
  'CONTACTADO',
  'EN_CONVERSACION',
  'CONFIRMADO',
  'RENOVADO',
  'NO_RENOVARA'
);

create type public.payment_method as enum (
  'YAPE',
  'PLIN',
  'TRANSFERENCIA',
  'EFECTIVO',
  'OTRO'
);

create type public.token_movement_type as enum (
  'COMPRA',
  'CONSUMO',
  'AJUSTE',
  'REVERSION'
);

create type public.renewal_operation_type as enum (
  'ACTIVACION',
  'RENOVACION'
);

-- Sin categoría de tokens a propósito: comprar tokens es conversión de caja en
-- inventario, no gasto del mes (ADR-005).
create type public.expense_category as enum (
  'OPERATIVO',
  'PUBLICIDAD',
  'HERRAMIENTAS',
  'OTRO'
);

create type public.contact_event_type as enum (
  'ENLACE_ABIERTO',
  'MENSAJE_ENVIADO',
  'RESPUESTA_RECIBIDA'
);
