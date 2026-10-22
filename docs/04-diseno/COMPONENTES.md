# Componentes y estados — IPTV Manager

**Versión:** 1.0 · **Consumidor:** `frontend-web` · **Tokens:** `docs/04-diseno/tokens.css`
**Vistas:** `docs/04-diseno/PANTALLAS.md` · **Preview:** `docs/04-diseno/preview/index.html`

> Cada componente documenta anatomía, medidas, tokens, los ocho estados y su comportamiento
> responsive/accesible. Si un componente no tiene un estado, se dice por qué; no se omite.
> Base sugerida de implementación: Reka UI (accesible, sin estilos) + estas clases.

---

## 0. Reglas transversales

| Regla | Valor |
|---|---|
| Altura de control | `sm` 32 px · `md` 40 px · `lg` 48 px · **táctil** 44 px (`@media (pointer: coarse)`) |
| Radio de control | `--radius-md` (8 px) |
| Borde de control | `1px solid var(--color-border-control)` — nunca `--color-border` |
| Foco | `outline: 2px solid var(--color-focus); outline-offset: 2px` + `--shadow-focus` |
| Transición | `background-color, border-color, color, box-shadow` a `--duration-fast` / `--ease-standard` |
| Deshabilitado | `background: --color-surface-sunken`, `color: --color-text-disabled`, `border-color: --color-border`, `cursor: not-allowed`, **sin** `opacity` global (rompe el contraste de forma impredecible) |
| Loading | El texto **no desaparece**: se antepone un spinner de 16 px y se fija `min-width` para no saltar |
| Error | Borde `--color-danger` + mensaje con icono + `aria-invalid="true"` + `aria-describedby` |
| Iconos | 16 px en `sm`, 18 px en `md`, 20 px en `lg`; trazo 1.75 px; `currentColor` |
| Área táctil | Todo control interactivo tiene un hit area ≥ 44×44 px; si el visual es menor, se expande con `::before { inset: -6px }` |

Todo botón, input y fila debe funcionar con teclado. Un `div` con `@click` es un bug de accesibilidad.

---

## 1. Button

**Anatomía:** `[icono?] [texto] [icono-final?]` en un `<button type="button">`. El texto nunca
se parte. Icono y texto separados 8 px.

### Variantes

| Variante | Fondo | Texto | Borde | Uso |
|---|---|---|---|---|
| `primary` | `--color-primary` | `--color-primary-fg` | ninguno | Una por vista: `Confirmar renovación`, `Guardar cambios`, `Entrar` |
| `secondary` | `--color-surface` | `--color-text` | `1px --color-border-control` | Acciones frecuentes no destructivas: `WhatsApp`, `Editar` |
| `ghost` | transparente | `--color-text-muted` | ninguno | Acciones terciarias en filas, cierre, `Cancelar` |
| `danger` | `--color-danger` (rojo 700) | blanco | ninguno | Solo confirmaciones destructivas: `Revertir renovación`, `Archivar cuenta` |
| `danger-ghost` | transparente | `--color-danger-text` | ninguno | Acción destructiva secundaria dentro de un menú |

### Medidas

| Tamaño | Alto | Padding-x | Fuente | Icono | Gap |
|---|---|---|---|---|---|
| `sm` | 32 (44 táctil) | 12 | 13 / 500 | 16 | 6 |
| `md` | 40 (44 táctil) | 16 | 14 / 500 | 18 | 8 |
| `lg` | 48 | 20 | 16 / 500 | 20 | 8 |

`icon-only`: cuadrado del alto del tamaño (32/40/48), `aria-label` obligatorio.
`full-width` en móvil: `width: 100%` para la acción primaria de una tarjeta o sheet.

### Estados

| Estado | Primary | Secondary | Ghost | Danger |
|---|---|---|---|---|
| **default** | bg `--color-primary` | bg surface, borde control | texto muted | bg `--color-danger` |
| **hover** | bg `--color-primary-hover` | bg `--color-surface-hover`, borde `--color-border-strong` | bg `--color-surface-hover`, texto `--color-text` | bg `#991b1b` (`--red-800`) |
| **focus-visible** | anillo 2 px + halo 3 px, `outline-offset: 2px` (idéntico en todas las variantes) | ídem | ídem | ídem |
| **active** | bg `--color-primary-active`, `transform: translateY(0.5px)` | bg `--color-surface-selected` | bg `--color-surface-selected` | bg `#7f1d1d` |
| **disabled** | bg `--color-surface-sunken`, texto `--color-text-disabled`, borde `--color-border` | igual | texto `--color-text-disabled` | bg `--gray-300`, texto blanco |
| **loading** | spinner 16 px + texto; `aria-busy="true"`; `cursor: progress`; **no** se deshabilita el foco (sigue enfocable) pero se ignora el clic | igual | igual | igual |
| **error** | no aplica (el error se comunica en el formulario o en el Alert) | no aplica | no aplica | no aplica |
| **empty** | no aplica | no aplica | no aplica | no aplica |

Detalle de `loading`: al confirmar una renovación el botón pasa a `loading`, conserva su ancho
(`min-width` medido al montar) y el texto cambia a `Registrando…`. **Nunca** se muestran dos
spinners ni se permite segundo envío.

### Teclado / ARIA
`Enter` y `Espacio` activan. `aria-disabled` solo si se necesita que siga siendo enfocable
(entonces el handler ignora el clic). El spinner lleva `aria-hidden="true"`; el cambio de estado se
anuncia por el `aria-busy` del botón y el `role="status"` del Toast.

