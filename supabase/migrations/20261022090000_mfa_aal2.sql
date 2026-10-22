-- =============================================================================
-- 0009 · is_admin() exige segundo factor (AAL2) cuando el usuario tiene MFA
-- -----------------------------------------------------------------------------
-- Motivo: hoy basta tener fila en profiles para ser administrador. Con MFA TOTP
-- enrolado en Supabase Auth, una contraseña robada seguía abriendo el panel con
-- una sesión AAL1 (primer factor solamente). Esta migración cierra ese hueco sin
-- tocar RPC ni políticas: todas llaman a is_admin(), así que heredan la regla.
--
-- Contrato:
--   is_admin() = true  ⇔  auth.uid() tiene fila en public.profiles
--                          Y ( el usuario no tiene factores MFA verificados
--                              O  auth.jwt()->>'aal' = 'aal2' )
--
-- Decisiones:
--
-- · ¿Por qué leer auth.mfa_factors y no una tabla propia en public?
--   `auth.mfa_factors` es la fuente de verdad de GoTrue: es donde el enrolamiento
--   escribe el factor y donde el challenge lo marca `verified`. Duplicar ese
--   estado en public obligaría a mantenerlo sincronizado desde el frontend y
--   abriría la puerta a que las dos copias discrepen; la copia local podría
--   quedar en "sin factor" mientras GoTrue sí exige TOTP, y el segundo factor se
--   volvería opcional sin que nadie lo note. Además el estado tiene que ser el
--   del servidor de auth, no algo que el cliente pueda declarar.
--   La función es SECURITY DEFINER y su dueño (postgres, con BYPASSRLS) puede
--   leer `auth`; `auth.mfa_factors` tiene RLS activa sin políticas, así que un
--   rol normal obtendría 0 filas. `row_security = off` convierte ese escenario
--   en un error visible en vez de en un "no hay factores" silencioso: si algún
--   día la función quedara en manos de un rol sin BYPASSRLS, el panel falla
--   cerrado (error) en lugar de degradar el MFA a opcional.
--
-- · ¿Por qué `aal` sale del JWT y no de una consulta al servidor de auth?
--   El claim `aal` lo firma GoTrue al emitir/renovar el token; el cliente no
--   puede fabricarlo. Es la única prueba de que ESTA sesión pasó el segundo
--   factor, no solo de que el usuario lo tenga enrolado. Un token AAL1 de un
--   usuario con MFA vale lo mismo que una contraseña: no autoriza.
--   Si `auth.jwt()` viniera nulo (llamada interna sin request JWT) se asume
--   `aal1`: con factores verificados devuelve false. Es correcto y deliberado;
--   las RPC se invocan siempre con JWT de usuario.
--
-- · Factores `unverified` no cuentan. Un enrolamiento a medias (usuario que
--   escaneó el QR pero no confirmó el código) no puede dejar fuera al admin.
--
-- · Si se elimina el último factor verificado, la rama "no tiene factores"
--   vuelve a ser cierta y basta `aal1`. El requisito sigue al estado real del
--   usuario; no hay que tocar esta función al desenrolar.
--
-- · Sin cambios de firma ni de privilegios: `create or replace` conserva la ACL
--   existente; se repiten REVOKE/GRANT para que el estado quede explícito.
--
-- Reversible: volver a la definición de 20261021090300 (solo `exists profiles`).
-- No borra datos, no reescribe filas, no requiere backfill.
-- =============================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
           select 1
             from public.profiles p
            where p.id = auth.uid()
         )
         and (
           not exists (
             select 1
               from auth.mfa_factors f
              where f.user_id = auth.uid()
                and f.status = 'verified'
           )
           or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
         );
$$;

comment on function public.is_admin() is
  'true si auth.uid() tiene fila en profiles y, cuando ese usuario tiene factores MFA verificados, la sesión es aal2. Factores no verificados no cuentan; al eliminar el último factor verificado vuelve a bastar aal1. Única fuente de autorización.';

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
