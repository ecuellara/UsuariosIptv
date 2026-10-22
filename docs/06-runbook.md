# Runbook operativo

Procedimientos que la app cita y que, sin este documento, no existían.
Ninguno requiere `service_role` en el navegador ni en el repo.

## 1. Recuperación de la cuenta del administrador

La autorización real es `profiles` + RLS. Un usuario de `auth.users` **sin** fila en
`profiles` no ve ni escribe nada, aunque pueda iniciar sesión.

### Caso A — olvidé la contraseña (con email configurado)
1. Supabase → Authentication → Users → usuario admin → *Send password recovery*.
2. Si el correo no llega, el proyecto free usa el mailer compartido de Supabase y tiene
   límite por hora. Configura SMTP propio antes de depender de esto.
3. Al entrar, verifica que `profiles` siga teniendo tu fila:
   ```sql
   select p.id, p.display_name from public.profiles p;
   ```

### Caso B — perdí el acceso al email o no hay SMTP
Requiere la contraseña de la base (`.secrets/supabase-db-password.txt`, fuera de git).

```sql
-- 1. Crear/reemplazar el usuario desde SQL NO es recomendable (GoTrue cifra con su
--    propio esquema). En su lugar, usa la API de administración desde una máquina
--    de confianza con la secret key del proyecto:
--    POST https://<ref>.supabase.co/auth/v1/admin/users
--    { "email": "...", "password": "...", "email_confirm": true }
--    Header: apikey + Authorization: Bearer <secret key>
```
1. Genera una contraseña nueva y guárdala en tu gestor (no en el repo).
2. Asegura la fila de perfil:
   ```sql
   insert into public.profiles (id, display_name)
   values ('<uuid-de-auth.users>', 'Escriba su nombre')
   on conflict (id) do update set display_name = excluded.display_name;
   ```
3. Revoca sesiones viejas: Authentication → Sessions → *Revoke all*.
4. Registra el incidente (fecha, motivo) fuera de la app.

### Caso C — la fila de `profiles` se borró
Es el único modo de perder acceso **con** la cuenta válida. Reinsértala con el mismo `id`
de `auth.users`. No hace falta recrear el usuario.

### Caso D — perdí el autenticador TOTP
Con MFA activo, `is_admin()` exige `aal2`: sin el código no se lee ni se escribe nada.
El factor vive en `auth.mfa_factors` y **no** se puede quitar desde la app (pide el código actual).

Desde una máquina de confianza, con la contraseña de la base:

```sql
-- 1. Localiza el factor del administrador (nunca borres a ciegas).
select id, user_id, factor_type, status, friendly_name, created_at
from auth.mfa_factors
where user_id = '<uuid del admin>';

-- 2. Elimina solo el factor TOTP verificado de ese usuario.
delete from auth.mfa_factors
where user_id = '<uuid del admin>'
  and factor_type = 'totp'
  and status = 'verified';
```

Al quedar sin factores verificados, `is_admin()` vuelve a aceptar `aal1` y el login pide solo
la contraseña. Entra, cambia la contraseña y vuelve a enrolar el 2FA.

Registra el incidente (fecha, motivo, quién lo hizo) y considera rotar la contraseña de la base
si el acceso fue sospechoso.

## 2. Backup

El plan gratuito de Supabase **no incluye backups automáticos ni PITR**.

```powershell
# Requiere la contraseña de la base y Docker.
$pw  = (Get-Content .secrets\supabase-db-password.txt -Raw) -replace '^SUPABASE_DB_PASSWORD=',''
$url = "postgresql://postgres.undqtctcckdfycdeknus:$([uri]::EscapeDataString($pw))@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
docker run --rm -v "E:\UsuariosIptv\.secrets\backups:/backup" `
  public.ecr.aws/supabase/postgres:17.11.0.004 `
  pg_dump --no-owner --no-privileges -Fc -f "/backup/iptv-$(Get-Date -Format yyyyMMdd-HHmmss).dump" $url
```

Reglas:
- El dump contiene `auth.users` (hashes) y PII de clientes: **cifra el archivo** antes de
  sacarlo de la máquina (`age`, `gpg` o volumen cifrado con BitLocker).
