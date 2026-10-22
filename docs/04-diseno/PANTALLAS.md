# Pantallas — IPTV Manager

**Versión:** 1.0 · **Consumidor:** `frontend-web` · **Tokens:** `tokens.css` · **Componentes:** `COMPONENTES.md`

Reglas que aplican a **todas** las pantallas:

- Moneda `S/` con 2 decimales; fechas en `America/Lima`; UI en español.
- Estado de vigencia **leído** de `v_account_status`. La UI no compara fechas para decidir estado.
- Totales y márgenes **vienen de SQL** (`v_renewal_summary`, `v_cash_movements`). La UI formatea.
- Toda vista de datos implementa los 5 estados: **carga, vacío, error, sin permiso, con datos**
  (más el estado parcial cuando un dato derivado falla).
- Fechas: tabla `21 oct 2026`; detalle `21 oct 2026 · 08:00`; relativo `hoy` / `en 3 días`.

---

## 0. Mapa de navegación

| # | Pantalla | Ruta | Destino en nav | Icono |
|---|---|---|---|---|
| 1 | Login | `/login` | — (pública) | — |
| 2 | Dashboard "Hoy" | `/` | Hoy | `home` |
| 3 | Clientes | `/clientes` · `/clientes/:customerId` | Clientes | `users` |
| 4 | Cuentas IPTV | `/cuentas` · ficha en sheet | Cuentas IPTV | `tv` |
| 5 | Seguimiento | `/seguimiento` | Seguimiento | `message-circle` |
| 6 | Renovaciones | `/renovaciones` | Renovaciones | `refresh` |
| 7 | Tokens | `/tokens` | Tokens | `coins` |
| 8 | Finanzas | `/finanzas` | Finanzas | `wallet` |
| 9 | Configuración | `/configuracion` | Configuración | `settings` |
| F | Registrar renovación | sheet sobre cualquier pantalla | — (acción) | — |

El sidebar muestra badge de conteo solo en `Hoy` (vencen hoy) y `Seguimiento` (por atender).

---

## 1. Patrones de estado (comunes)

Para no repetir la mecánica en las 9 pantallas, estos son los patrones canónicos. Cada pantalla
define **su copy concreto** en su tabla de estados.

### 1.1 Carga
Skeletons con el layout final (métricas, filas, tarjetas). Nunca spinner a pantalla completa ni
"0" como valor provisional: un `0` falso es peor que un hueco. `aria-busy="true"` en el contenedor.
Si tarda >10 s: pasa a error con `Reintentar`.

### 1.2 Vacío
`EmptyState` con título (qué falta), descripción (por qué) y **una** acción siguiente. Se distingue
"no hay datos" de "el filtro no devuelve nada": en el segundo caso la acción es `Limpiar filtros`.

### 1.3 Error
`Alert` de peligro en el lugar del contenido, con el mensaje en lenguaje humano, el detalle técnico
colapsado (`Ver detalle`) y `Reintentar`. **Nunca** se vacía la pantalla ni se pierden los filtros.
Si el fallo es de una sola tarjeta, solo esa tarjeta muestra `—` y el resto sigue operativo
(estado parcial).

### 1.4 Sin permiso
Ocurre cuando hay sesión pero `profiles` no tiene fila (RLS devuelve vacío o `42501`). Se muestra
una tarjeta centrada: `Tu cuenta no tiene acceso a este panel` + `Cerrar sesión`. No se muestran
conteos, nombres ni rutas. No se usa el 404 para ocultar: es un estado explícito y sobrio.

### 1.5 Con datos
Densidad según §7 de `DESIGN.md`, orden y paginación definidos por pantalla, acciones visibles
(nunca solo en hover).

---

## 2. Login — `/login`

**Objetivo:** entrar en menos de 10 s, sin registro público, sin filtrar si un correo existe.
**Pregunta que responde:** ¿puedo pasar?

### Jerarquía
1. Wordmark `IPTV Manager` (`--text-xl`, 600).
2. Formulario (correo, contraseña, `Entrar`).
3. Nota de acceso restringido.

### Layout

| 1440 px | 375 px |
|---|---|
| Columna centrada de 400 px, tarjeta `--color-surface`, `--radius-lg`, borde 1 px, padding 32, `--shadow-sm`. Fondo `--color-bg`. Sin ilustración ni panel lateral (no hay marca). | Igual, tarjeta sin borde lateral, padding 20, `margin: 0 16px`, centrada verticalmente con `min-height: 100dvh` y `padding-top: env(safe-area-inset-top)`. |

Vertical: 96 px arriba del wordmark, 40 px hasta el título `Iniciar sesión` (24/600), 24 px hasta el
primer campo, gap 16 entre campos, 24 px hasta el botón (48 px, full width), 16 px hasta la nota.

### Campos

| UI | Columna | Reglas |
|---|---|---|
| Correo | `auth.users.email` (Supabase Auth) | `type="email"`, `autocomplete="username"`, requerido |
| Contraseña | Supabase Auth | `type="password"`, `autocomplete="current-password"`, botón mostrar/ocultar 44×44, requerido |
| Recordarme | — | **No existe.** La sesión la gestiona Supabase; no se agrega persistencia extra. |

### Acciones
- Primaria: `Entrar` (48 px, full width, `loading` con `Entrando…`).
- Secundaria: ninguna. Sin "Crear cuenta", sin "Continuar con Google".
- Nota bajo el formulario: `Acceso restringido. Si olvidaste tu contraseña, usa el procedimiento de recuperación documentado.` (texto, no enlace falso).

### Estados

| Estado | Qué se ve |
|---|---|
| **Carga** | Botón en `loading`, campos `readonly`, sin skeleton (la pantalla ya está completa). |
| **Vacío** | No aplica: el formulario vacío es el estado inicial; el botón está `disabled` hasta que ambos campos tengan contenido. |
| **Error** | `Alert` danger sobre el formulario: `No pudimos iniciar sesión. Revisa tu correo y contraseña.` Sin distinguir cuál falló (evita enumeración). Si es `email not confirmed`: `Confirma tu correo antes de entrar.` Si es red: `Sin conexión. Reintentar`. |
| **Sin permiso** | Credenciales válidas pero sin fila en `profiles`: reemplaza el formulario por una tarjeta: `Tu cuenta existe, pero no tiene acceso a este panel` + `Contacta al administrador` + `Cerrar sesión`. |
| **Con datos** | Formulario limpio. Si hay sesión activa, redirige a `/` antes de pintar. |