### Responsive
Móvil: la acción primaria de una tarjeta ocupa el ancho completo; las secundarias se reparten
`flex: 1` con gap 8. Nunca dos botones primarios visibles a la vez.

---

## 2. Input (texto, email, búsqueda, número)

**Anatomía:** `label` (siempre visible) → control (`[icono-inicio?] [input] [sufijo|icono-final?]`)
→ `hint` o `error`.

| Propiedad | `md` | `lg` (formularios de operación) |
|---|---|---|
| Alto | 40 (44 táctil) | 48 |
| Padding-x | 12 | 12 |
| Fuente | **16 px** (`--text-lg`) | 16 px |
| Radio | 8 | 8 |
| Borde | 1 px `--color-border-control` | ídem |
| Fondo | `--color-surface` | ídem |

- Label: `--text-sm` (13) / 500 / `--color-text`, separado 6 px del control.
- Hint: `--text-xs` (12) / `--color-text-muted`, 4 px bajo el control.
- Error: `--text-xs` / `--color-danger-text` + icono `alert-circle` de 14 px, mismo espacio que el hint.
- Contador de caracteres (`0/500`) alineado a la derecha en `--text-xs` muted.
- `type="search"`: icono de lupa 16 px a la izquierda, padding-left 36 px, tecla `/` o `Ctrl+K` enfoca.

### Estados

| Estado | Visual |
|---|---|
| **default** | borde `--color-border-control`, placeholder `--color-text-placeholder` |
| **hover** | borde `--color-border-strong` (solo si el control no está enfocado) |
| **focus-visible** | borde `--color-primary`, anillo 2 px `--color-focus` + halo 3 px; el borde no cambia de grosor (evita salto de 1 px) |
| **active** | igual que focus (el input no tiene estado presionado propio) |
| **disabled** | fondo `--color-surface-sunken`, texto `--color-text-disabled`, borde `--color-border`; el valor sigue siendo legible (≥3:1) |
| **readonly** | fondo `--color-surface-sunken`, texto normal, borde `--color-border`, cursor `default`; se usa para datos que vienen del modelo (no para "bloquear" edición) |
| **loading** | no aplica al input. El campo dependiente de una búsqueda muestra `spinner` de 14 px como sufijo mientras consulta |
| **error** | borde `--color-danger`, icono + mensaje `--color-danger-text`, `aria-invalid="true"`; **el layout no se desplaza** (el espacio del mensaje está reservado) |
| **empty** | el input vacío es un estado válido: el placeholder describe el formato (`987 654 321`), no el propósito |

### Teclado / ARIA
`<label for>` real. `autocomplete` correcto (`name`, `tel`, `email`, `off` para montos).
`inputmode="decimal"` en dinero, `numeric` en teléfono y tokens. `enterkeyhint="next"` salvo en el
último campo del bloque (`done`). El error se replica en `aria-describedby`.

### Responsive
Siempre ancho completo del contenedor del formulario. En `md+` un formulario puede tener 2 columnas,
pero un campo de texto libre (notas, referencia) ocupa ambas.

---

## 3. Select

**Anatomía:** label → trigger (`[texto|placeholder] [chevron 16 px]`) → lista (`role="listbox"`)
→ hint/error. Se implementa con Reka UI `Select` (no el `<select>` nativo, para poder mostrar dos
líneas por opción: `1 mes / 3 dispositivos` + `S/ 15.00 · 1 token`).

| Propiedad | Valor |
|---|---|
| Alto del trigger | 40 / 48 (`lg`) |
| Alto de opción | 36 (44 táctil) |
| Ancho de lista | mínimo el del trigger, máximo 360 px |
| Fondo de lista | `--color-surface-raised`, `--shadow-md`, `--radius-md`, borde `--color-border` |
| Separación | 4 px bajo el trigger (`--space-1`) |

### Estados

| Estado | Visual |
|---|---|
| **default** | placeholder en `--color-text-placeholder`, chevron `--color-text-muted` |
| **hover** | borde `--color-border-strong`; opción bajo el cursor: `--color-surface-hover` |
| **focus-visible** | anillo en el trigger; opción enfocada por teclado: `--color-surface-selected` + barra izquierda 2 px `--color-primary` |
| **active** | trigger con borde `--color-primary` mientras la lista está abierta; chevron rota 180° |
| **disabled** | igual que Input deshabilitado; el chevron queda `--color-text-disabled` |
| **loading** | opciones reemplazadas por 3 skeletons de 36 px; el trigger mantiene su ancho |
| **error** | borde `--color-danger` + mensaje; se usa cuando no hay valor y es obligatorio |
| **empty** | lista con `Sin opciones` (13 px muted, 36 px de alto) y, si aplica, botón `Crear plan` |

### Teclado / ARIA
`Enter`/`Espacio`/`↓` abren; `↑`/`↓` mueven; `Enter` selecciona; `Esc` cierra sin cambiar;
escribir una letra salta a la opción que empieza con esa letra. `role="combobox"` +
`aria-expanded` + `aria-activedescendant`.

### Responsive
Móvil: la lista se presenta como **bottom sheet** con opciones de 48 px y título del campo. El
trigger sigue siendo el mismo.

---

## 4. Combobox de cliente

Buscador con resultados remotos (nombre, apellido o teléfono). Existe porque el flujo de renovación
debe funcionar sin haber navegado a Clientes.

**Anatomía:** label → input de búsqueda con lupa → lista de resultados (máx. 8) → estado vacío de
búsqueda.