- Restringe la carpeta al usuario actual:
  `icacls .secrets /inheritance:r /grant:r "$env:USERNAME:(OI)(CI)F"`
- Retención sugerida: 30 diarios + 12 mensuales, fuera del disco de trabajo.
- Automatiza con una tarea programada o GitHub Action; un backup manual no es un backup.

## 3. Restauración (probar al menos una vez al trimestre)

Nunca restaures sobre producción sin haber probado antes.

1. Crea una base de prueba (contenedor local o proyecto free aparte).
2. Restaura:
   ```powershell
   docker run --rm -v "E:\UsuariosIptv\.secrets\backups:/backup" `
     public.ecr.aws/supabase/postgres:17.11.0.004 `
     pg_restore --no-owner --no-privileges -d "postgresql://postgres:postgres@host.docker.internal:54322/postgres" `
     "/backup/<archivo>.dump"
   ```
3. Verifica que los conteos cuadren con el original:
   ```sql
   select
     (select count(*) from public.renewals)              as renewals,
     (select count(*) from public.payments)              as payments,
     (select count(*) from public.token_movements)       as movimientos,
     (select quantity from public.token_stock)           as stock,
     (select coalesce(sum(amount),0) from public.v_cash_movements) as caja;
   ```
   **Un dump de Supabase devuelve exit 1 en un Postgres limpio** por extensiones y *event triggers*
   propiedad de `supabase_admin` (`pgrst_ddl_watch`, `pg_graphql`, `pg_net`, `supabase_vault`).
   Eso no invalida la restauración: valida contando tablas, vistas, RPC y filas del núcleo
   (ver `docs/backups.md` §2). Para una prueba 1:1 usa un proyecto Supabase de prueba, no un
   contenedor genérico.
4. Compara `token_stock.quantity` con `sum(quantity_delta)` de `token_movements`.
5. Anota fecha, archivo y resultado en `docs/backups.md` (créalo el primer día).

## 4. Rotación de credenciales

| Secreto | Cuándo | Cómo |
|---|---|---|
| Contraseña del admin | Primer despliegue y cada 6 meses | Authentication → Users → *Reset*; actualizar gestor |
| Contraseña de la base | Si se filtró o cada 12 meses | Settings → Database → *Reset password*; actualizar `.secrets/` y el gestor |
| Publishable key | Si se revocó por abuso | Settings → API Keys → nueva clave; actualizar Cloudflare Pages y `_headers` (`connect-src` no cambia) |
| Secret key | Nunca se usa en el frontend | No se guarda en el repo |

## 5. Despliegue (Cloudflare Pages)

1. Variables del proyecto en Pages:
   - `VITE_SUPABASE_URL=https://undqtctcckdfycdeknus.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=<publishable key>`
   - Comando: `npm run build` · Salida: `dist`
2. `public/_headers` aplica CSP/HSTS. Si cambias de proyecto Supabase, actualiza `connect-src`.
3. En Supabase → Authentication → URL Configuration:
   - *Site URL*: el dominio de Pages.
   - *Redirect URLs*: el mismo dominio.
4. Smoke test tras cada deploy:
   - `/login` sin sesión → formulario.
   - Login con el admin real.
   - `/seguimiento` carga datos.
   - Abrir WhatsApp genera `wa.me` válido.
   - Registrar una renovación de prueba y revertirla.
5. Rollback: Pages conserva el deployment anterior → *Promote to production*.

## 6. Incidentes

| Síntoma | Causa probable | Acción |
|---|---|---|
| Login 422 `email_provider_disabled` | proveedor de email apagado en `config.toml` | `[auth.email] enable_signup = true` (es el interruptor del proveedor) y reiniciar |
| Todo devuelve `[]` con sesión | falta la fila en `profiles` | Caso C |
| `PGRST123` al agregar | agregados deshabilitados | usar las vistas de reporte, no sumar en el cliente |
| Tokens y libro no cuadran | escritura manual en la base | comparar `token_stock.quantity` con el libro; corregir con `rpc_adjust_tokens` y motivo |
| Cobros sin renovación vigente | renovación revertida con pagos | la reversión no devuelve dinero; registrar la devolución como gasto o ajustar con el cliente |