### Componentes
`Input` (email, password con sufijo de ojo), `Button` primary lg, `Alert` danger, `Wordmark`.

---

## 3. Dashboard "Hoy" — `/`

**Objetivo:** en 3 segundos saber quién vence y actuar sin cambiar de pantalla.
**Pregunta que responde:** ¿a quién le toca hoy?

### Jerarquía
1. **Título con fecha real**: `Hoy, miércoles 21 de octubre` + subtítulo `2 cuentas vencen hoy · 4 en los próximos 7 días`.
2. **Métricas** (4): Vencen hoy · Próximos 7 días · Vencidas · Saldo de tokens.
3. **Tabla de vencimientos** con filtro `Hoy / 7 días / Vencidas / Todas` (por defecto **Hoy**; si hoy no hay nada, cae a `7 días` y el tab lo indica).
4. **Rail derecho**: acciones rápidas, caja del mes, seguimiento de hoy.

### Layout

**1440 px** (sidebar 252 + contenido 1124 tras gutters de 32):

```
┌ topbar: título + [Buscar] [Nuevo cliente] [Registrar renovación] ┐
├──────────────────────────────────────────────────────────────────┤
│ [Vencen hoy][Próx. 7 días][Vencidas][Saldo tokens]   ← 4 × 1fr  │
├──────────────────────────────────────────┬───────────────────────┤
│ Tabs  Hoy·7d·Vencidas·Todas      Ver todas│ Acciones rápidas     │
│ ┌──────────────────────────────────────┐ │ ├ Registrar renovación│
│ │ tabla de vencimientos (10 filas)     │ │ ├ Comprar tokens     │
│ │ Cliente | Cuenta | Vence | Estado | ⋯│ │ └ Registrar gasto    │
│ └──────────────────────────────────────┘ │ Caja de octubre       │
│                                           │ Seguimiento de hoy    │
└──────────────────────────────────────────┴───────────────────────┘
```

Grid: `grid-template-columns: minmax(0,1fr) 344px; gap: 24px` desde `xl` (1280). Entre 1024 y 1279
el rail baja debajo de la tabla (una columna). Métricas: 4 columnas ≥1280; 2 columnas 480–1279.

**375 px:** orden = título → métricas 2×2 (compactas: label 12, valor 28) → acciones rápidas
(`Registrar renovación` full width + `Comprar tokens` / `Registrar gasto` en fila) → tabs con scroll
→ **tarjetas** de vencimiento → `Caja de octubre` (colapsable, abierta) → `Seguimiento de hoy`.

### Métricas

| Tarjeta | Valor | Lectura | Severidad |
|---|---|---|---|
| Vencen hoy | `count(*)` con `days_left = 0` y `status = URGENTE` | `de 42 cuentas activas` | critical si >0 |
| Próximos 7 días | `count(*)` con `status IN (URGENTE, PROXIMA)` | `incluye 2 de hoy` | attention si >0 |
| Vencidas | `count(*)` con `status = VENCIDA` | `última: hace 2 días` | critical si >0 |
| Saldo de tokens | `token_stock.quantity` | `mínimo 5 · 1.87 por token` + medidor | critical si 0, attention si < mínimo |

Cada tarjeta es un enlace a la vista filtrada correspondiente. El medidor de tokens calcula el
relleno como `quantity / max(min_token_balance * 4, 1)` — solo presentación; el umbral de color lo
da `quantity vs min_token_balance`.

### Tabla de vencimientos (columnas)

| Columna | Origen | Ancho | Alineación |
|---|---|---|---|
| Estado | `v_account_status.status` | 116 | izq. |
| Cliente | `customer_name` (o `first_name || ' ' || last_name`) | flexible, truncado a 1 línea | izq. |
| Cuenta | `external_username` (mono 13) + `plans` del último renewal | 180 | izq. |
| Vence | `expires_on` + relativo (`hoy`, `en 3 días`) | 120 | der. |
| Plan | `plan_name` del último snapshot | 160 (oculta <1280) | izq. |
| Acciones | — | 104 | der. |

Acciones por fila: **WhatsApp** (icon-only 40×40, `aria-label="Abrir WhatsApp de Rosa Quispe"`) y
**Registrar renovación**. En la columna densa el botón se rotula **`Renovar`** con
`aria-label="Registrar renovación"`: es la misma acción, con un rótulo que no rompe la columna.
Ambas a un clic, sin navegar.

### Rail derecho

- **Acciones rápidas**: `Registrar renovación` (primary, full width), `Comprar tokens` y
  `Registrar gasto` (secondary, mitad y mitad).
- **Caja de octubre**: `Cobrado S/ 1,485.00`, `Gastos −S/ 210.00`, `Compra de tokens −S/ 260.00`,
  `Neto S/ 1,015.00`. Nota 12 px: `Comprar tokens no cuenta como gasto del mes.`
- **Seguimiento de hoy**: hasta 4 filas con nombre, `next_followup_at` y estado de seguimiento;
  enlace `Ver seguimiento`.

### Datos

| Bloque | Fuente |
|---|---|
| Vencimientos | `v_account_status` (`ORDER BY status, expires_on`), `LIMIT 10` tras filtro |
| Conteos | agregados sobre `v_account_status` (SQL) |
| Tokens | `token_stock.quantity`, `avg_unit_cost`; `app_settings.min_token_balance` |
| Caja | `v_cash_movements` del mes en curso (`America/Lima`) |
| Seguimiento | `renewal_followups` con `next_followup_at <= now()` join `v_account_status` |

### Estados

