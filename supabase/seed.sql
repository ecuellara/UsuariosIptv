-- =============================================================================
-- seed.sql · datos base del panel (ningún dato de cliente)
-- -----------------------------------------------------------------------------
-- Origen: docs/02-modelo-datos.md §6 y docs/00-kickoff.md §8.
-- Se puede aplicar varias veces sin duplicar: todos los INSERT son idempotentes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configuración única (ADR-009). Umbrales por defecto: urgente 3, próximo 7,
-- saldo mínimo 5 tokens.
-- -----------------------------------------------------------------------------
insert into public.app_settings (id, urgent_days, warning_days, min_token_balance, "timezone")
values (1, 3, 7, 5, 'America/Lima')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Planes comerciales de la ficha de kickoff. Editables desde la UI; cada
-- operación guarda su propio snapshot.
-- -----------------------------------------------------------------------------
insert into public.plans (key, name, duration_months, devices, suggested_price, tokens_required, sort_order)
values
  ('1M_1D',  '1 mes / 1 dispositivo',    1, 1,  13.00,  1, 1),
  ('1M_3D',  '1 mes / 3 dispositivos',   1, 3,  15.00,  1, 2),
  ('3M_3D',  '3 meses / 3 dispositivos', 3, 3,  40.00,  3, 3),
  ('6M_3D',  '6 meses / 3 dispositivos', 6, 3,  75.00,  5, 4),
  ('12M_3D', '12 meses / 3 dispositivos',12, 3, 150.00, 11, 5)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Plantillas de WhatsApp. Variables permitidas:
--   {nombre} {apellido} {usuario} {plan} {fecha_vencimiento} {dias_restantes}
-- Prohibido {password} (ADR-002); la tabla lo bloquea con un CHECK.
-- -----------------------------------------------------------------------------
insert into public.whatsapp_templates (key, name, body)
values
  (
    'BIENVENIDA',
    'Bienvenida',
    E'Hola {nombre}, tu cuenta IPTV ya está activa.\n'
    'Usuario: {usuario}\n'
    'Plan: {plan}\n'
    'Vence el {fecha_vencimiento}.\n'
    'Cualquier consulta me escribes por aquí.'
  ),
  (
    'RECORDATORIO',
    'Recordatorio de vencimiento',
    E'Hola {nombre}, te recuerdo que tu cuenta IPTV vence el {fecha_vencimiento} '
    '(te quedan {dias_restantes} días).\n'
    '¿Deseas renovarla para no perder el servicio?'
  ),
  (
    'VENCIDO',
    'Cuenta vencida',
    E'Hola {nombre}, tu cuenta IPTV venció el {fecha_vencimiento}.\n'
    'Para reactivarla escríbeme y la dejamos lista hoy mismo.'
  ),
  (
    'RENOVACION_CONFIRMADA',
    'Renovación confirmada',
    E'Hola {nombre}, tu renovación quedó confirmada.\n'
    'Plan: {plan}\n'
    'Nuevo vencimiento: {fecha_vencimiento}.\n'
    'Gracias por la preferencia.'
  )
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Saldo inicial de tokens: vacío. Toda compra entra por rpc_purchase_tokens.
-- -----------------------------------------------------------------------------
insert into public.token_stock (id, quantity, avg_unit_cost)
values (1, 0, 0)
on conflict (id) do nothing;