- Consulta con debounce de **250 ms**; mínimo **2 caracteres**; se busca en
  `first_name`, `last_name` y `phone` (dígitos normalizados).
- Cada resultado: **nombre completo** (14 px, 500) + **teléfono formateado** (13 px muted) + contador
  de cuentas activas. Alto 56 px (44 táctil mínimo).
- Al elegir un cliente con **una sola cuenta activa**, se autoselecciona esa cuenta y se salta el
  paso. Con varias, se muestra el Select de cuenta.

| Estado | Visual / comportamiento |
|---|---|
| **default** | placeholder `Buscar por nombre o teléfono…` |
| **hover** | resultado bajo el cursor: `--color-surface-hover` |
| **focus-visible** | anillo en el input; resultado enfocado: `--color-surface-selected` |
| **active** | resultado seleccionado con check 16 px y texto 500 |
| **disabled** | cuando el flujo llega con el cliente ya fijado desde una fila: se muestra `ReadonlyChip` con el nombre y un botón `Cambiar` (ghost) en lugar del input |
| **loading** | 3 skeletons de 56 px bajo el input; `aria-busy`; nunca se borran los resultados anteriores |
| **error** | `No se pudo buscar. Reintentar` con botón ghost (no se pierde el texto escrito) |
| **empty** | `Sin resultados para "…"` + enlace `Crear cliente` (abre el alta en un modal y vuelve con el cliente creado) |

**Teclado / ARIA:** `↓` entra a la lista, `↑/↓` navega, `Enter` selecciona, `Esc` cierra y limpia.
`role="combobox"`, `aria-autocomplete="list"`, `aria-controls`, `aria-activedescendant`.
El conteo de resultados se anuncia con `role="status"`.

**Responsive:** en móvil la lista ocupa el ancho completo del sheet; resultados de 56 px.

---

## 5. Date/time picker

Se usa en: fecha/hora de la operación, vencimiento sugerido (editable), filtros de rango, fecha de
cobro y de gasto.

**Anatomía:** label → trigger con texto (`21 oct 2026 · 08:00`) + icono de calendario → popover con
calendario mensual + fila de hora.

| Propiedad | Valor |
|---|---|
| Formato visible | `d MMM yyyy` (`21 oct 2026`); con hora `21 oct 2026 · 08:00` |
| Zona | `America/Lima` siempre, mostrada como `· Lima` en el detalle de la operación |
| Ancho del popover | 280 px |
| Celda de día | 36×36 (44 táctil), radio 6, `--text-sm` |
| Alto del trigger | 40 / 48 |

- Día de hoy: borde `--color-primary`, texto `--color-primary-text`, **sin** relleno.
- Día seleccionado: relleno `--color-primary`, texto blanco.
- Días fuera del mes: `--color-text-disabled`.
- Fines de semana sin tratamiento distinto (no aporta).
- Hora: dos `input[inputmode=numeric]` (HH y mm) + atajos `Ahora` y `08:00`, `12:00`, `20:00`.
- **Nunca** se usa `<input type="datetime-local">` directo: no respeta zona ni formato es-PE.
- El valor se guarda en ISO UTC; la conversión ocurre en el borde (servicio), no en el template.

| Estado | Visual |
|---|---|
| **default** | borde control, texto `--color-text`, icono muted |
| **hover** | borde `--color-border-strong` |
| **focus-visible** | anillo; en el calendario, día enfocado con anillo interior |
| **active** | popover abierto: borde `--color-primary` |
| **disabled** | como Input deshabilitado |
| **loading** | no aplica (componente local, sin red) |
| **error** | borde `--color-danger` + mensaje (`La fecha debe ser posterior al 12 oct 2026`) |
| **empty** | trigger muestra `Seleccionar fecha` en `--color-text-placeholder` |

**Teclado:** `Enter` abre; flechas mueven por días; `PageUp/PageDown` cambian de mes; `Home/End`
inicio/fin de semana; `Esc` cierra. `role="dialog"` en el popover con `aria-label="Elegir fecha"`.

**Responsive:** el popover se ancla al campo y, si no cabe (móvil), se muestra como bottom sheet.

---

## 6. Textarea

Notas de la operación, notas del cliente, motivo de reversión, plantilla de WhatsApp.

| Propiedad | Valor |
|---|---|
| Min-height | 80 px (3 líneas) · 120 px en plantillas |
| Padding | 10 × 12 |
| Fuente | 16 / 24 |
| Resize | `vertical` (nunca horizontal, rompe el layout) |
| Contador | `--text-xs`, se pone `--color-warning-text` al llegar al 90 % del máximo |

Estados: idénticos a Input, con `error` visible sin mover el layout y `readonly` para el snapshot
del mensaje ya enviado (`contact_logs.rendered_body`).

Regla de negocio: el motivo de reversión es **obligatorio** (el modelo lo exige si `reversed_at`
no es nulo). El botón de confirmar permanece deshabilitado hasta que haya texto (mín. 5 caracteres).

---

## 7. Checkbox y Switch

**Checkbox** — selección múltiple en tablas, filtros y confirmaciones.
Caja de 16×16, radio 4, borde `--color-border-control`, check blanco de 12 px sobre
`--color-primary`. Hit area 44×44. Estado indeterminado: barra horizontal blanca.
Label a 8 px, `--text-base`, clicable (el `<label>` envuelve al control).
Estados: default · hover (borde `--color-primary-text`) · focus-visible (anillo) · active
(`--color-primary-active`) · disabled · indeterminate · error (borde `--color-danger` + mensaje).