| Estado | Qué se ve |
|---|---|
| **Carga** | 4 skeletons de métrica (label 56×11, valor 96×30) + 8 filas skeleton con las anchuras de columna reales + rail con 3 bloques skeleton. Sin salto de layout. |
| **Vacío** | Sin cuentas registradas: `EmptyState` a ancho completo bajo el título: `Aún no hay cuentas registradas` / `Registra tu primer cliente y su cuenta para empezar a controlar vencimientos.` / `Nuevo cliente`. Las métricas muestran `0` (dato real, no vacío). |
| **Error** | `Alert` danger sobre la tabla: `No se pudieron cargar los vencimientos.` + `Reintentar` + `Ver detalle`. Métricas muestran `—` (no `0`). Rail sigue visible si su petición cargó. |
| **Sin permiso** | Patrón §1.4. No se renderizan métricas ni nombres. |
| **Con datos** | Lo descrito arriba. |
| **Parcial** | Si falla `v_cash_movements`, la tarjeta de caja muestra `—` y `No disponible` con reintento propio; la tabla no se ve afectada. |

### Componentes
`Card de métrica`, `Tabs`, `Table` (+ versión tarjeta), `Badge de estado`, `EmptyState`, `Alert`,
`Skeleton`, `Button`, `Topbar`.

---

## 4. Clientes — `/clientes` y ficha `/clientes/:customerId`

**Objetivo:** encontrar a una persona por nombre o teléfono y ver todo lo suyo en un solo lugar.
**Pregunta que responde:** ¿quién es y qué tiene contratado?

### Lista

**Jerarquía:** título `Clientes` + contador (`128 clientes`) → búsqueda (nombre/teléfono) →
tabla → paginación.

**1440:** barra superior con búsqueda de 320 px a la izquierda y `Nuevo cliente` (primary) a la
derecha; tabla a ancho completo.
**375:** título + `Nuevo cliente` icon-only (44×44) en el topbar; búsqueda full width; tarjetas.

**Columnas:** Cliente (nombre + apellido, 14/500) · Teléfono (formateado, mono no) · Cuentas
(activas/archivadas, p. ej. `2 activas`) · Próximo vencimiento (fecha + estado) · Última renovación
(fecha + importe) · Acciones (`WhatsApp`, `⋯` con `Editar`, `Archivar`).

**Campos:**

| UI | Columna | Regla |
|---|---|---|
| Nombre | `customers.first_name` | requerido, ≤60 |
| Apellido | `customers.last_name` | requerido, ≤60 |
| Teléfono | `customers.phone` | `PhoneInput`; `^[0-9]{9,15}$`; **no único** (familias comparten número) |
| Notas | `customers.notes` | opcional, ≤500 |
| Archivado | `customers.archived_at` | filtro `Incluir archivados`, apagado por defecto |

### Ficha (misma ruta, vista de detalle)

**Jerarquía:** encabezado con nombre (22/600), teléfono + `Copiar` + `WhatsApp`, chips de estado de
sus cuentas → tabs `Cuentas` `Renovaciones` `Contacto` `Notas` → contenido.

- **Cuentas:** tarjetas (usuario externo, vence, estado, plan) con `Registrar renovación` por cuenta.
  Si no hay: `Sin cuentas registradas` + `Agregar cuenta`.
- **Renovaciones:** tabla compacta de `v_renewal_summary` (fecha, plan, acordado, pagado, margen,
  estado). Totales por SQL.
- **Contacto:** línea de tiempo de `contact_logs` (evento, plantilla, fecha, extracto del mensaje
  enviado). Solo lectura: el snapshot del mensaje no se edita.
- **Notas:** `customers.notes` + notas de cada cuenta.

**1440:** dos columnas: ficha 1fr (máx. 880) + rail 320 con resumen (`Cuentas activas`, `Deuda
pendiente Σ`, `Último contacto`) y acciones.
**375:** una columna; el resumen pasa debajo de los tabs.

**Acciones:** `Editar cliente` (modal) · `Nueva cuenta` (sheet) · `Registrar renovación` (sheet) ·
`Archivar cliente` (confirm; no permitido si tiene cuentas activas: mensaje `Archiva o reasigna sus
cuentas primero`).

### Estados

| Estado | Qué se ve |
|---|---|
| **Carga** | 8 skeletons de fila en la lista; en la ficha, título 180×22 + 4 pares label/valor + 3 tarjetas de cuenta. |
| **Vacío** | `Aún no hay clientes` / `Registra a la primera persona para poder crear su cuenta IPTV.` / `Nuevo cliente`. Con búsqueda activa: `Sin resultados para "quispe"` / `Revisa el nombre o el teléfono.` / `Limpiar búsqueda`. |
| **Error** | `No se pudo cargar la lista de clientes.` + `Reintentar`. En la ficha: `No se pudo cargar este cliente.` + `Volver a clientes` + `Reintentar`. |
| **Sin permiso** | §1.4. |
| **Con datos** | Lista y ficha descritas. |

### Componentes
`Table`, `Input type=search`, `PhoneInput`, `Card`, `Tabs`, `Badge de estado`, `EmptyState`,
`ConfirmDialog`, `Modal`, `Toast`.

---

## 5. Cuentas IPTV — `/cuentas`

**Objetivo:** el inventario real de cuentas con su vencimiento y su estado de verificación.
**Pregunta que responde:** ¿qué cuentas tengo, cuándo vencen y cuáles no he verificado?

### Jerarquía
1. Título `Cuentas IPTV` + contador por estado (`42 activas · 3 vencidas`).
2. Filtros: estado (5 + `Todas`), rango de vencimiento, `Verificación desactualizada`, `Incluir archivadas`.
3. Tabla.
4. Ficha en sheet (no cambia de ruta).

### Columnas

| Columna | Origen | Notas |
|---|---|---|
| Cliente | `customer_name` | enlace a `/clientes/:id` |
| Usuario externo | `external_username` | mono 13, copiable |
| Referencia | `reference` | truncada a 24 ch con `title` |
| Vence | `expires_on` | + relativo |
| Estado | `status` | badge |
| Seguimiento | `followup_status` | badge de seguimiento |
| Verificación | `last_verified_at` / `is_stale_verification` | `Verificada hace 3 días` o chip `Sin verificar` |
| Acciones | — | `Registrar renovación`, `⋯` |

