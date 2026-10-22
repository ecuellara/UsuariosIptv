# IPTV Manager — frontend

Panel administrativo privado (monousuario) para clientes, cuentas IPTV, vencimientos y caja.
Vue 3 + TypeScript + Vite + Tailwind CSS v4 + Reka UI, con Supabase (Auth, PostgreSQL, RLS, RPC).

Este README describe **el slice 1 de 2**: autenticación, shell, dashboard, clientes, cuentas IPTV
y planes. El slice 2 (renovaciones, tokens, finanzas y seguimiento) se construye sobre esta base.

---

## 1. Puesta en marcha

Requisitos: Node 20+ (probado con 24), Docker para Supabase local.

```bash
npm install
npx supabase start          # API 127.0.0.1:54321 · Studio 127.0.0.1:54323
npx supabase db reset        # migraciones + seed (borra el usuario admin: recrearlo aparte)
npm run dev                  # http://localhost:5173
```

`.env.development.local` (no se versiona) necesita solo:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<publishable/anon key local>
```

Nunca se publica `service_role` en el bundle ni en variables `VITE_*`.

### Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Vite en `:5173` |
| `npm run build` | Build estático en `dist/` (apto para Cloudflare Pages) |
| `npm run typecheck` | `vue-tsc --noEmit` |
| `npm run lint` | ESLint 10 (flat config) sobre `src` y configs |
| `npm run test` | Vitest: formato de dinero/fechas, teléfono, errores, texto |
| `npm run gen:types` | Regenera `src/types/database.ts` desde Supabase local |

`src/types/database.ts` es **generado** (`supabase gen types`); no se edita a mano ni se lintea.
Si cambia el esquema, se regenera y se ajusta `src/types/domain.ts` (mapeo, no columnas nuevas).

---

## 2. Estructura de `src/`

```
src/
  main.ts                  arranque: Pinia, Vue Query, router, handler de sesión expirada
  App.vue                  login/sin-acceso a pantalla completa; resto con AppShell
  env.d.ts                 tipado de import.meta.env
  styles/
    tokens.css             copia literal de docs/04-diseno/tokens.css (no editar aquí)
    main.css               @theme inline (tokens → Tailwind), base y componentes
  types/
    database.ts            generado por Supabase CLI
    domain.ts              tipos derivados + guardas + entidades del dominio
  lib/
    supabase.ts            cliente único (anon key validada al arrancar)
    errors.ts              traducción de errores a español (prefijos RPC, Auth, constraints)
    format.ts              dinero S/, teléfono, tokens, estados, relativos (re-exporta fechas)
    dates.ts               America/Lima: formato, rangos de mes/día, ISO ↔ hora de Lima
    text.ts                búsqueda saneada, iniciales, wa.me
    mappers.ts             fila de vista/tabla → entidad de dominio (falla si falta un dato)
    query-client.ts        QueryClient + retry + handler de 401
    query-keys.ts          claves de caché centralizadas
  services/
    accounts.ts            lecturas de v_account_status + escrituras locales permitidas
    customers.ts           CRUD de clientes (sin DELETE: archivar)
    plans.ts               planes, app_settings y token_stock (lectura)
    dashboard.ts           métricas (COUNT de SQL) y movimientos de caja
    cash.ts                v_cash_movements (solo lectura)
    profile.ts             profiles.display_name
    rpc.ts                 wrappers tipados de las 7 RPC + account_status/add_months
  stores/
    session.ts             sesión + profiles ("sin acceso" si no hay fila)
    preferences.ts         tema y densidad (localStorage)
  composables/
    useToast.ts            toasts globales (máx. 3, pausa al enfocar)
    useDebouncedRef.ts     debounce para búsquedas (250 ms)
  router/
    index.ts               rutas, guard de sesión, meta.título, scroll
    navigation.ts          destinos del sidebar/bottom-bar
  components/
    ui/                    Button, Input, Textarea, Select, Combobox, DatePicker, Checkbox,
                           Switch, StatusBadge, FollowupBadge, DataTable, MetricCard, Modal,
                           Sheet, ConfirmDialog, MoneyInput, PhoneInput, Alert, Skeleton,
                           EmptyState, Pagination, SegmentedFilter, ToastHost, AppIcon
    layout/                AppShell, AppSidebar, AppTopbar, AppMobileMenu
    customers/             CustomerFormModal (vee-validate + zod)
    accounts/              AccountFormSheet, AccountDetailSheet, CorrectExpirationModal,
                           AccountRenewalHistory, AccountActionsHost (estado y mutaciones)
    renewals/              RenewalSheet (flujo crítico), RecordPaymentModal
    tokens/                PurchaseTokensModal, AdjustTokensModal
    settings/              PlanRowEditor
  views/
    LoginView, DashboardView, CustomersView, CustomerDetailView, AccountsView,
    RenewalsView, TokensView, SettingsView, ModulePendingView (seguimiento/finanzas),
    ForbiddenView, NotFoundView
  lib/*.test.ts            pruebas unitarias
```

---

## 3. Reglas de datos que el código respeta

- **Estado de vigencia**: siempre desde `v_account_status`. No hay `CASE` en TypeScript.
  Para previsualizar otra fecha se llama a `account_status()` (`services/rpc.ts`).
- **Dinero**: se muestra con `formatMoney` (`S/ 1,485.00`, negativos con `−`). No se suman
  importes en el cliente; los conteos del dashboard son `COUNT` ejecutados por PostgREST.
- **Escrituras críticas**: `renewals`, `payments`, `token_*`, `audit_log`, `contact_logs` no se
  tocan desde el cliente. `services/rpc.ts` ya expone todas las firmas con `idempotencyKey`.
- **Vencimiento de una cuenta**: no se edita por `UPDATE`; se corrige con
  `rpc_set_account_expiration` (motivo obligatorio + auditoría).
- **Clientes/cuentas**: no hay `DELETE` en la UI; se archiva con `archived_at`.
  Archivar un cliente exige que no tenga cuentas activas.
- **Sin contraseñas IPTV**: no existe campo ni columna (ADR-002). La UI solo muestra usuario,
  referencia y fechas.
- **Teléfono**: se guarda como dígitos (`^[0-9]{9,15}$`), se muestra `987 654 321`.
- **Fechas**: se persisten UTC y se muestran en `America/Lima` (`lib/dates.ts`).

### Nota de arquitectura: totales de caja

PostgREST de este proyecto tiene las funciones de agregación deshabilitadas (`PGRST123`) y el
modelo ya incluye `v_cash_monthly` (ingresos, egresos y neto por mes). El dashboard del slice 1
sigue **listando** los movimientos del mes porque el total se mostrará en Finanzas (2B); el
navegador nunca suma importes. `token_purchases` de la vista es informativo: ya está dentro de
`outflow` y no se suma aparte.

---

## 4. Convenciones para el slice 2

### Datos

1. Leer cuentas solo con `listAccounts()` / `getAccount()`; añadir filtros al `AccountListFilter`
   de `types/domain.ts` y replicarlos en `services/accounts.ts`.
2. Toda mutación crítica por `services/rpc.ts`. La clave se crea **al abrir** el formulario
   (`createIdempotencyKey()`) y se reutiliza en los reintentos; nunca por clic.
3. Invalidar por prefijo: `queryKeys.accounts.all`, `['dashboard']`, `queryKeys.plans.all`.
4. Los conteos y totales nuevos deben ser SQL. Si falta una vista/RPC, **no** se replica la regla
   en el navegador: se pide al `db-architect` y se deja el bloque con un estado honesto.
5. Los errores se muestran con `toUserMessage()`; nunca el `message` crudo de Postgres.

### UI

1. Reutilizar los componentes de `components/ui`. No crear una segunda variante de botón, input,
   tabla o badge.
2. Las tablas se declaran con `TableColumn[]` y slots `#cell-<key>`; `card` define la posición en
   la tarjeta móvil (`start`, `end`, `primary`, `meta`, `actions`). El CSS convierte la tabla a
   tarjetas a ≤640 px de contenedor: no se duplica el marcado.
3. Acciones de una cuenta: `AccountActionsHost` (expone `openDetail`, `openCreate`, `openEdit`).
   Evita abrir un sheet desde otro sheet: se cierra uno y se abre el siguiente.
4. El DatePicker dentro de un modal/sheet se portaliza al propio diálogo para seguir siendo
   clickeable y accesible.
5. Filtros: `AppSegmentedFilter` (`aria-pressed`) para rangos; `AppSelect` para estados.
   No se usan tabs falsos sin `tabpanel`.
6. Formularios nuevos: `useForm` + `toTypedSchema(zod)` + `defineField` (referencia:
   `CustomerFormModal.vue`). `values` de vee-validate es de solo lectura; no asignar directo.
7. Colores, espaciado, radios y sombras solo con tokens/utilidades del theme. Prohibido `#hex`
   nuevo o `bg-primary/50` (los tokens son hex, no canales).
8. Inputs siempre a 16 px; en `pointer: coarse` los controles llegan a 44 px por tokens.
9. Copy en español, verbos + objeto en botones (`Registrar cobro`, no `Aceptar`).

### Rutas

`/renovaciones` y `/tokens` ya están implementadas. `/seguimiento` y `/finanzas` siguen con
`ModulePendingView` y `meta.pending`; al implementarlas, se reemplaza el componente y se quita
`pending` del meta. La navegación (`router/navigation.ts`) ya las incluye con la etiqueta «Pronto»;
al activarlas, quitar `soon: true`.

### Renovaciones y tokens (slice 2A)

1. **Un solo sheet de renovación.** `RenewalSheet` se abre con
   `AccountActionsHost.openRenewal({ account?, customerId?, customerName? })` desde dashboard,
   listado de cuentas, ficha de cuenta y ficha de cliente. Si había una ficha abierta, se cierra
   antes: no se apilan sheets. El host concentra el refresco de `accounts`, `dashboard`,
   `renewals` y `tokens`.
2. **Idempotencia por formulario.** Cada operación genera su clave **al abrir**, no por clic:
   `renewalKey` y `paymentKey` en el sheet; `purchaseKey`/`adjustKey` en los modales de tokens.
   Un reintento manda la misma clave. Si se cierra y se vuelve a abrir, es una operación nueva y
   por tanto una clave nueva.
3. **Éxito parcial.** Si `rpc_register_renewal` responde bien y `rpc_record_payment` falla, el
   sheet queda en estado reducido con «Renovación registrada. El cobro no se guardó.». El botón
   `Reintentar cobro` llama **solo** a `rpc_record_payment` con la misma clave del cobro. Nunca se
   reenvía la renovación.
4. **Fecha sugerida.** Se calcula con `rpc('add_months')` cada vez que cambian plan, tipo de
   operación, fecha efectiva o vencimiento actual. Una secuencia descarta respuestas viejas.
   `p_expiration_edited` se decide comparando instantes (no texto), y el campo se envía siempre.
5. **Montos estimados.** El footer multiplica `tokens_used × v_token_summary.avg_unit_cost` solo
   para mostrar, con la etiqueta «estimado». El costo real queda congelado por el servidor y se
   lee de `v_renewal_summary.token_cost` / `gross_margin`. Si la vista de tokens no devuelve fila,
   se muestra «no disponible», nunca 0.
6. **Reversión y cobro posterior.** `AccountRenewalHistory` lista `v_renewal_summary` y abre un
   `ConfirmDialog` con motivo obligatorio. Si `amount_pending > 0`, la misma tarjeta ofrece
   `Registrar cobro` (`RecordPaymentModal`), que llama a `rpc_record_payment` con una clave nueva
   generada al abrir el modal. Tras revertir se invalida cuenta, historial, tokens y dashboard.
   La fila queda `Revertida`, el pago se conserva y el margen se muestra tachado como «revertido».
7. **Tokens.** `TokensView` lee saldo, promedio y valor de inventario de `v_token_summary`. Las
   compras y los ajustes van por RPC con clave de idempotencia; el libro de `token_movements` es
   de solo lectura y no ofrece editar ni borrar.
8. **Errores de servidor.** Siempre `toUserMessage()`; el detalle técnico no se pinta. El sheet
   permanece abierto para corregir y reintentar con los mismos valores.

---

## 5. Pendientes y riesgos conocidos

| # | Pendiente | Impacto | Quién |
|---|---|---|---|
| 1 | Totales de caja en el dashboard | El rail sigue listando movimientos; `v_cash_monthly` ya existe y se usará en Finanzas (2B) | `frontend-web` (2B) |
| 2 | Agregados por cliente en el listado | `v_customer_summary` ya existe; el listado aún no muestra activas/próximo vencimiento | `frontend-web` (2B) |
| 3 | Seguimiento y Finanzas | Siguen en `ModulePendingView`; Renovaciones y Tokens ya están implementados | `frontend-web` (2B) |
| 4 | Pruebas E2E en el repo | La verificación visual se hizo con Playwright sobre Chrome local, fuera del repo | `testing-e2e` |
| 5 | Exportación CSV y plantillas de WhatsApp | No están en el alcance del slice 1 | slice 2 |
| 6 | Densidad compacta en tablas editables | Las filas de plan no cambian de alto con la densidad | cosmético |

### Desviaciones conscientes del documento de diseño

- Las acciones de página viven en el encabezado del contenido (no en la topbar) para tener un
  único `<h1>` y una sola superficie de acción.
- El filtro de vencimientos usa botones con `aria-pressed`, no `role="tab"`: el contenido es una
  única tabla, no paneles independientes.
- En móvil, «Ver todas» y los enlaces de navegación mantienen un área táctil de 44 px.

### Datos de prueba

Durante la verificación se crearon clientes y cuentas de prueba **desde la UI y la API** y se
**archivaron** al terminar (no se borró ninguna fila). El seed original no trae clientes.

---

## 6. Verificación ejecutada

```bash
npm run typecheck   # sin salida = sin errores
npm run lint        # sin salida = sin errores
npm run test        # 25 pruebas en 3 archivos
npm run build       # dist/ generado (incluye robots.txt)
```

Verificación funcional del slice 2A (Supabase local + Playwright/Chrome): compra de tokens,
renovación con cobro, doble envío con la misma clave, reversión, stock insuficiente, éxito
parcial con reintento del cobro, cobro posterior, alta/edición de cuenta con vee-validate y
sheet a 1440/768/375 px. El detalle y los números están en el informe de la entrega.
