# IPTV Manager — frontend

Panel administrativo privado (monousuario) para clientes, cuentas IPTV, vencimientos y caja.
Vue 3 + TypeScript + Vite + Tailwind CSS v4 + Reka UI, con Supabase (Auth, PostgreSQL, RLS, RPC).

Este README describe el panel completo: autenticación, shell, dashboard, clientes, cuentas IPTV,
planes, renovaciones, tokens, finanzas y seguimiento con plantillas de WhatsApp. Ya no queda
ningún módulo en `ModulePendingView`.

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
| `npm run test` | Vitest: formato de dinero/fechas, teléfono, plantillas de WhatsApp, errores, texto, CSV y meses |
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
    finance.ts             claves/labels de mes, rango de gastos y resta de caja
    csv.ts                 generador CSV mínimo (escape + descarga)
    text.ts                búsqueda saneada, iniciales, wa.me
    whatsapp.ts            plantillas: variables, días restantes, normalización y wa.me
    mappers.ts             fila de vista/tabla → entidad de dominio (falla si falta un dato)
    query-client.ts        QueryClient + retry + handler de 401
    query-keys.ts          claves de caché centralizadas
  services/
    accounts.ts            lecturas de v_account_status + escrituras locales permitidas
    customers.ts           CRUD de clientes (sin DELETE: archivar)
    plans.ts               planes, app_settings y token_stock (lectura)
    dashboard.ts           métricas (COUNT de SQL) y movimientos de caja
    cash.ts                v_cash_movements (solo lectura)
    finance.ts             v_cash_monthly, v_profit_monthly y gastos (CRUD auditado)
    followups.ts           bandeja (vista + followups), plantillas y contact_logs
    payments.ts            pagos de una renovación (solo lectura)
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
    renewals/              RenewalSheet (flujo crítico), RecordPaymentModal,
                           RenewalDetailSheet, RenewalReverseDialog
    followups/             FollowupComposer (WhatsApp + resultado) y
                           AccountContactHistory (historial de la ficha)
    finance/               ExpenseFormModal (alta/edición de gastos)
    tokens/                PurchaseTokensModal, AdjustTokensModal
    settings/              PlanRowEditor, WhatsAppTemplateCard
  views/
    LoginView, DashboardView, CustomersView, CustomerDetailView, AccountsView,
    FollowupView, RenewalsView, TokensView, FinanceView, SettingsView,
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
modelo incluye `v_cash_monthly` (ingresos, egresos y neto por mes). El dashboard muestra el
**neto del mes actual** leído de esa vista; la lista de movimientos del mes sigue siendo
informativa y el navegador nunca suma importes. `token_purchases` de la vista es informativo: ya
está dentro de `outflow` y no se suma aparte. El detalle completo vive en `/finanzas`.

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
4. El DatePicker y el Select dentro de un modal/sheet se portalizan al propio diálogo para seguir
   siendo clickeables y accesibles (el layer modal bloquea el resto del body).
5. Filtros: `AppSegmentedFilter` (`aria-pressed`) para rangos; `AppSelect` para estados.
   No se usan tabs falsos sin `tabpanel`.
6. Formularios nuevos: `useForm` + `toTypedSchema(zod)` + `defineField` (referencia:
   `CustomerFormModal.vue`). `values` de vee-validate es de solo lectura; no asignar directo.
7. Colores, espaciado, radios y sombras solo con tokens/utilidades del theme. Prohibido `#hex`
   nuevo o `bg-primary/50` (los tokens son hex, no canales).
8. Inputs siempre a 16 px; en `pointer: coarse` los controles llegan a 44 px por tokens.
9. Copy en español, verbos + objeto en botones (`Registrar cobro`, no `Aceptar`).

### Rutas

Todas las rutas del panel están implementadas. `/seguimiento` usa `FollowupView`; se retiraron
`ModulePendingView`, `meta.pending` y la etiqueta «Pronto» de la navegación. Finanzas tampoco
lleva `soon`.

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

### Finanzas y gastos (slice 2B)

1. **Dos bloques separados.** `/finanzas` muestra **Caja del mes** (`v_cash_monthly`) y
   **Rentabilidad del mes** (`v_profit_monthly`). No se mezclan ni se suman en el navegador.
   El selector ofrece el mes actual de Lima y los 11 anteriores.
2. **Caja.** `income` es lo cobrado; `outflow` incluye `token_purchases`; `net` se lee tal cual.
   «Gastos operativos» es la única resta de dos escalares SQL (`outflow − token_purchases`) y se
   hace en `lib/finance.ts` con prueba unitaria, no agregando filas. La compra de tokens se
   muestra aparte como informativa.
3. **Rentabilidad.** `agreed_revenue`, `token_cost`, `operating_expenses` y `gross_margin` vienen
   de la vista. Si no hay fila, el bloque muestra ceros con «Sin operaciones en el mes»; no es un
   error. Las compras de tokens no aparecen en `operating_expenses` (ADR-005).