**Nunca** hay columna ni campo de contraseña (ADR-002). En la ficha, donde iría la contraseña se
muestra: `Contraseña: se gestiona fuera de este panel (referencia: "gestor personal").`

### Ficha de cuenta (sheet 560 px)

Secciones: **Datos** (usuario, referencia, comprada el, vence el, verificada el, notas) ·
**Historial** (últimas 5 renovaciones con plan y vencimiento resultante) · **Tokens** (consumidos
en la cuenta, suma SQL) · **Acciones**.

Acciones: `Registrar renovación` (primary) · `Corregir vencimiento` (`rpc_set_account_expiration`,
motivo obligatorio) · `Marcar fecha verificada` (actualiza `last_verified_at`; permite hoy o una
fecha pasada) · `Archivar cuenta` (confirm; conserva historial).

**1440:** tabla a ancho completo (1124). **375:** tarjetas con estado, cliente, usuario, vence y dos
acciones; los filtros se abren en sheet.

**Campos:**

| UI | Columna | Regla |
|---|---|---|
| Cliente | `iptv_accounts.customer_id` | requerido |
| Usuario externo | `external_username` | requerido, único entre no archivadas (`lower()`), ≤64 |
| Referencia | `reference` | opcional, ≤120 (`dónde está la contraseña`) |
| Comprada el | `purchased_at` | requerido, `timestamptz` |
| Vence el | `expires_at` | requerido, `> purchased_at` |
| Notas | `notes` | opcional, ≤500 |

### Estados

| Estado | Qué se ve |
|---|---|
| **Carga** | 8 filas skeleton; contadores como `—`. |
| **Vacío** | `Todavía no hay cuentas IPTV` / `Crea una cuenta desde la ficha de un cliente.` / `Ir a clientes`. Con filtros: `Ninguna cuenta coincide con estos filtros` / `Quita algún filtro para ver más resultados.` / `Limpiar filtros`. |
| **Error** | `No se pudieron cargar las cuentas.` + `Reintentar`. En el sheet: `No se pudo cargar la cuenta.` sin cerrar el sheet. |
| **Sin permiso** | §1.4. |
| **Con datos** | Tabla + ficha. |

### Componentes
`Table`, `FilterChip` (basado en Badge + botón), `Badge de estado`, `Badge de seguimiento`,
`Sheet`, `Date/time picker`, `Textarea` (motivo), `ConfirmDialog`, `Alert`.

---

## 6. Seguimiento — `/seguimiento`

**Objetivo:** que ninguna conversación de renovación se quede sin respuesta.
**Pregunta que responde:** ¿a quién le escribí y quién no me contestó?

### Jerarquía
1. Título `Seguimiento` + subtítulo `4 conversaciones por atender`.
2. Tabs por estado: `Por atender` (default: `next_followup_at <= hoy` y estado ≠ `RENOVADO` /
   `NO_RENOVARA`) · `Pendiente` · `Contactado` · `En conversación` · `Confirmado` · `Todos`.
3. Tabla.
4. Detalle en sheet con el historial de `contact_logs`.

**Decisión de diseño:** lista agrupada por tabs, **no kanban**. Con un solo usuario, arrastrar
tarjetas aporta ruido, rompe el teclado y no cambia ninguna decisión.

### Columnas
Cliente · Cuenta · Estado de vigencia · Seguimiento · Último contacto (`hace 2 días`) · Próximo
seguimiento (`hoy` en `--color-warning-text` si venció) · Acciones (`WhatsApp`, `Registrar respuesta`).

**1440:** tabla 1124. **375:** tarjetas; `WhatsApp` y `Registrar respuesta` a ancho completo.

### Datos
`renewal_followups` (`status`, `last_contact_at`, `next_followup_at`, `notes`) join
`v_account_status` para nombre, usuario y vigencia. El historial sale de `contact_logs`
(`event_type`, `template_key`, `rendered_body`, `created_at`).

### Acciones
- `WhatsApp`: renderiza la plantilla (`whatsapp_templates.body` con `{nombre}`, `{usuario}`,
  `{plan}`, `{fecha_vencimiento}`, `{dias_restantes}`), abre `wa.me`, y registra `ENLACE_ABIERTO`
  vía `rpc_update_followup` con `rendered_body` y `wa_url` (snapshot).
- `Registrar respuesta` (modal 480 px): estado nuevo (6 opciones), notas, próximo seguimiento
  (opcional, por defecto `+3 días`), `event_type = RESPUESTA_RECIBIDA`. Una sola llamada a
  `rpc_update_followup` (actualiza el estado e inserta el log en la misma transacción).
- `Registrar renovación` (si el estado es `CONFIRMADO`): abre el sheet con el cliente precargado.

Estados `NO_RENOVARA` y `RENOVADO` no piden próximo seguimiento: el campo se deshabilita con la
explicación `Este estado cierra el seguimiento.`

### Estados

| Estado | Qué se ve |
|---|---|
| **Carga** | 6 filas skeleton; contadores de tab como `—`. |
| **Vacío** | `No hay conversaciones por atender` / `Cuando marques un contacto o registres una respuesta, aparecerá aquí.` / `Ver todos`. En un tab vacío: `Sin conversaciones en "En conversación"`. |
| **Error** | `No se pudo cargar el seguimiento.` + `Reintentar`. Si falla el envío de la respuesta: el modal queda abierto con `No se pudo guardar el seguimiento.` y el texto escrito se conserva. |
| **Sin permiso** | §1.4. |
| **Con datos** | Tabla + contadores por estado. |

### Componentes
`Tabs`, `Table`, `Badge de seguimiento`, `Modal`, `Textarea`, `Select`, `Date/time picker`, `Toast`.

---

## 7. Renovaciones — `/renovaciones`

**Objetivo:** auditar la operación: qué se cobró, qué falta cobrar y cuánto margen dejó.
**Pregunta que responde:** ¿qué pasó este mes y cuánto gané de verdad?

### Jerarquía
1. Título `Renovaciones` + rango de fechas (`1–21 oct 2026`).
2. Filtros: rango (picker), plan (5 + todos), método de pago, `Incluir revertidas`.
3. Resumen de 3 métricas: `Acordado`, `Cobrado`, `Pendiente` (SQL).
4. Tabla.
5. Detalle en sheet.

