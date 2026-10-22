# IPTV Manager — Ficha de kickoff

**Fecha:** 21/10/2026
**Tipo:** Panel/dashboard administrativo privado, monousuario.
**Moneda:** PEN (S/). **Zona horaria de presentación:** America/Lima (UTC-5, sin DST).
**Repo:** `E:\UsuariosIptv` (greenfield, sin código previo).

## 1. Problema

El administrador vende planes de IPTV de un proveedor externo y lleva el control de clientes,
vencimientos, tokens, cobros y gastos en hojas de cálculo y chats de WhatsApp. Pierde renovaciones,
no sabe cuánto gana realmente por plan y no tiene trazabilidad de tokens.

## 2. Resultado esperado

Una app web privada que, en un bucle diario de 2 minutos, permita:

1. Ver quién vence hoy / en 3 días / en 7 días.
2. Abrir WhatsApp con el mensaje ya redactado.
3. Registrar la renovación que ya se hizo en el panel del proveedor.
4. Saber el saldo de tokens y la caja del mes sin abrir Excel.

## 3. Límite esencial (no negociable)

La app **no** integra, crea, activa, suspende ni renueva cuentas en el proveedor IPTV.
Es un registro administrativo. El panel del proveedor sigue siendo la fuente de verdad de
credenciales y vigencia real.

## 4. Usuarios

Un solo administrador (el propietario). Sin registro público. Sin roles múltiples.

## 5. Alcance — dentro

Dashboard, clientes, cuentas IPTV (registro local), planes, renovaciones/activaciones,
tokens (compras, consumos, ajustes, reversiones), finanzas (cobros, gastos, caja, margen),
seguimiento por cuenta, plantillas WhatsApp, configuración.

## 6. Alcance — fuera (v1)

- Integración con API del proveedor IPTV.
- **Guardar contraseñas IPTV** (decisión cerrada: solo usuario + referencia/nota).
- Cobros en línea, pasarelas, checkouts.
- Adelantos/abonos previos a la renovación (no existen en la operación).
- Notificaciones push o envío automático de WhatsApp.
- Multi-proveedor / multi-servidor.
- Multi-tenant, roles, permisos granulares.
- Importador CSV (el alta es manual).
- App móvil nativa o PWA offline.
- Facturación electrónica / IGV / contabilidad formal.

## 7. Stack

| Capa | Tecnología |
|---|---|
| Frontend | Vue 3 + TypeScript + Vite + Tailwind CSS |
| Componentes | Reka UI / shadcn-vue (accesibles) |
| Estado | Pinia (sesión, filtros) + TanStack Query (datos remotos) |
| Validación | vee-validate + zod |
| Fechas | date-fns / date-fns-tz con `America/Lima` |
| Backend | Supabase (Auth + PostgreSQL + RLS + RPC SQL) |
| Edge Functions | Ninguna en v1 (no hay secretos que descifrar) |
| Hosting frontend | Cloudflare Pages (gratuito). Fallback aprobado: Vercel |
| Hosting datos | Supabase |

## 8. Planes comerciales (semilla, editables)

| Clave | Nombre | Meses | Dispositivos | Precio S/ | Tokens |
|---|---|---|---|---|---|
| `1M_1D` | 1 mes / 1 dispositivo | 1 | 1 | 13.00 | 1 |
| `1M_3D` | 1 mes / 3 dispositivos | 1 | 3 | 15.00 | 1 |
| `3M_3D` | 3 meses / 3 dispositivos | 3 | 3 | 40.00 | 3 |
| `6M_3D` | 6 meses / 3 dispositivos | 6 | 3 | 75.00 | 5 |
| `12M_3D` | 12 meses / 3 dispositivos | 12 | 3 | 150.00 | 11 |

Los cuatro campos (meses, dispositivos, precio, tokens) son editables por plan y **se congelan
como snapshot en cada operación**.

## 9. Definición de terminado

- [ ] Login privado funcional; sin registro público.
- [ ] RLS activo en todas las tablas; escrituras críticas solo por RPC.
- [ ] Registrar renovación es atómico e idempotente (doble clic no duplica).
- [ ] El saldo de tokens nunca queda negativo por operación ordinaria.
- [ ] Reversión deja tokens, caja y vencimiento consistentes.
- [ ] Fechas y estados coinciden con la fecha real del proveedor en America/Lima.
- [ ] Los importes cuadran al céntimo (sumas en SQL, no en JS).
- [ ] Responsive verificado en 375 px y 1440 px; contraste AA.
- [ ] Build, tipos, lint y tests en verde.
- [ ] Backup diario probado con restauración real.
- [ ] Deploy en Cloudflare Pages documentado y reversible.

## 10. Riesgos principales

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Fecha de vencimiento mal calculada | Cobro perdido / cliente cortado | Regla explícita + fecha editable + `last_verified_at` |
| Se pierde la única cuenta admin | Pérdida total de acceso | Procedimiento de recuperación documentado + 2º admin opcional |
| Tokens y caja divergen de la realidad | Margen falso | Reconciliación auditada con snapshot del proveedor |
| Plan free de Supabase pausa el proyecto | App caída | Uso diario + backup externo diario |
| Doble registro por doble clic | Inventario/caja inflados | `idempotency_key` única + unique index |