**Switch** — preferencias de efecto inmediato (tema, densidad, plantilla activa).
Pista de 40×24, radio full, perilla de 18 px. Off: `--gray-300`; on: `--color-primary`. Perilla
blanca con `--shadow-sm`. Transición 120 ms. Hit area 44×44.
Estados: default · hover (pista un tono más oscura) · focus-visible (anillo) · active (perilla 20 px)
· disabled · loading (perilla con spinner 12 px, `aria-busy`) · error (no aplica: el switch no
valida; si el guardado falla, se revierte el estado y se muestra un Toast).

`role="switch"` + `aria-checked`. `Espacio` alterna. En tablas, el checkbox de selección usa
`aria-label="Seleccionar a Rosa Quispe Huamán"` (no "Seleccionar fila").

---

## 8. Badge de estado

Dos familias con el mismo esqueleto: **vigencia** (5 valores) y **seguimiento** (6 valores).

**Anatomía:** `[glifo 8–10 px] [texto 12 px / 500]` con padding `2px 8px`, radio `--radius-full`
(vigencia) o `--radius-sm` (seguimiento, para diferenciarlas de un vistazo).

| Propiedad | Vigencia | Seguimiento |
|---|---|---|
| Alto | 22 px (visual; hit area no aplica: no es interactivo) | 22 px |
| Fuente | 12 / 500, capitalización normal | 12 / 500 |
| Glifo | círculo · reloj · triángulo · cuadrado-✕ · guion | ninguno (el texto es el estado) |
| Fondo | `--status-*-bg` | `--followup-*-bg` |
| Texto | `--status-*-fg` | `--followup-*-fg` |
| Borde | 1 px `--status-*-border` | 1 px `--followup-*-border` |

`VENCIDA`: fondo sólido `--red-700`, texto blanco, glifo blanco, **sin** borde visible.
`ARCHIVADA`: `border-style: dashed`, fondo `--gray-100`, sin relleno sólido.

Estados del badge: `default` (los 11 valores), `disabled` (no aplica: no interactivo), `loading`
(no aplica), `error` (no aplica), `empty` → el componente **no se renderiza**; si falta el dato se
muestra `Sin estado` en texto muted, nunca un badge vacío.
Hover/focus/active: no aplica, salvo cuando el badge es un filtro activo (entonces se implementa
como `FilterChip`, botón real con `aria-pressed` y anillo de foco).

Accesibilidad: el glifo es `aria-hidden`; el texto es el nombre del estado, así el lector anuncia
"Vencida" y no "rojo". El color nunca es el único canal.

---

## 9. Table

**Anatomía:** contenedor (`--radius-lg`, borde `--color-border`, `overflow: hidden`) →
`caption` (oculta) → `thead` sticky → `tbody` → `tfoot` (totales, opcional) → paginación.
Barra superior: título, contador, filtros, búsqueda, acciones. Barra de selección: reemplaza la
superior cuando hay filas marcadas.

| Propiedad | Escritorio | Compacta | Móvil (tarjeta) |
|---|---|---|---|
| Alto de fila | 52 px | 40 px | ≥96 px |
| Fuente celda | 14 | 13 | 14 |
| Padding celda | 8×12 | 6×8 | 12×16 |
| Cabecera | 12 mayúsculas, 600, `tracking .06em`, `--color-surface-sunken`, sticky | ídem | oculta |
| Borde entre filas | 1 px `--color-border` | ídem | ninguno (tarjetas separadas 8 px) |
| Alineación | texto izq.; dinero/tokens/fecha der.; acciones der. | ídem | — |

### Estados de la tabla (los cinco de una vista de datos)

| Estado | Comportamiento |
|---|---|
| **loading** | 8 filas skeleton con las mismas anchuras de columna; cabecera real visible; `aria-busy="true"`; sin spinner central (evita salto) |
| **empty** | `EmptyState` dentro del contenedor, con la acción siguiente según el filtro activo (`Limpiar filtros` o `Nueva cuenta`) |
| **error** | Alert de peligro dentro del contenedor + `Reintentar`; se conservan filtros y scroll |
| **sin permiso** | mensaje neutro `No tienes acceso a esta información`; no se muestran filas ni conteos |
| **con datos** | filas reales, orden, paginación y selección |
| **parcial** | si falla un dato derivado (p. ej. el último cobro), la celda muestra `—` con `title` "No disponible", sin romper la fila |

### Interacciones

- **Orden:** clic en `th` alterna asc → desc → sin orden. `aria-sort="ascending|descending|none"`.
  Indicador: flecha de 12 px **+** cambio de color de la cabecera. Orden por defecto del dashboard:
  el que entrega `v_account_status` (VENCIDA → URGENTE → PROXIMA → ACTIVA → ARCHIVADA, luego
  `expires_on asc`). No se reordena en cliente.
- **Selección:** checkbox en cabecera (todos los de la página), shift+clic para rango. Barra de
  acciones: `N seleccionados` + acciones + `Limpiar`. `role="status"` al cambiar el conteo.
- **Fila:** `tabindex="0"`, `Enter` abre la ficha, `aria-label="Abrir ficha de Rosa Quispe Huamán"`.
  Hover: `--color-surface-hover`. Foco: outline interior (`outline-offset: -2px`).
  Seleccionada: `--color-surface-selected`.
- **Acciones por fila:** máximo 2 botones visibles (`WhatsApp` icon-only con `aria-label`,
  `Registrar renovación` en `sm`). El resto en menú `⋯` (44×44). `Escape` cierra el menú y devuelve
  el foco al disparador.