### Columnas
Fecha/hora (`recorded_at`) · Cliente · Cuenta · Plan (snapshot `plan_name`) · Acordado · Pagado ·
Pendiente · Tokens · Margen · Estado (`Confirmada` / `Revertida`).

`Pendiente` solo se pinta como advertencia si `> 0`, con el texto `S/ 5.00 pendiente` (no un badge
rojo vacío cuando es 0). `Revertida` usa el badge `ARCHIVADA` (gris, discontinuo) — **no** se
inventa un sexto estado de vigencia: es un estado de la renovación, y se muestra como chip neutro
`Revertida` con guion.

### Detalle (sheet)
Snapshot completo (plan, meses, dispositivos, precio de lista, acordado), `previous_expiration` →
`new_expiration` (con chip `Fecha editada` si `expiration_edited`), `effective_at`, tokens y costo
congelado, lista de `payments` (fecha, monto, método, referencia), margen bruto. Notas.
Acciones: `Registrar cobro` (si `amount_pending > 0`), `Revertir renovación` (ConfirmDialog con
motivo obligatorio).

**Nota de negocio visible en la UI:** `El margen no descuenta gastos generales; es acordado − costo
de tokens.` (una línea, 12 px, bajo el margen).

**1440:** tabla a ancho completo; 3 métricas en fila.
**375:** métricas en columna (3 apiladas, compactas); tarjetas con fecha, cliente, plan, acordado y
pendiente.

### Datos
`v_renewal_summary` (`amount_paid`, `amount_pending`, `token_cost`, `gross_margin`, `is_reversed`) +
`renewals` (snapshots, fechas) + `payments`.

### Estados

| Estado | Qué se ve |
|---|---|
| **Carga** | 3 skeletons de métrica + 8 filas. |
| **Vacío** | `Sin renovaciones en este periodo` / `Cuando registres una renovación aparecerá aquí con su margen.` / `Registrar renovación`. |
| **Error** | `No se pudieron cargar las renovaciones.` + `Reintentar`. En el detalle: `No se pudo cargar la renovación.` |
| **Sin permiso** | §1.4. |
| **Con datos** | Tabla + métricas. |

### Componentes
`Table`, `Sheet`, `Badge`, `MoneyInput`, `Select` (método), `ConfirmDialog`, `Textarea`, `Alert`.

---

## 8. Tokens — `/tokens`

**Objetivo:** saber cuántos tokens hay, a qué costo, y no quedarse sin stock a mitad de una
renovación.
**Pregunta que responde:** ¿me alcanza para las renovaciones de esta semana?

### Jerarquía
1. Título `Tokens` + dos acciones: `Comprar tokens` (primary), `Ajustar saldo` (secondary).
2. Métricas: **Saldo** (44 px, tabular) con medidor vs `min_token_balance` · **Costo promedio**
   (`avg_unit_cost`, 4 decimales) · **Valor del inventario** (expresión SQL
   `quantity * avg_unit_cost`) · **Consumidos este mes** (Σ de `CONSUMO`).
3. `Alert` warning si `quantity < min_token_balance`: `Te quedan 3 tokens y el mínimo es 5.
   Compra tokens antes de la próxima renovación.` + `Comprar tokens`.
4. Tabs: `Compras` (default) · `Movimientos`.
5. Tabla.

### Columnas

| Tab | Columnas |
|---|---|
| Compras | Fecha · Cantidad · Costo total · Costo unitario · Proveedor · Referencia · Notas |
| Movimientos | Fecha · Tipo (`Compra` `Consumo` `Ajuste` `Reversión`) · Cantidad (`+10`, `−3`) · Costo congelado · Origen (enlace a la renovación o compra) · Motivo |

`Consumo` y `Reversión` enlazan a `/renovaciones` con el detalle abierto. `Compra` enlaza a la fila
de compras. Un movimiento nunca se edita ni se borra: se corrige con un `AJUSTE` (que exige motivo).

### Formularios
- **Comprar tokens** (modal 480): `quantity` (>0, entero), `total_cost` (MoneyInput, >0),
  `purchased_at` (default ahora), `supplier`, `reference`, `notes`. Antes de confirmar muestra
  `Costo unitario resultante: S/ 1.867` (cálculo de presentación, 3 decimales; el valor real lo
  calcula la columna generada). Aviso: `Esta compra sale de caja, pero no es un gasto del mes.`
- **Ajustar saldo** (modal 480): `delta` (≠0, puede ser negativo), `reason` (obligatorio, ≥5 ch).
  Muestra el saldo resultante en vivo y bloquea si quedaría negativo.

### Layout

| 1440 px | 375 px |
|---|---|
| 4 métricas en fila (saldo, costo promedio, valor de inventario, consumidos del mes), `Alert` de mínimo a ancho completo, tabs y tabla a 1124 px. `Comprar tokens` (primary) y `Ajustar saldo` (secondary) a la derecha del encabezado. | Métricas 2×2 con el saldo primero y su medidor; acciones en el topbar icon-only (44×44) más un botón primario full width bajo las métricas; tabs con scroll; tarjetas apiladas. |

Los cálculos que se muestran (`valor del inventario = quantity * avg_unit_cost`, `consumidos del
mes = Σ |delta|` de tipo `CONSUMO`) se resuelven **en SQL**, no en el cliente.

### Estados

| Estado | Qué se ve |
|---|---|
| **Carga** | 4 skeletons de métrica + 5 filas; el saldo **no** se muestra como `0`. |
| **Vacío** | Sin compras: `Todavía no registraste compras de tokens` / `Registra la primera compra para poder renovar cuentas.` / `Comprar tokens`. Sin movimientos: `Sin movimientos todavía`. |
| **Error** | `No se pudo cargar el saldo de tokens.` + `Reintentar`; las acciones quedan deshabilitadas con el motivo `Necesitamos el saldo actual para operar`. |
| **Sin permiso** | §1.4. |
| **Con datos** | Métricas + tabs + tablas. |
| **Parcial** | Si falla el historial pero el saldo carga, se muestran métricas y un Alert: `El historial no está disponible.` |

