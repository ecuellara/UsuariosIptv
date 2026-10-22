-- =============================================================================
-- Fixtures de pruebas (SOLO PGlite, no se aplica en producción)
-- -----------------------------------------------------------------------------
-- El panel es monousuario: toda prueba necesita exactamente un administrador.
-- Se inserta como dueño de las tablas porque un authenticated sin fila en
-- profiles no puede crear su propio perfil (y eso es correcto).
-- =============================================================================

insert into auth.users (id, email)
values ('11111111-1111-1111-1111-111111111111', 'admin@iptv.local')
on conflict (id) do nothing;

insert into public.profiles (id, display_name)
values ('11111111-1111-1111-1111-111111111111', 'Administrador')
on conflict (id) do nothing;