- **Fila `VENCIDA` / `URGENTE`:** barra de 3 px a la izquierda (`border-left`) + badge. El texto de
  la fila no cambia de color (un párrafo rojo completo es ilegible).
- **Paginación:** `1–25 de 128` a la izquierda, `‹ ›` a la derecha (44×44). Cambio de tamaño
  25/50/100. Nunca se pagina en cliente: `range()` en PostgREST.
- **Scroll:** la tabla nunca scrollea horizontal en escritorio (se eligen columnas); si el
  contenedor mide <640 px se convierte en tarjetas. En tablet (640–1023) se permite scroll
  horizontal **con** `tabindex="0"` y `role="region"` + `aria-label` para que sea accesible por
  teclado.

### Responsive (≤640 px de contenedor)

Cada `tr` se presenta como tarjeta. Se conservan: estado, cliente, cuenta (`external_username`),
plan corto, vencimiento y las 2 acciones (ancho completo, 44 px). Se descartan de la tarjeta:
referencia, notas, verificación. Marcado único: `data-label` en cada celda + `display: block` en
`tr/td`, sin duplicar HTML (ver `preview/index.html`).

---

## 10. Card de métrica

**Anatomía:** `label` (12 mayúsculas muted) → `valor` (34 tabular 600) → `contexto` (12 muted, una
línea) → `[medidor?]` → `[enlace "Ver todos"?]`.

| Propiedad | Valor |
|---|---|
| Padding | 16 (móvil) / 20 (escritorio) |
| Min-height | 96 / 104 |
| Radio | `--radius-lg` |
| Borde | 1 px `--color-border` |
| Fondo | `--color-surface` |

Variantes por severidad: `neutral` (borde normal), `attention` (barra superior 3 px ámbar),
`critical` (barra superior 3 px roja + valor en `--color-danger-text`). La severidad **nunca** va
solo en el color: el contexto dice "3 cuentas vencidas".

Medidor de tokens: barra de 4 px, `--meter-track`, relleno `--meter-ok|low|empty` según
`quantity` vs `min_token_balance` (el umbral lo decide `app_settings`, no la UI), `role="img"` con
`aria-label="14 de 20 tokens sobre el mínimo"`.

Estados: `default` · `hover` (solo si es cliqueable: borde `--color-border-strong`) ·
`focus-visible` (si es enlace, anillo en toda la tarjeta) · `active` (sin cambio) · `disabled`
(no aplica) · `loading` (skeleton de label 60×12 + valor 88×32, **sin** mostrar `0`) · `error`
(`—` grande en `--color-text-disabled` + texto `No disponible`) · `empty` (`0` es un dato válido y
se muestra como `0`, no como vacío).

Responsive: 1 columna <480, 2 columnas 480–1023, 4 columnas ≥1280. Las métricas críticas
(vencen hoy, vencidas) van primero en el orden de lectura.

---

## 11. Modal y Sheet

| | Modal (centrado) | Sheet (lateral) |
|---|---|---|
| Uso | Confirmaciones, alta rápida de cliente, detalle corto | **Registrar renovación**, ficha de cuenta, filtros en móvil |
| Ancho | `--layout-modal-w` 520 px (máx. `calc(100vw - 32px)`) | `--layout-sheet-w` 560 px |
| Alto | auto, máx. `calc(100vh - 64px)` | 100vh, `top: 0; right: 0` |
| Radio | `--radius-xl`, todos los lados | 0 (pegado al borde) |
| Sombra | `--shadow-lg` | `--shadow-sheet` |
| Entrada | fade + escala 0.98→1, 180 ms `--ease-out` | translateX(100%)→0, 220 ms `--ease-out` |

**Anatomía:** overlay (`--color-overlay`) → contenedor → header (título 18/600 + subtítulo 13 muted
+ cierre 44×44) → cuerpo scrolleable → footer sticky (acciones, borde superior, fondo surface).
En el sheet de renovación, el footer muestra el resumen (margen estimado) y el botón primario.

Estados: `default` · `loading` (cuerpo con skeletons, footer con botón en loading) · `error`
(Alert dentro del cuerpo, el sheet **no** se cierra) · `empty` (no aplica en modal; en el sheet de
ficha, secciones vacías con texto) · `hover/focus/active` aplican al cierre y a los botones del
footer · `disabled` aplica al botón de confirmar.

Accesibilidad: `role="dialog"` `aria-modal="true"` `aria-labelledby`; foco al primer campo
(o al título si es solo lectura); foco atrapado; `Esc` cierra solo si no hay cambios sin guardar
(si los hay, `ConfirmDialog`); al cerrar, el foco vuelve al disparador. `body { overflow: hidden }`
mientras está abierto. En móvil (<768) el sheet ocupa el 100 % del ancho y el alto, con
`padding-bottom: env(safe-area-inset-bottom)`.

---

## 12. Toast

**Anatomía:** icono de severidad 18 px → mensaje (14) → `[acción de texto?]` → cierre 32×32.

- Posición: abajo-derecha en escritorio (`--space-6` de margen), arriba-centro en móvil bajo el
  topbar. `--z-toast`.
- Ancho: 320–420 px. Máximo 3 apilados; el cuarto expulsa al más antiguo.
- Duración: 4 s (5 s si tiene acción). Pausa al hacer hover o al enfocar.
- Fondo `--color-surface-raised`, borde 1 px de la severidad, `--shadow-md`, barra izquierda 3 px.
- `role="status"` para éxito/información; `role="alert"` para error. `aria-live` gestionado por el
  contenedor.
- **Nunca** es el único canal de un error de formulario: el campo también lo muestra.