### Componentes
`Card de métrica` con medidor, `Alert`, `Tabs`, `Table`, `Modal`, `TokenInput`, `MoneyInput`,
`Textarea`, `Date/time picker`.

---

## 9. Finanzas — `/finanzas`

**Objetivo:** ver la caja del mes sin abrir Excel, con una sola definición de "gasto".
**Pregunta que responde:** ¿cuánto entró, cuánto salió y cuánto queda?

### Jerarquía
1. Título `Finanzas` + selector de mes (`octubre 2026` con `‹ ›`).
2. Métricas: **Cobrado**, **Gastos**, **Compra de tokens** (informativo, no suma en gastos),
   **Neto de caja**.
3. `Alert` info permanente: `Comprar tokens es conversión de caja en inventario, no un gasto del
   mes. Su costo aparece cuando se consume en una renovación.`
4. Tabs: `Cobros` · `Gastos` (default) · `Caja`.
5. Tabla + `Exportar CSV` (exporta exactamente lo que devolvió SQL, sin recalcular).

### Columnas

| Tab | Columnas |
|---|---|
| Cobros | Fecha · Cliente · Renovación · Monto · Método · Referencia |
| Gastos | Fecha · Categoría · Descripción · Monto · Referencia · Acciones (`Editar`, `Eliminar`) |
| Caja | Fecha · Tipo (`Cobro` `Gasto` `Compra de tokens`) · Dirección (`Entrada` `Salida`) · Monto · Descripción |

La dirección **no** se comunica solo con el color: la columna dice `Entrada`/`Salida` y el importe
lleva signo (`+S/ 15.00` / `−S/ 260.00`).

Gastos: `Nuevo gasto` (modal): `category` (OPERATIVO, PUBLICIDAD, HERRAMIENTAS, OTRO),
`amount` (>0), `spent_at`, `description` (requerido), `reference`. La categoría de tokens **no
existe** en el selector (bloqueada por constraint): si el admin intenta registrar una compra de
tokens aquí, el hint dice `Para comprar tokens usa Tokens → Comprar tokens.`

### Layout
**1440:** 4 métricas en fila; tabs; tabla 1124 con `Nuevo gasto` a la derecha de la barra de tabs.
**375:** métricas 2×2; tabs con scroll; tarjetas; el botón de acción en el topbar icon-only.

### Estados

| Estado | Qué se ve |
|---|---|
| **Carga** | 4 skeletons; 8 filas skeleton. |
| **Vacío** | `Sin movimientos en octubre` / `Registra un cobro o un gasto para ver la caja del mes.` / `Nuevo gasto` + `Registrar renovación`. |
| **Error** | `No se pudieron cargar las finanzas.` + `Reintentar`. Si falla solo un tab: Alert dentro del tab, el resto navegable. |
| **Sin permiso** | §1.4. |
| **Con datos** | Métricas + tabla. El neto puede ser negativo y se muestra `−S/ 120.00` con el signo, sin color de alarma (un mes negativo es un dato, no un error). |

### Componentes
`Card de métrica`, `Tabs`, `Table`, `Modal`, `Select`, `MoneyInput`, `Date/time picker`,
`ConfirmDialog`, `Alert`, `Button`.

---

## 10. Configuración — `/configuracion`

**Objetivo:** ajustar reglas y catálogos sin tocar SQL, entendiendo el efecto de cada cambio.
**Pregunta que responde:** ¿con qué reglas está trabajando el panel?

### Estructura (secciones en una sola página, ancla lateral en `lg+`)

| Sección | Contenido | Campos |
|---|---|---|
| Perfil | Nombre visible y sesión | `profiles.display_name`; `Cerrar sesión` |
| Reglas de vencimiento | Umbrales que alimentan `v_account_status` | `app_settings.urgent_days` (0–30), `warning_days` (1–60), `min_token_balance` (≥0) |
| Planes | Catálogo editable | `plans.key`, `name`, `duration_months`, `devices` (1 o 3), `suggested_price`, `tokens_required`, `is_active`, `sort_order` |
| Plantillas de WhatsApp | Texto de los 4 mensajes | `whatsapp_templates.key` (BIENVENIDA, RECORDATORIO, VENCIDO, RENOVACION_CONFIRMADA), `name`, `body`, `is_active` |
| Apariencia | Tema y densidad | Preferencia local (`light` / `dark` / `system`, `comfortable` / `compact`) |
| Datos | Exportación y respaldo | `Exportar clientes (CSV)`, `Exportar renovaciones (CSV)`, nota de respaldo diario |

### Reglas de UI

- **Reglas de vencimiento**: los tres campos numéricos muestran un **ejemplo en vivo** con la regla
  aplicada: `Con estos valores: vence hoy → Urgente · 5 días → Próxima · 12 días → Activa.`
  Validación en cliente (`urgent_days < warning_days`) con mensaje `Los días de urgencia deben ser
  menores que los de aviso.` y validación real en el constraint.
- **Planes**: tabla editable en línea. Al cambiar `suggested_price` o `tokens_required` aparece un
  `Alert` info: `Los cambios aplican a renovaciones nuevas. Las renovaciones ya registradas conservan
  su snapshot.` El `key` no es editable una vez creado.
- **Plantillas**: editor con chips de variables insertables (`{nombre}` `{apellido}` `{usuario}`
  `{plan}` `{fecha_vencimiento}` `{dias_restantes}`) y vista previa a la derecha con un cliente de
  ejemplo. Si el cuerpo contiene `{password}` (u otra variable no permitida), error de validación:
  `Variable no permitida: {password}.`
- **Apariencia**: `Switch` de tema (Claro/Oscuro/Sistema) y densidad (Cómoda/Compacta). Se aplica al
  instante y se guarda en `localStorage`; no toca la base.

### Layout
**1440:** navegación de secciones de 200 px a la izquierda + formulario de 640 px máximo.
**375:** secciones como acordeón; cada campo a ancho completo; acciones pegadas al final de cada
sección (`Guardar cambios`), no un único guardado global.

### Acciones

