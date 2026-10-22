# 07 — CI, despliegue y rollback

Procedimiento operativo para publicar el panel. **Nada de este documento se ejecuta solo**:
la CI valida, el despliegue lo dispara una persona y las migraciones se aplican a mano.

- Hosting primario: **Cloudflare Pages**.
- Hosting alternativo (también configurado, sin desplegar): **Vercel**.
- Base de datos: Supabase cloud `undqtctcckdfycdeknus` (us-east-1, plan free: **sin PITR ni
  backups automáticos**, ver `docs/06-runbook.md` §2 y `.github/workflows/backup.yml`).

---

## 1. Qué hace la CI y qué no

`.github/workflows/ci.yml` se ejecuta en cada `push` a `main` y en cada `pull_request`:

| Paso | Comando | Falla el pipeline |
|---|---|---|
| Secretos | `gitleaks/gitleaks-action@v2` (historial completo) | sí |
| Instalar | `npm ci` (Node 24, caché npm) | sí |
| Tipos | `npm run typecheck` | sí |
| Lint | `npm run lint` | sí |
| Tests | `npm run test` (Vitest) | sí |
| Build | `npm run build` con `VITE_*` **placeholder** | sí |
| Guardas | `dist/` no contiene `service_role` ni una secret key real (`sb_secret_<valor>`), y sí contiene las variables inyectadas | sí |
| SQL | `npm ci --prefix tools/sqlcheck` + `node tools/sqlcheck/run.mjs` (PGlite, 10 pruebas) | sí |
| Audit | `npm audit --omit=dev --audit-level=high` | **no** (warning en el resumen) |
| Artefacto | `dist/` por 7 días | — |

La CI **no** despliega, **no** hace `supabase db push` y **no** tiene credenciales del proyecto.
El build de CI usa `https://ci-placeholder.supabase.co` y una publishable key falsa solo para
compilar; no se publica ese artefacto en ningún hosting.

> Nota gitleaks: la acción oficial funciona sin licencia en cuentas personales. Si el repo pasa
> a una organización, hay que crear el secreto `GITLEAKS_LICENSE`. Si aparece un falso positivo,
> la corrección es un `.gitleaks.toml` con `allowlist` acotado (ruta + regex), nunca desactivar
> el escaneo.

---

## 2. Matriz de entornos

| Entorno | Frontend | Datos | Variables | Quién despliega |
|---|---|---|---|---|
| Local | `npm run dev` (5173) | Supabase local (`supabase start`) o cloud en lectura | `.env.development.local` (no versionado) | — |
| Preview | Deploy de preview de Pages/Vercel | **mismo proyecto cloud** | mismas `VITE_*` de producción | automático por rama/PR |
| Producción | Pages (dominio principal) | proyecto cloud `undqtctcckdfycdeknus` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | manual, aprobado |

Advertencia sobre preview: hoy no hay un Supabase de staging. Un preview apunta a la **base de
producción**; úsalo solo para revisar UI con la sesión del admin y **no** para probar mutaciones
destructivas. Si se necesita staging real, crear un segundo proyecto free y un `VITE_*` por
entorno (el código no cambia).

### Secretos y variables (solo nombres)

| Nombre | Dónde | Valor | Notas |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Pages + Vercel (Production y Preview) | `https://undqtctcckdfycdeknus.supabase.co` | público (va en el bundle) |
| `VITE_SUPABASE_ANON_KEY` | Pages + Vercel (Production y Preview) | `sb_publishable_…` | público, protegido por RLS |
| `NODE_VERSION` | Pages | `24` | Pages usa Node 22 por defecto |
| `SUPABASE_DB_PASSWORD` | GitHub Actions secret | contraseña de la base | solo para `backup.yml` |
| `BACKUP_AGE_PUBLIC_KEY` | GitHub Actions secret | `age1…` | cifrado obligatorio del dump |
| `GITLEAKS_LICENSE` | GitHub Actions secret | opcional | solo si el repo es de una organización |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secret | **no creados** | solo si más adelante se automatiza el deploy |
| `VERCEL_TOKEN` | GitHub Actions secret | **no creado** | idem |

Lo que **no** existe en ningún entorno: `service_role`, `sb_secret_…`, contraseña de IPTV,
contraseña de la base en variables `VITE_*`. La publishable key es pública por diseño; la
seguridad real es RLS + `profiles` (`docs/02-modelo-datos.md`).

---

## 3. Cloudflare Pages (hosting principal)

### 3.1 Archivos que ya están en el repo

- `public/_headers`: CSP, HSTS, `X-Frame-Options`, cache de `/assets/*`, `no-cache` para
  `index.html` y `theme-init.js`. Pages lo copia a `dist/` y lo aplica.
