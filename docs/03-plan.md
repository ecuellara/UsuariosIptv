# Plan de ejecución

## Principio

Una tarea, un responsable. Los archivos se escriben en secuencia cuando dos agentes comparten área.
Nada se declara terminado sin evidencia ejecutada (build, tipos, tests o SQL corrido).

## Olas

### Ola 1 — Fundación (paralelo, sin dependencias entre sí)

| # | Responsable | Entregable | Aceptación |
|---|---|---|---|
| 1.1 | `db-architect` | `supabase/config.toml`, `supabase/migrations/*.sql`, `supabase/seed.sql`, `supabase/tests/*.sql`, `docs/05-sql.md` | DDL aplica sin error; RLS y RPC según `docs/02-modelo-datos.md`; pruebas de idempotencia, saldo negativo y reversión pasan |
| 1.2 | `ui-designer` | `docs/04-diseno/DESIGN.md`, `tokens.css`, spec de componentes y pantallas, preview HTML navegable | 9 pantallas especificadas con estados carga/vacío/error/sin permiso; contraste AA; tablas → tarjetas en móvil; foco visible |

### Ola 2 — Producto

| # | Responsable | Depende de | Entregable |
|---|---|---|---|
| 2.1 | `frontend-web` | 1.1 + 1.2 | App Vue 3 + TS + Vite + Tailwind: auth, layout, clientes, cuentas, planes, renovaciones, tokens, finanzas, seguimiento, configuración |
| 2.2 | `frontend-web` | 2.1 | Flujo "Registrar renovación" desde el dashboard en < 15 s (búsqueda, prefill, fecha sugerida editable, cobro) |
| 2.3 | `media-images` | 2.1 | Assets optimizados (logo/favicon/og) en AVIF/WebP con pesos reportados. Solo si hay assets; no inventar marca |

### Ola 3 — Cierre

| # | Responsable | Depende de | Entregable |
|---|---|---|---|
| 3.1 | `security` | 2.1 | Auditoría OWASP, RLS, secretos, dependencias. Solo lectura, hallazgos con severidad |
| 3.2 | `qa-reviewer` | 2.1 | Revisión de bugs y regresiones; flujos críticos reproducidos |
| 3.3 | `devops-release` | 1.1 + 2.1 | CI (tipos, lint, tests, build), migraciones, Cloudflare Pages, backup diario y restore probado, rollback |

## Criterios de aceptación verificables (extendidos)

Además de los 15 del spec, se exigen:

1. Doble clic en "Confirmar renovación" produce **una** renovación y **un** consumo.
2. Reintento con la misma `idempotency_key` devuelve el mismo registro, no un error 500.
3. Un consumo mayor al stock es rechazado y no deja filas parciales.
4. Revertir una renovación devuelve los tokens al costo original, restaura el vencimiento previo y
   deja la caja intacta (los pagos no se borran; se muestra el margen como revertido).
5. Comprar tokens **no** aparece como gasto del mes; sí como salida de caja.
6. `SUM(payments)` de una renovación nunca supera `amount_agreed`.
7. Una cuenta que vence hoy a las 08:00 y se consulta a las 10:00 figura `VENCIDA`; una que vence
   hoy a las 22:00 figura `URGENTE`.
8. `31/01 + 1 mes = 28/02` (o 29 en bisiesto) y la fecha es editable.
9. El listado y el dashboard muestran el mismo estado para la misma cuenta.
10. Suma de importes en céntimos exactos (sin `0.30000000000000004`).
11. Archivar una cuenta la saca de los conteos pero conserva su historial.
12. Restaurar el backup reproduce exactamente `token_stock` y el saldo de caja.

## Orden interno recomendado (vertical slices)

1. Auth + layout + RLS funcionando con una tabla trivial.
2. Clientes + cuentas + planes (maestros).
3. Tokens: compras, stock, movimientos, ajustes.
4. Renovaciones + pagos (el corazón del producto).
5. Dashboard + seguimiento + WhatsApp.
6. Finanzas + reportes.
7. Configuración + exportación.
8. Hardening, backups, deploy.

## Bloqueos conocidos

- Docker daemon apagado → no hay Supabase local. Alternativa: validar SQL con PGlite o pedir al
  usuario que inicie Docker Desktop.
- No existe proyecto Supabase todavía → faltan `SUPABASE_URL`, `SUPABASE_ANON_KEY` y
  `SUPABASE_SERVICE_ROLE_KEY` (esta última solo para tareas administrativas, nunca en el frontend).
- No hay marca ni logo → `ui-designer` trabaja con una base neutra y `media-images` no interviene
  hasta que exista un asset real.