4. **Gastos.** `expenses` es la única tabla de dinero con escritura directa (política de admin y
   trigger `expenses_audit`). Categorías: `OPERATIVO`, `PUBLICIDAD`, `HERRAMIENTAS`, `OTRO`; nunca
   tokens. Eliminar exige confirmación y advierte que queda auditado.
5. **CSV.** Se genera desde las filas ya traídas (`lib/csv.ts`), con `;` y BOM UTF-8. El resumen
   escribe los mismos valores de pantalla; el listado de gastos, lo que devolvió la consulta.
   No hay librerías de CSV ni de gráficos.
6. **Dashboard.** La tarjeta de caja muestra `net` del mes desde `v_cash_monthly`; «Registrar
   gasto» abre `ExpenseFormModal`; la tarjeta de tokens usa `v_token_summary` (saldo, costo
   promedio y valor de inventario).

### Clientes y renovaciones (slice 2B)

1. **Clientes.** El listado se pagina y busca en el servidor sobre `v_customer_summary` y muestra
   cuentas activas/total, próximo vencimiento, peor estado y última renovación. `worst_status`
   nulo se pinta «—» (sin cuentas activas). Editar un cliente pide la fila completa porque la
   vista no trae `notes`.
2. **Detalle de renovación.** Clic en una fila abre `RenewalDetailSheet` con snapshot, fechas,
   pagos asociados y acciones. `RecordPaymentModal` y `RenewalReverseDialog` son los mismos del
   historial de la cuenta: no hay dos copias del cobro ni de la reversión.
3. **Revertida con cobro.** Si `is_reversed && amount_paid > 0`, el listado muestra el badge «Cobro
   sin renovación» (tooltip accesible con la explicación completa) y el diálogo de reversión
   advierte: «Esta renovación tiene cobros por S/ X. La reversión no devuelve el dinero.». El pago
   se conserva y sigue en caja.
4. **Tablas.** `DataTable` permite scroll horizontal, deja la columna de acciones sticky a la
   derecha en escritorio (fondo opaco + separación) y mantiene la conversión a tarjetas a ≤640 px
   de contenedor. Las celdas con `mobileLabel` muestran su etiqueta en la tarjeta.

### Seguimiento y WhatsApp (slice 2B-2)

1. **Bandeja de trabajo.** `/seguimiento` cruza `v_account_status` (cliente, teléfono, usuario,
   vencimiento, estado y `followup_status`) con `renewal_followups` (`last_contact_at`,
   `next_followup_at`). Los filtros de vigencia, estado de seguimiento y búsqueda se resuelven en
   PostgREST; el cruce y el orden final, en el cliente. El orden usa `status_rank` de SQL y luego
   `next_followup_at` ascendente (sin programar va al final). Las cuentas archivadas no entran.
   La bandeja tiene un tope de 1000 filas y avisa si el total lo supera: no oculta datos en
   silencio.
2. **La app no envía nada.** `FollowupComposer` elige una plantilla activa, muestra el texto
   renderizado y abre `wa.me` en otra pestaña. Al abrir se registra `ENLACE_ABIERTO` con
   `rendered_body` y `wa_url`; después el admin confirma `MENSAJE_ENVIADO` (estado `CONTACTADO`).
   «Registrar respuesta» deja `RESPUESTA_RECIBIDA` y el estado `EN_CONVERSACION`, con notas y
   próxima acción opcional.
3. **Snapshot, no plantilla viva.** Lo persistido es el mensaje renderizado y la URL que envía el
   RPC. Editar una plantilla no reescribe `contact_logs`; el historial conserva el texto exacto.
4. **Idempotencia por diálogo.** El compositor genera tres claves al abrir (`ENLACE_ABIERTO`,
   `MENSAJE_ENVIADO`, `RESPUESTA_RECIBIDA`) y las reutiliza en reintentos. El botón queda en
   `loading` y la función también ignora el segundo clic: un doble clic produce un solo
   `contact_logs`.
5. **Variables.** `{nombre}`, `{apellido}`, `{usuario}`, `{plan}`, `{fecha_vencimiento}` y
   `{dias_restantes}`. `{plan}` es el de la última renovación **no revertida** o «sin plan»;
   `{fecha_vencimiento}` va en `dd/MM/yyyy` de Lima; `{dias_restantes}` es el número de
   `days_left`, `0` el mismo día y «vencido hace N días» en el pasado (nunca un negativo crudo).
   Una variable desconocida se deja tal cual y se avisa en la vista previa.
6. **Teléfono.** 9 dígitos que empiezan por 9 → se antepone `51`; 11 con `51` → se usa tal cual.
   El enlace se codifica completo (`encodeURIComponent`), incluidos saltos de línea y `&`.
7. **Plantillas en Configuración.** Editor de nombre, cuerpo y activa/inactiva con vista previa de
   ejemplo. Se guarda directo en `whatsapp_templates` (la RLS lo permite; no hay RPC). El cuerpo
   vacío y las variables no permitidas se rechazan antes de Postgres; `{password}` tiene mensaje
   propio y además el `CHECK` de la tabla. No hay envío ni reescritura de historial.