- **No hay `public/_redirects` ni `wrangler.toml`, a propósito.**
  - Pages sirve la SPA automáticamente: si **no** existe `404.html` en la raíz, cualquier ruta
    que no corresponda a un asset devuelve `/index.html`
    (<https://developers.cloudflare.com/pages/configuration/serving-pages/>).
  - Un catch-all `/* /index.html 200` en `_redirects` **rompería** el sitio: la documentación de
    Pages dice que los redirects se aplican "regardless of whether or not an asset matches the
    incoming request", así que `/assets/*.js` devolvería HTML
    (<https://developers.cloudflare.com/pages/configuration/redirects/>).
  - `wrangler.toml` solo hace falta para `wrangler pages deploy` (subida directa). Con
    integración Git no se usa; si algún día se automatiza, se añade
    `pages_build_output_dir = "dist"` y el token correspondiente.

### 3.2 Crear el proyecto (una vez)

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Repo `E:\UsuariosIptv` (GitHub). Rama de producción: `main`.
3. Configuración de build:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: *(vacío)*
4. **Variables and Secrets** (Production **y** Preview):
   - `NODE_VERSION=24`
   - `VITE_SUPABASE_URL=https://undqtctcckdfycdeknus.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=<publishable key del proyecto>`
5. **Save and Deploy**. El primer build debe terminar con `dist/index.html` + `dist/assets/*`.
6. Dominio: **Custom domains** → añadir el dominio y esperar el certificado. Anotar la URL final
   (`https://<proyecto>.pages.dev` o el dominio propio); se usa en el paso 5.

> Las `VITE_*` se **inyectan en tiempo de build**. Cambiar la clave o la URL exige un
> redeploy, no basta con guardar la variable.

### 3.3 Verificación del artefacto

Antes de promover, en el resumen del build o descargando el artefacto `dist-<sha>` de la CI:

```bash
grep -rl "undqtctcckdfycdeknus.supabase.co" dist/assets | head
grep -rl "service_role" dist && echo "FALLO: service_role en el bundle"
```

`dist/` está en `.gitignore`: no se versiona. El artefacto válido es el que produce el hosting
con sus variables. El `dist/` de este checkout se regeneró con las variables de producción al
preparar este documento (ver §7); un `dist/` viejo, compilado sin variables, cae en el fallback
`http://127.0.0.1:54321` de `src/lib/supabase.ts` y **no** se puede publicar.

---

## 4. Vercel (alternativa ya configurada)

`vercel.json` reproduce lo que Vercel no lee de `public/_headers`:

- `rewrites: /(.*) → /index.html`: fallback SPA. Vercel da precedencia al filesystem antes de
  aplicar rewrites, así que `/assets/*` sigue sirviéndose como asset.
- `headers`: CSP/HSTS/`X-Frame-Options`/`Referrer-Policy`/`Permissions-Policy`/COOP/CORP,
  `Cache-Control` inmutable para `/assets/(.*)`, `no-cache` para `/index.html` y
  `/theme-init.js`.
- `installCommand: npm ci`, `buildCommand: npm run build`, `outputDirectory: dist`.

Pasos:

1. Vercel Dashboard → **Add New** → **Project** → importar el repo.
2. Framework preset: **Vite** (detecta `vercel.json`, no hace falta tocar build/output).
3. **Environment Variables** (Production y Preview): las mismas tres de §3.2.
4. **Settings → General → Node.js Version: 24** (Vercel no lee `NODE_VERSION` de Pages).
5. **Deploy**. Revisar que `https://<proyecto>.vercel.app/clientes` (ruta profunda, recarga
   directa) devuelve la app y no 404.
6. Dominio: **Settings → Domains**. Anotar la URL para el paso 5.

No ejecutes `vercel deploy` desde este repo sin aprobación: no hay token configurado y el
despliegue es manual por la UI.

---

## 5. Supabase Auth: URLs de producción

Dashboard → **Authentication** → **URL Configuration**:

| Campo | Valor |
|---|---|
| Site URL | `https://<dominio-de-produccion>` (Pages o Vercel) |
| Redirect URLs | `https://<dominio-de-produccion>/**` |
| Redirect URLs (preview) | `https://*.pages.dev/**` solo si se usan previews con auth |

Contexto: el login es `signInWithPassword` y el cliente usa `detectSessionInUrl: false`, así que
no hay callback OAuth. Estas URLs importan para los enlaces de recuperación que envía Supabase
desde el dashboard (`Send password recovery`) y para cualquier flujo futuro con redirect.

Además, tras el primer deploy, crear la fila de `profiles` del admin si no existe
(`docs/06-runbook.md` §1, caso C) y comprobar que el registro público sigue cerrado
(`enable_signup = false`).

---

## 6. Orden de despliegue (con backup y migraciones)

Regla: **el esquema va antes que el frontend** si el frontend nuevo depende de columnas/RPC
nuevas (expand), y **el contrato se cierra después** de que el frontend viejo deje de usarse
(contract). Nunca al revés.

1. **Backup manual antes de tocar la base** (obligatorio; el diario no cubre "justo ahora"):
   ```powershell
   # Windows, con Docker. Ver docs/06-runbook.md §2 para el comando completo.
   # Resultado esperado: .secrets\backups\pre-<cambio>-<fecha>.dump
   ```
   O lanzar `Backup base de datos` desde **Actions → Run workflow** y descargar el `.age`.
2. **Migración (expand)**: nueva carpeta en `supabase/migrations/` con timestamp posterior.
   - Aditiva: `add column ... null`, `create table`, `create or replace function`, vistas nuevas.
   - No renombrar/eliminar en el mismo despliegue que introduce el cambio de frontend.
   - Aplicar a mano y con aprobación:
     `supabase db push --project-ref undqtctcckdfycdeknus` **o** pegar el SQL en el SQL Editor.
   - Verificar: `select * from supabase_migrations.schema_migrations order by version desc limit 5;`
3. **Deploy del frontend** (Pages: *Retry deployment* / push a `main`; Vercel: *Redeploy*).
4. **Smoke test** (§8). Si falla → rollback (§9).
5. **Migración (contract)**: en un despliegue posterior, cuando ya no queden clientes con el
   bundle viejo (Pages cachea `index.html` con `no-cache`, así que suele ser inmediato).
6. Registrar el cambio en `docs/backups.md` si hubo restauración.

Reglas de migración:
- Una migración nueva = actualizar `docs/02-modelo-datos.md`.
- Toda migración destructiva (`drop`, `alter type`, `not null` sobre datos existentes) requiere
  backup verificado **y** plan de rollback escrito en el PR.
- El rollback de una migración **no** es `db reset`: es una migración compensatoria o restaurar
  el dump en un proyecto limpio.

`supabase db push` mueve el esquema de **producción**: no se ejecuta en CI ni sin confirmación
explícita.

---

## 7. Por qué el `dist/` de un build sin variables no es desplegable

Evidencia (build **sin** `VITE_*`, como el que quedó en `dist/` del commit `7374209`):

```
grep -r "undqtctcckdfycdeknus" dist\assets        -> sin resultados
grep -r "127.0.0.1:54321" dist\assets             -> mappers-*.js
grep -r "missing-anon-key" dist\assets            -> mappers-*.js
```

`src/lib/supabase.ts` hace `import.meta.env.VITE_SUPABASE_URL ?? ''` y, si falta, cae en
`http://127.0.0.1:54321` con la clave `missing-anon-key`, avisando por consola. En el navegador
del usuario eso es una app que no puede autenticar.

Solución: compilar **con** las variables del proyecto. Verificado en este repo:

```
$env:VITE_SUPABASE_URL='https://undqtctcckdfycdeknus.supabase.co'
$env:VITE_SUPABASE_ANON_KEY='sb_publishable_…'
npm run build
# dist/assets/mappers-*.js
PRESENTE: undqtctcckdfycdeknus
AUSENTE:  127.0.0.1:54321
AUSENTE:  missing-anon-key
AUSENTE:  service_role
```

Queda el literal `127.0.0.1` suelto en `dist/assets/mappers-*.js`: es parte de
`@supabase/supabase-js` (lista de hosts locales que usa para avisos), **no** la URL configurada.
La comprobación válida es que aparezca la URL de producción, que **no** aparezca
`127.0.0.1:54321` ni `missing-anon-key`, y que no aparezca `service_role`.

---

## 8. Smoke test post-deploy

Ejecutar en el dominio real, en ventana privada:

1. `https://<dominio>/` sin sesión → redirige a `/login` (history mode, sin `#`).
2. Login con el admin real → entra al dashboard.
3. Recargar `https://<dominio>/seguimiento` directamente (F5 en ruta profunda) → carga la app.
4. `https://<dominio>/assets/...js` devuelve JavaScript (no HTML) → confirma que el fallback SPA
   no se comió los assets.
5. DevTools → Network: las peticiones a Supabase van a `undqtctcckdfycdeknus.supabase.co`; no
   hay ninguna a `127.0.0.1` ni errores de CSP en consola.
6. Dashboard con datos, `/clientes` con paginación y `/renovaciones` con una renovación de
   prueba; revertirla y comprobar que `token_stock` vuelve al valor previo.
7. Respuesta HTTP de `/`: `Strict-Transport-Security`, `Content-Security-Policy`,
   `X-Frame-Options: DENY` presentes (`curl -I`).
8. `https://<dominio>/robots.txt` responde `Disallow: /` y no se indexa (`noindex`).

Si algo falla: no aplicar la migración `contract` y pasar a rollback.

---

## 9. Rollback

### Frontend

- **Cloudflare Pages**: *Deployments* → elegir el deployment anterior → **Rollback** (o
  *Promote to production*). Es inmediato y no toca la base.
- **Vercel**: *Deployments* → deployment anterior → **Instant Rollback**.
- Última red: `git revert <sha>` en `main` y dejar que el hosting reconstruya.

### Base de datos

El plan free no tiene PITR. Opciones, en orden:

1. **Migración compensatoria** (`create or replace`, `alter ... drop`, etc.) si el cambio fue
   aditivo. Es el camino normal y no pierde datos nuevos.
2. **Restaurar el dump** solo si hay corrupción o pérdida:
   - Crear una base/proyecto de prueba **nunca** producción directa.
   - Descargar el `.age` de Actions, descifrar:
     `age --decrypt -i key.txt -o restore.dump backup.dump.age`
   - `pg_restore --no-owner --no-privileges -d "<url de prueba>" restore.dump`
   - Comparar conteos (`renewals`, `payments`, `token_movements`, `token_stock`, caja) contra
     `docs/06-runbook.md` §3 y anotar en `docs/backups.md`.
   - Recién entonces, si el usuario lo aprueba, repetir contra producción **con la app en
     mantenimiento** (el frontend no escribe durante la restauración).

Nunca borres un entorno ni un dump sin backup previo.

---

## 10. Automatizar el backup (GitHub Actions)

Crear el par de claves **en tu máquina**, no en el repo:

```bash
age-keygen -o key.txt          # guarda key.txt en tu gestor de contraseñas, no en el repo
# la salida "Public key: age1..." es BACKUP_AGE_PUBLIC_KEY
```

Luego, en GitHub: **Settings → Secrets and variables → Actions → New repository secret**:

| Secreto | Valor |
|---|---|
| `SUPABASE_DB_PASSWORD` | contraseña de la base (Settings → Database → Reset) |
| `BACKUP_AGE_PUBLIC_KEY` | `age1…` del paso anterior |

`.github/workflows/backup.yml` corre a las **07:00 UTC** (02:00 Lima) y con
`workflow_dispatch`. Hace `pg_dump -Fc` contra el pooler
`aws-0-us-east-1.pooler.supabase.com:5432` como `postgres.undqtctcckdfycdeknus`, verifica
tamaño (≥ 50 KB) y que `pg_restore --list` lo lea, exige las tablas del núcleo, cifra con
`age` y sube **solo** el `.age` como artefacto con 30 días de retención. Si algo falla, no sube
nada.

Descargar: **Actions → Backup base de datos → run más reciente → Artifacts**. El artefacto
cuesta espacio del plan de Actions; si se necesita retención mayor a 30 días, copiar el `.age` a
almacenamiento externo (S3/R2/BitLocker) antes de que expire.

El `toc.txt` que acompaña al artefacto lista objetos del esquema (sin datos) y sirve para
comprobar qué contiene el backup sin descifrarlo.

---

## 12. Ejecución real (2026-10-22) — Cloudflare Workers con assets

La cuenta de Cloudflare ya no crea proyectos Pages clásicos desde la CLI: `wrangler pages project create`
publica un **Worker con assets**, que es la versión actual de Pages. Por eso el despliegue se hace con
`wrangler deploy` y `wrangler.jsonc` (no con `pages deploy`).

| Dato | Valor |
|---|---|
| Cuenta | `Ecuellar.izipay@gmail.com's Account` (`9248e78d8903b595523dbdb7c48c4b01`) |
| Worker / proyecto | `iptv-manager` |
| URL de producción | `https://iptv-manager.iptv-manager.workers.dev` |
| Config | `wrangler.jsonc` → `assets.directory = ./dist`, fallback SPA |
| Site URL en Supabase Auth | la misma URL de producción |

### Comando de despliegue

```powershell
$env:VITE_SUPABASE_URL='https://undqtctcckdfycdeknus.supabase.co'
$env:VITE_SUPABASE_ANON_KEY='sb_publishable_...'
npm run build
npx wrangler@latest deploy
```

### Trampa encontrada

Un `npm run build` de desarrollo (o el que ejecuta un agente para validar) **sobrescribe `dist/`**
sin las variables de producción. Si se despliega ese `dist`, la app arranca con
«Falta la configuración de Supabase». Antes de cada deploy, verifica:

```powershell
Select-String -Path dist\assets\*.js -Pattern 'undqtctcckdfycdeknus' -Quiet   # True
Select-String -Path dist\assets\*.js -Pattern 'missing-anon-key' -Quiet       # False
```