Estados: `default` (éxito) · `hover` (borde más fuerte) · `focus-visible` (anillo) · `active`
(acción presionada) · `disabled` (no aplica) · `loading` (no aplica; para eso está el botón) ·
`error` (variante de severidad, `role="alert"`) · `empty` (no aplica).

Mensajes (español, sin jerga): `Renovación registrada` · `Cobro de S/ 15.00 registrado` ·
`No se pudo guardar. Revisa tu conexión e inténtalo de nuevo`. El de error lleva acción
`Reintentar` cuando la operación es idempotente (lo es, por `idempotency_key`).

---

## 13. Alert (banner en línea)

**Anatomía:** icono 18 px → `[título 14/600]` + cuerpo 13/20 → `[acción]` → `[cierre]`.

| Variante | Icono | Fondo | Borde izq. | Texto |
|---|---|---|---|---|
| `info` | `info` | `--color-info-soft` | 3 px `--color-info` | `--color-info-text` |
| `success` | `check` | `--color-success-soft` | 3 px `--color-success` | `--color-success-text` |
| `warning` | `alert-triangle` | `--color-warning-soft` | 3 px `--color-warning` | `--color-warning-text` |
| `danger` | `alert-circle` | `--color-danger-soft` | 3 px `--color-danger` | `--color-danger-text` |

Padding 12×16, radio `--radius-md`, 8 px de separación con el bloque siguiente. El icono y el
título son obligatorios (el color solo no comunica).

Usos: `warning` para saldo de tokens bajo el mínimo; `danger` para error de carga con `Reintentar`;
`info` para la nota "Comprar tokens no cuenta como gasto del mes"; `success` para confirmación de
una importación.

Estados: `default` · `hover` (solo si es cliqueable) · `focus-visible` (acción) · `disabled` (no
aplica) · `loading` (no aplica) · `error` (es una variante, no un estado) · `empty` (no se
renderiza si no hay mensaje).

---

## 14. Tabs

**Anatomía:** `role="tablist"` → `role="tab"` (texto + contador opcional) → indicador inferior
2 px → panel `role="tabpanel"`.

| Propiedad | Valor |
|---|---|
| Alto | 40 (44 táctil) |
| Fuente | 14 / 500; activo 600 + `--color-text` |
| Inactivo | `--color-text-muted` |
| Indicador | 2 px `--color-primary`, anima `transform` 180 ms |
| Contador | píldora 20 px, `--text-xs`, fondo `--color-surface-sunken` |
| Overflow móvil | scroll horizontal con `scroll-snap` y `mask-image` en el borde |

Se usan para: filtros de rango del dashboard (`Hoy`, `7 días`, `Vencidas`, `Todas`), secciones de la
ficha de cliente (`Cuentas`, `Renovaciones`, `Contacto`), y Tokens (`Compras`, `Movimientos`).

Estados: `default` · `hover` (texto `--color-text`, fondo `--color-surface-hover` en radio superior)
· `focus-visible` (anillo dentro del tab, `outline-offset: -2px`) · `active` (indicador desplazado)
· `disabled` (texto `--color-text-disabled`, sin indicador) · `loading` (el panel muestra skeletons;
el tab conserva su estado) · `error` (el panel muestra el Alert) · `empty` (el panel muestra
`EmptyState` propio, no un panel en blanco).

Teclado: `←/→` mueven y activan (activación automática), `Home/End` a los extremos.
`aria-selected`, `aria-controls`, `tabindex="-1"` en los no activos.

---

## 15. Skeleton

Bloques con `background: --color-surface-sunken`, `border-radius: --radius-sm`, pulso de opacidad
0.55→1 cada 1.4 s (`ease-in-out`, infinito).

| Contexto | Formas |
|---|---|
| Métrica | label 56×11 + valor 96×30 + contexto 120×10 |
| Fila de tabla | 5 bloques alineados a las columnas reales, alto 12, `--radius-xs` |
| Tarjeta móvil | 3 líneas + 2 botones de 44 px |
| Ficha | título 180×20 + 4 pares label/valor |
| Sheet de renovación | 6 campos de 40 px + footer |

Reglas: el esqueleto **ocupa el mismo alto que el contenido real** (evita CLS), nunca se muestra más
de 10 s (a los 10 s pasa a error con reintento), y va dentro de un contenedor con `aria-busy="true"`
y `aria-live="polite"` para que el lector anuncie la carga una vez, no cada pulso.

Estados: `default` (animado) · `reduced-motion` (sin pulso, opacidad 0.7 fija) · los demás no
aplican.

---

## 16. EmptyState

**Anatomía:** glifo 40 px (SVG inline, trazo 1.5, `--color-text-muted`) → título 16/600 →
descripción 13/20 muted (máx. 2 líneas, 46 ch) → acción primaria → `[acción secundaria ghost]`.

| Contexto | Título | Descripción | Acción |
|---|---|---|---|
| Dashboard sin cuentas | `Aún no hay cuentas registradas` | `Registra tu primer cliente y su cuenta para empezar a controlar vencimientos.` | `Nuevo cliente` |
| Filtro sin resultados | `Ningún vencimiento en este rango` | `Prueba con «Todas» o cambia el rango de fechas.` | `Ver todas` |
| Renovaciones vacío | `Sin renovaciones en este periodo` | `Cuando registres una renovación aparecerá aquí con su margen.` | `Registrar renovación` |
| Tokens sin compras | `Todavía no compraste tokens` | `Registra una compra para poder renovar cuentas.` | `Comprar tokens` |
| Búsqueda sin resultados | `Sin resultados para "…"` | `Revisa el nombre o el teléfono, o crea el cliente.` | `Crear cliente` |