8. **Contactos en la ficha.** `AccountContactHistory` lista `contact_logs` (fecha, plantilla,
   evento, estado resultante, notas y mensaje snapshot) en solo lectura. La «próxima acción» es la
   de `renewal_followups`, porque `contact_logs` no guarda esa columna.

---

## 5. Pendientes y riesgos conocidos

| # | Pendiente | Impacto | Quién |
|---|---|---|---|
| 1 | Pruebas E2E en el repo | La verificación de este slice se hizo con Playwright sobre Chrome local, fuera del repo | `testing-e2e` |
| 2 | Bandeja con cruce en cliente | Los filtros van a PostgREST, pero el cruce con `renewal_followups` y el orden por próxima acción se resuelven en memoria (tope 1000). Con más volumen conviene una vista SQL | `db-architect` / `frontend-web` |
| 3 | Densidad compacta en tablas editables | Las filas de plan no cambian de alto con la densidad | cosmético |

### Desviaciones conscientes del documento de diseño

- Las acciones de página viven en el encabezado del contenido (no en la topbar) para tener un
  único `<h1>` y una sola superficie de acción.
- El filtro de vencimientos usa botones con `aria-pressed`, no `role="tab"`: el contenido es una
  única tabla, no paneles independientes.
- En móvil, «Ver todas» y los enlaces de navegación mantienen un área táctil de 44 px.

### Datos de prueba

Durante la verificación se crearon clientes y cuentas de prueba **desde la UI y la API** y se
**archivaron** al terminar (no se borró ninguna fila). El seed original no trae clientes.

En la verificación 2B se creó un gasto de prueba para demostrar el efecto en caja/margen y se
**eliminó** al terminar (acción permitida y auditada). La tabla `expenses` quedó con 0 filas; en
`audit_log` permanecen los eventos `EXPENSE_CREATED`, `EXPENSE_UPDATED` y `EXPENSE_DELETED` de
esa prueba. No se tocó ninguna renovación, pago ni token.

En la verificación 2B-2 se usaron las dos cuentas de prueba activas que ya existían
(`ui_slice2a_565883` y `e2e_slice2a_197010`) para abrir `wa.me`, confirmar el envío y registrar
una respuesta. Quedaron 6 `contact_logs` (3 por cuenta) y los seguimientos en
`EN_CONVERSACION`; no se creó ni borró ninguna cuenta. La plantilla `RECORDATORIO` se editó y se
restauró por la UI; su texto final es el del seed y el `rendered_body` de los logs previos no
cambió. No se ejecutó `db reset` ni se tocó `supabase/**`.

---

## 6. Verificación ejecutada

```bash
npm run typecheck   # sin salida = sin errores
npm run lint        # sin salida = sin errores
npm run test        # 54 pruebas en 6 archivos
npm run build       # dist/ generado (incluye robots.txt)
```

Verificación funcional del slice 2A (Supabase local + Playwright/Chrome): compra de tokens,
renovación con cobro, doble envío con la misma clave, reversión, stock insuficiente, éxito
parcial con reintento del cobro, cobro posterior, alta/edición de cuenta con vee-validate y
sheet a 1440/768/375 px.

Verificación del slice 2B: tablas a 1024/1280/1440 (acciones sticky y alcanzables, con
`scrollWidth` > `clientWidth` cuando no caben) y tarjetas a 375; alta, edición y eliminación de
gasto con `v_cash_monthly`/`v_profit_monthly` antes y después; exportación CSV; detalle de
renovación con pagos y aviso de reversión con cobro; clientes con agregados y búsqueda en
servidor. El detalle y los números están en el informe de la entrega.

Verificación del slice 2B-2 (Supabase local + Playwright/Chrome, sin red externa: `wa.me` se
intercepta y se comprueba la URL generada):

- Abrir WhatsApp para una cuenta → 1 `contact_logs` `ENLACE_ABIERTO` con `rendered_body` y
  `wa_url`; `last_contact_at` no cambia.
- «Marcar como enviado» → estado `CONTACTADO`, `last_contact_at` actualizado y
  `contact_logs` `MENSAJE_ENVIADO`.
- Doble clic en «Marcar como enviado» → un solo `MENSAJE_ENVIADO` (idempotencia + guarda de
  `loading`).
- «Registrar respuesta» → `RESPUESTA_RECIBIDA`, estado `EN_CONVERSACION`, notas y
  `next_followup_at` (28/10/2026 08:00 Lima).
- Editar `RECORDATORIO` y comprobar por SQL que el `rendered_body` anterior conserva su MD5 y
  longitud (133 caracteres). Intentar `{password}` → rechazo con mensaje y sin cambio en la DB;
  después se restauró el texto original.
- Bandeja a 375/768/1024/1440: sin desborde del documento; a 1440 la tabla cabe
  (`scrollWidth` 1122 / `clientWidth` 1122), a 768/1024 la tabla se desplaza dentro de su
  contenedor con acciones sticky. Consola sin errores.
- `Renovaciones`: el badge «Cobro sin renovación» mide 22 px de alto y las filas bajan a ~65 px
  (antes ~115 px), con el tooltip completo intacto.