| Jerarquía | Acción | Notas |
|---|---|---|
| Primaria (por sección) | `Guardar cambios` | Habilitado solo si hay cambios; `loading` mientras guarda; `Toast` al terminar |
| Secundaria | `Restablecer` | Vuelve a los valores cargados del servidor, con confirmación |
| Secundaria | `Exportar CSV` (Datos) | Exporta lo que devolvió SQL, sin recalcular |
| Terciaria | `Cerrar sesión` | En Perfil; confirmación si hay cambios sin guardar |
| Destructiva | `Desactivar plan` | `ConfirmDialog`: no borra el plan, lo marca `is_active = false` |

### Estados

| Estado | Qué se ve |
|---|---|
| **Carga** | Skeletons por sección (3 campos + 5 filas de plan). |
| **Vacío** | No aplica: `app_settings` es singleton con `DEFAULT` y `plans` viene del seed. Si faltara un plan: `Sin planes activos. Activa al menos uno para poder renovar.` y el flujo de renovación bloquea con ese motivo. |
| **Error** | Por sección: `No se pudo guardar. Revisa los valores e inténtalo otra vez.`; el formulario conserva lo escrito y muestra el error del campo cuando existe. Error de carga: `No se pudo cargar la configuración.` + `Reintentar`. |
| **Sin permiso** | §1.4. |
| **Con datos** | Secciones descritas. |

### Componentes
`Tabs`/anclas, `Input` numérico, `Switch`, `Table` editable, `Textarea` con contador, `Alert`,
`Button`, `ConfirmDialog` (al desactivar un plan en uso).

---

## 11. Flujo crítico — **Registrar renovación**

**Objetivo:** de la fila del dashboard a la renovación registrada en **≤15 s y ≤3 clics** cuando
los valores sugeridos son correctos (sin escribir nada).

**Superficie:** `Sheet` lateral derecha de 560 px en `lg+`; pantalla completa en `<768`.
**No navega:** el dashboard queda detrás, con el scroll y el filtro intactos.

### 11.1 Entradas

| Entrada | Estado inicial |
|---|---|
| Botón `Registrar renovación` en una fila | Cliente y cuenta fijados (`ReadonlyChip` + `Cambiar`) |
| Botón primario del topbar | Combobox de cliente vacío, enfocado |
| Ficha de cuenta / cliente | Cliente y cuenta fijados |
| Seguimiento (estado `CONFIRMADO`) | Cliente y cuenta fijados |

### 11.2 Anatomía del sheet

```
┌ Registrar renovación                                    [×] ┐
│ Rosa Quispe Huamán · 987 654 321          [Cambiar]        │
│ ─────────────────────────────────────────────────────────── │
│ Cliente            [ Rosa Quispe Huamán            ▾ ]      │  1
│ Cuenta IPTV        [ rquispe01 · vence 12 nov 2026 ▾ ]      │  2
│ Plan               [ 1 mes / 3 dispositivos        ▾ ]      │  3
│                    S/ 15.00 · 1 token                       │
│ Precio acordado    [ S/ 15.00 ]                             │  4
│ Tokens a consumir  [ − 1 + ]   Saldo: 14 → 13               │  5
│ Tipo de operación  [ Renovación | Activación ]              │  6
│ Fecha y hora de la operación                                │  7
│                    [ 21 oct 2026 · 09:42 ]  · Lima          │
│ Nuevo vencimiento  [ 12 nov 2026 · 08:00 ]  [Sugerido]      │  8
│                    desde el vencimiento actual (12 nov)     │
│ ── Cobro ────────────────────────────────────────────────── │
│ Registrar cobro ahora                        [switch on]    │  9
│ Importe            [ S/ 15.00 ]                             │
│ Método             [ Yape ▾ ]                               │
│ Fecha del cobro    [ 21 oct 2026 · 09:42 ]                  │
│ Referencia         [ 004821 ]                               │
│ ── Notas ────────────────────────────────────────────────── │
│ [                                                    ]      │ 10
│ ─────────────────────────────────────────────────────────── │
│ Acordado S/ 15.00 · Costo tokens S/ 1.87 · Margen S/ 13.13 │ 11
│                              [ Cancelar ] [ Confirmar ]     │ 12
└─────────────────────────────────────────────────────────────┘
```

En `lg+`, la columna del sheet es una sola; los pares Plan+Precio y Tokens+Tipo comparten fila
cuando el ancho lo permite (≥520 px). En móvil, todo en una columna, campos de 44 px.

### 11.3 Campos y contrato con la base

| # | UI | Origen del valor inicial | Destino | Regla |
|---|---|---|---|---|
| 1 | Cliente | fila / búsqueda | `customers.id` | requerido |
| 2 | Cuenta IPTV | única cuenta activa del cliente o selección | `iptv_accounts.id` | requerido; muestra `external_username` y `expires_at` |
| 3 | Plan | último plan de la cuenta; si no hay, `1M_3D` | `plans.id` → `rpc_register_renewal(p_plan_id)` | requerido; 5 opciones, `is_active` |
| 4 | Precio acordado | `plans.suggested_price` | `renewals.amount_agreed` | ≥0, 2 decimales, editable |
| 5 | Tokens a consumir | `plans.tokens_required` | `renewals.tokens_used` | entero 0..`token_stock.quantity`; chip `Ajustado` si difiere del plan |
| 6 | Tipo de operación | `RENOVACION` (o `ACTIVACION` si la cuenta no tiene renovaciones) | `renewals.operation_type` | — |
| 7 | Fecha/hora operación | ahora en `America/Lima` | `renewals.effective_at` | requerido |
| 8 | Nuevo vencimiento | sugerencia según ADR-007 | `renewals.new_expiration` + `expiration_edited` | requerido; editable |
| 9 | Cobro | importe = `amount_agreed`, método `YAPE`, fecha = operación | `payments.amount/method/paid_at/reference/notes` | `> 0`; `Σ payments + amount <= amount_agreed` |
| 10 | Notas | — | `renewals.notes` | ≤500 |
| 11 | Resumen | `tokens_used × token_stock.avg_unit_cost` (SQL) | solo lectura | ver §11.6 |
| 12 | Clave de idempotencia | uuid v4 generado **al abrir** el sheet | `p_idempotency_key` | se reutiliza en reintentos |