Medidas: padding 48 vertical, contenido centrado, ancho máximo 380 px. En tabla, ocupa el área del
`tbody` (no rompe la cabecera). Nunca usa imágenes; el glifo es CSS/SVG inline.

Estados: es un estado en sí mismo. `loading` lo reemplaza el Skeleton; `error` lo reemplaza el Alert.

---

## 17. ConfirmDialog

**Anatomía:** Modal 440 px → icono de severidad 20 px + título 18/600 → cuerpo 14/20 (consecuencia
concreta, no "¿Estás seguro?") → `[campo de motivo obligatorio]` → footer `Cancelar` (secondary) +
`Confirmar` (danger o primary).

Reglas:
- El cuerpo dice **qué** va a pasar y **qué** se puede deshacer:
  `Se devolverán 3 tokens al costo original y el vencimiento volverá al 12 nov 2026. El cobro registrado no se borra.`
- El botón destructivo nombra la acción: `Revertir renovación`, no `Aceptar`.
- Con motivo obligatorio, `Confirmar` está `disabled` hasta que el texto tenga ≥5 caracteres.
- El foco inicial va al botón `Cancelar` (la opción segura).
- `Esc` cancela. Nunca se cierra haciendo clic en el overlay si la acción es destructiva.
- Nunca se usa para informar: para eso está el Toast.

Estados: `default` · `loading` (confirmar en loading, cancelar deshabilitado, `Esc` bloqueado) ·
`error` (mensaje dentro del diálogo, se mantiene abierto y el texto del motivo no se pierde) ·
`disabled` (confirmar bloqueado por validación) · `hover/focus-visible/active` en los botones.

---

## 18. MoneyInput (PEN)

Campo de importe en soles. **Nunca** usa `float`: el valor viaja como string decimal
(`"15.00"`) y el input trabaja internamente en centavos enteros.

**Anatomía:** label → control con prefijo fijo `S/` (13 px muted, separado 8 px) + input alineado a
la derecha → hint/error.

| Propiedad | Valor |
|---|---|
| Alto | 40 / 48 (`lg`) |
| Fuente | 16, `tabular-nums`, alineado a la derecha |
| Formato en reposo | `15.00` (siempre 2 decimales) |
| Formato al enfocar | `15.00` editable; se acepta `15`, `15,5`, `15.50`, `S/ 15.50` y se normaliza |
| Máximo | `9999999.99` (coincide con `numeric(12,2)`) |
| Mínimo | `0.01` cuando el campo es obligatorio (pago/gasto); `0.00` permitido en `amount_agreed` |
| `inputmode` | `decimal` |
| Acentos rápidos | `+1`, `+5`, `+10` (solo en cobro, opcional) |

- Al salir del campo se reformatea a 2 decimales. No se redondea silenciosamente: si el usuario
  escribe `15.555` se muestra error `Usa como máximo 2 decimales`.
- No se usa `type="number"` (rueda del ratón y notación científica). Es `type="text"` +
  `inputmode="decimal"` + `pattern`.
- El total que se muestra al pie **viene del servidor** (`SUM` en SQL). El input nunca suma nada.

Estados: `default` · `hover` · `focus-visible` · `active` · `disabled` · `loading` (no aplica) ·
`error` (`El importe no puede superar S/ 15.00`, `Ingresa un importe mayor a 0`) · `empty`
(placeholder `0.00`, el prefijo `S/` permanece visible).

---

## 19. TokenInput

Cantidad de tokens a consumir. Entero, sin decimales, acotado por el saldo real.

**Anatomía:** label → control `[−] [valor] [+]` → contexto `Saldo: 14 → 11` → `[medidor]`.

| Propiedad | Valor |
|---|---|
| Alto | 40 (44 táctil); botones `−`/`+` de 40×40 (44 táctil) |
| Fuente | 16, `tabular-nums`, centrado |
| Paso | 1; mantener presionado acelera a 1 cada 80 ms tras 500 ms |
| Máximo | `token_stock.quantity` (el saldo leído del servidor) |
| Mínimo | 0 (una activación puede no consumir tokens) |

- El contexto muestra el saldo resultante **calculado con enteros**: `Saldo: 14 → 11 tokens`. Si el
  resultado es negativo, el campo pasa a `error` y `Confirmar` se deshabilita con el motivo visible:
  `Necesitas 3 tokens y tienes 1. Compra tokens para continuar.` (con enlace a Tokens).
- Nunca se permite escribir un valor mayor al saldo: se recorta y se avisa, no se ignora en silencio.
- Si el plan define `tokens_required`, el valor inicial viene de ahí; cambiarlo muestra
  `Ajustado manualmente` (chip 12 px) para que el admin sepa que difiere del plan.

Estados: `default` · `hover` (botones con fondo `--color-surface-hover`) · `focus-visible` (anillo en
el input y en cada botón) · `active` (botón presionado, fondo `--color-surface-selected`) ·
`disabled` (cuando el plan no consume tokens o falta stock: mensaje, no solo gris) · `loading`
(botones con spinner 12 px mientras se relee `token_stock`) · `error` (stock insuficiente, descrito
arriba) · `empty` (0 es válido y se muestra como `0`).

---

## 20. PhoneInput (Perú)

**Anatomía:** label → control `[+51] [input 987 654 321]` → hint/error.

