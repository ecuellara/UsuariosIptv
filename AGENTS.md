# AGENTS.md — IPTV Manager

## Qué es

Panel administrativo privado (monousuario) para registrar clientes, cuentas IPTV de un proveedor
externo, vencimientos, tokens, cobros y gastos. **No integra ni modifica la plataforma del proveedor.**

## Lee antes de tocar código

1. `docs/00-kickoff.md` — alcance y límites.
2. `docs/01-decisiones.md` — ADR cerrados. No se reabren sin ADR nuevo.
3. `docs/02-modelo-datos.md` — contrato de datos, RLS y RPC.
4. `docs/03-plan.md` — olas, responsables y criterios de aceptación.

## Reglas duras

- **No** guardar contraseñas IPTV (ADR-002). No crear columnas, endpoints ni pantallas para eso.
- **No** escribir directamente en `renewals`, `payments`, `token_*`, `audit_log`, `contact_logs`.
  Toda mutación pasa por RPC (ADR-008).
- **No** duplicar el egreso de tokens en `expenses` (ADR-005).
- **No** calcular estados de vigencia en el frontend. Se leen de `v_account_status` (ADR-006).
- **No** sumar dinero en JavaScript. Los totales vienen de SQL.
- **No** usar `float` para importes. `numeric(12,2)`.
- **No** agregar `service_role` al bundle ni a variables `VITE_*`.
- **No** borrar filas con historial: archivar o revertir.
- **No** inventar datos, credenciales, endpoints ni métricas.

## Stack

Vue 3 + TypeScript + Vite + Tailwind CSS. Supabase (Auth, PostgreSQL, RLS, RPC). Cloudflare Pages.

## Comandos (cuando exista el scaffold)

```bash
npm install
npm run dev
npm run build
npm run typecheck
npm run lint
npm run test
```

SQL: `supabase start` (requiere Docker) · `supabase db reset` · pruebas en `supabase/tests/`.

## Convenciones

- Idioma de UI y mensajes de error: **español**.
- Código, nombres de tablas/columnas y commits: inglés.
- Fechas: persistir UTC, mostrar `America/Lima`.
- Permiso, dinero y tokens: siempre pasan por RPC + auditoría.
- Un cambio de modelo = migración nueva + actualización de `docs/02-modelo-datos.md`.

## Definición de terminado

Build, tipos, lint y tests en verde con salida fresca; criterios de aceptación de
`docs/03-plan.md` cumplidos; sin secretos en el repo; migración con rollback documentado.