### 11.4 Regla de la fecha sugerida (ADR-007)

Función única `suggestExpiration({ operation, currentExpiration, effectiveAt, months })`:

| Caso | Cálculo | Etiqueta bajo el campo |
|---|---|---|
| Cuenta vencida o activación | `effectiveAt + N meses` | `desde la operación (21 oct 2026)` |
| Cuenta vigente | `currentExpiration + N meses` | `desde el vencimiento actual (12 nov 2026)` |
| Fin de mes | ajuste calendario (`31 ene + 1 mes = 28 feb`) | ídem |

- La fecha se recalcula cuando cambian plan, operación o fecha de operación, **solo si el admin no
  la editó**. Al editarla aparece el chip `Editado manualmente` y un enlace `Volver al sugerido`.
- Se envía siempre el valor visible del campo + `expiration_edited`.
- Esta función **no** se usa para pintar estados: el estado sigue viniendo de `v_account_status`.

### 11.5 Validación (orden y mensajes)

| Condición | Mensaje | Dónde |
|---|---|---|
| Sin cliente/cuenta | `Elige un cliente y una cuenta.` | junto al campo |
| Sin plan | `Elige un plan.` | junto al campo |
| `amount_agreed` vacío o > 2 decimales | `Ingresa un importe con hasta 2 decimales.` | bajo el importe |
| `tokens > stock` | `Necesitas 3 tokens y tienes 1. Compra tokens para continuar.` + enlace | bajo el campo + resumen en rojo |
| `new_expiration` ≤ `effective_at` | `El vencimiento debe ser posterior a la operación.` | bajo la fecha |
| Cobro > acordado | `El cobro no puede superar el importe acordado (S/ 15.00).` | bajo el importe del cobro |
| Cobro ≤ 0 con el switch activo | `Ingresa un importe mayor a 0 o desactiva el cobro.` | ídem |
| Plan inactivo | `Este plan está desactivado. Elige otro o actívalo en Configuración.` | bajo el plan |

El foco va al primer campo inválido al intentar confirmar. Los errores se anuncian con `role="alert"`.

### 11.6 Resumen antes de confirmar (obligatorio)

Barra fija en el footer:

```
Acordado S/ 15.00   ·   Costo de tokens S/ 1.87   ·   Margen estimado S/ 13.13
Nuevo vencimiento: 12 nov 2026 · 08:00   ·   Tokens después: 13
```

- **Costo de tokens**: `tokens_used × token_stock.avg_unit_cost`, redondeado a 2 decimales para
  mostrar. Etiqueta siempre `estimado`: el costo definitivo lo congela el RPC.
- **Margen estimado**: `amount_agreed − costo estimado`. No descuenta gastos generales.
- Si el margen es negativo o cero, se muestra en `--color-danger-text` con el texto
  `Margen negativo: revisa el precio o los tokens.` (no solo color).
- El resumen se actualiza en vivo y **no** hace peticiones: usa los datos ya cargados.

### 11.7 Confirmación y estados del sheet

| Estado | Comportamiento |
|---|---|
| **Carga** | Al abrir desde una fila: skeletons de 3 bloques (datos del cliente, plan/saldo, footer). El botón `Confirmar` está `disabled` hasta tener plan y saldo. |
| **Con datos** | Formulario completo con los valores sugeridos. |
| **Error de validación** | Mensajes por campo + footer indica `Revisa 2 campos`. No se envía. |
| **Error de servidor** | `Alert` danger dentro del sheet, **sin cerrar**: `No se pudo registrar la renovación.` + detalle colapsado + `Reintentar`. Se conserva todo lo escrito y la misma `idempotency_key`. |
| **Sin stock** | `Alert` warning arriba del campo de tokens + `Confirmar` deshabilitado con el motivo visible + `Comprar tokens` (abre Tokens en otra pestaña/hoja; al volver, se refresca el saldo). |
| **Loading (envío)** | Botón `Registrando…` con spinner, ancho fijo, `aria-busy`; el resto del formulario en `readonly`; `Esc` bloqueado; doble clic imposible. |
| **Éxito** | El sheet se cierra, la fila desaparece o cambia de estado en el sitio (sin recargar la página), y aparece `Toast` success: `Renovación registrada · nuevo vencimiento 12 nov 2026`. El contador de la métrica se actualiza. |
| **Éxito parcial (cobro falla)** | El sheet permanece abierto en un estado reducido: `Renovación registrada. El cobro de S/ 15.00 no se pudo registrar.` con `Reintentar cobro` (nueva `idempotency_key` solo para el pago) y `Cerrar`. **No** se vuelve a enviar la renovación. |

### 11.8 Presupuesto de interacción (criterio de aceptación 2.2)

| Paso | Tiempo objetivo | Interacción |
|---|---|---|
| Ver la fila y decidir | 3 s | lectura |
| Abrir el sheet | 0.4 s | 1 clic |
| Revisar sugerencias (plan, fecha, cobro) | 4 s | lectura |
| Confirmar | 0.5 s | 1 clic |
| Feedback (toast + fila actualizada) | 0.3 s | — |
| **Total** | **≤ 8 s** | **2 clics, 0 teclas** |

Si el admin necesita cambiar algo, cada cambio suma ~2 s; con 2 cambios sigue bajo 15 s.
El sheet nunca exige volver a buscar al cliente ni cambiar de pantalla.

### 11.9 Accesibilidad del flujo

- Al abrir: foco en el primer campo editable (`Plan` cuando el cliente está fijado; `Cliente` cuando
  no). Título del sheet como `aria-labelledby`.
- `Esc` cierra si no hay cambios; con cambios abre `ConfirmDialog` `Descartar cambios` /
  `Seguir editando`.
- Foco atrapado; al cerrar vuelve al botón de la fila.
- El resumen del footer es `aria-live="polite"` para anunciar el margen cuando cambia (sin repetir
  en cada tecla: se anuncia al cambiar de campo, no por carácter).
- Todos los controles a 44 px en táctil; el switch de cobro con `role="switch"`.