| Propiedad | Valor |
|---|---|
| Alto | 40 / 48 |
| Prefijo | `+51` fijo, 13 px muted, separador vertical 1 px |
| Fuente | 16, `tabular-nums` |
| Formato visible | `987 654 321` (3-3-3) |
| Valor guardado | 9 dígitos, sin espacios ni `+` (cumple `^[0-9]{9,15}$`) |
| `inputmode` | `numeric`, `autocomplete="tel"` |

- Se formatea mientras se escribe; el backspace borra dígitos, no espacios.
- Pegado tolerante: `+51 987 654 321`, `51987654321`, `987-654-321` → todos normalizan a
  `987654321`.
- Validación: exactamente 9 dígitos que empiecen por `9`. Mensaje:
  `Ingresa un celular de 9 dígitos (empieza con 9).`
- Enlace `Otro número` (disclosure) para números de 9–15 dígitos de otro país: muestra un campo de
  código de país y desactiva la máscara. El modelo lo permite; el caso normal no lo necesita.
- No se valida que el número exista (no hay verificación por SMS): el hint lo dice.

Estados: `default` · `hover` · `focus-visible` · `active` · `disabled` · `loading` (no aplica) ·
`error` (formato) · `empty` (placeholder `987 654 321`).

Debajo del campo, en la ficha del cliente: acciones `Copiar` y `Abrir WhatsApp` (esta última usa
`https://wa.me/51<numero>` con el mensaje de la plantilla ya renderizado).

---

## 21. Nav — sidebar (escritorio), bottom-bar y drawer (móvil)

### 21.1 Sidebar (≥1024 px)

**Anatomía:** wordmark (18/600, `--color-nav-text`) → lista de destinos → separador →
zona inferior (tema, cerrar sesión).

| Propiedad | Valor |
|---|---|
| Ancho | 236 px (`lg`) / 252 px (`xl`) |
| Fondo | `--color-nav-bg` (oscuro en ambos temas) |
| Padding | 12 |
| Ítem | alto `--nav-item-h` (36 px; 44 px con puntero grueso), padding-x 12, radio 6, gap 10, icono 18 |
| Ítem activo | fondo `--color-nav-active-bg`, texto `--color-nav-active-text`, barra 3 px a la izquierda (`::before`, radius full) |
| Badge de conteo | píldora 18 px a la derecha (`Vencen hoy: 2`), fondo `--color-nav-active-bg`, texto blanco |
| Área de foco | `outline-offset: -2px` para no salir del sidebar |

Destinos, en este orden:
`Hoy` (dashboard) · `Clientes` · `Cuentas IPTV` · `Seguimiento` · `Renovaciones` · `Tokens` ·
`Finanzas` · `Configuración`.

Estados del ítem: `default` (`--color-nav-text-muted`) · `hover` (fondo `--color-nav-hover`, texto
`--color-nav-text`) · `focus-visible` (anillo `--color-nav-focus` + halo) · `active` (fondo
`--color-nav-active-bg` + barra) · `disabled` (no aplica) · `loading` (no aplica; el conteo se
oculta mientras carga en vez de mostrar `0`) · `error` (el badge se oculta; no se inventan números) ·
`empty` (sin badge).

### 21.2 Bottom-bar (≤1023 px)

4 destinos con icono 22 px + label 11 px (12 px mínimo de texto: el label es 12), alto 56 +
`env(safe-area-inset-bottom)`, fondo `--color-nav-bg`, borde superior `--color-nav-border`.

`Hoy` · `Clientes` · `Cuentas` · `Más`

- Activo: icono y label en `--color-nav-active-text` **+** barra de 2 px arriba del ítem. No se usa
  solo el cambio de color.
- Cada ítem: 44×44 mínimo, `aria-current="page"`.
- `Más` abre el drawer con Seguimiento, Renovaciones, Tokens, Finanzas, Configuración, tema y
  cerrar sesión.

### 21.3 Drawer móvil

Sheet desde la izquierda (o bottom sheet para `Más`), 100 % de ancho, `--color-nav-bg`, mismos ítems
de 48 px de alto, `Esc`/deslizar para cerrar, foco atrapado y devuelto al botón de menú.

### 21.4 Topbar

56 px sticky, fondo `--color-surface`, borde inferior `--color-border`. Contiene:
`[menú 44×44 (móvil)] [título de página 16/600] …… [búsqueda] [acción primaria] [avatar 32]`.

En móvil solo caben el menú, el título truncado a 1 línea y la acción primaria icon-only (44×44).
La búsqueda global vive en el drawer.

---

## 22. Matriz de cobertura de estados

`✓` documentado · `—` no aplica (justificado arriba)

| Componente | default | hover | focus | active | disabled | loading | error | empty |
|---|---|---|---|---|---|---|---|---|
| Button | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| Input | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Select | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Combobox cliente | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Date/time picker | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Textarea | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Checkbox / Switch | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (switch) | ✓ (checkbox) | — |
| Badge de estado | ✓ | — | — | — | — | — | — | ✓ (no renderiza) |
| Table | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| Card de métrica | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| Modal / Sheet | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Toast | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — |
| Alert | ✓ | ✓ | ✓ | — | — | — | ✓ | ✓ (no renderiza) |
| Tabs | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Skeleton | ✓ | — | — | — | — | — | — | — |
| EmptyState | ✓ | ✓ (acción) | ✓ | ✓ | — | — | — | — |
| ConfirmDialog | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| MoneyInput | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| TokenInput | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| PhoneInput | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Nav | ✓ | ✓ | ✓ | ✓ | — | ✓ (badge) | ✓ (badge) | ✓ |
