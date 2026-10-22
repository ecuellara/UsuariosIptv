# Design system — IPTV Manager

**Versión:** 1.0 · **Fecha:** 21/10/2026 · **Autor:** `ui-designer`
**Consumidor:** `frontend-web` (Vue 3 + TypeScript + Vite + Tailwind CSS)
**Fuente de tokens:** `docs/04-diseno/tokens.css` (única fuente de verdad)

> Este documento no propone una estética: resuelve las decisiones para que la implementación no
> tenga que improvisar. Si algo no está aquí, es una decisión abierta y debe documentarse, no
> inventarse en el código.

**Orden de lectura para `frontend-web`:**

| Archivo | Qué contiene | Cuándo se consulta |
|---|---|---|
| `DESIGN.md` (este) | Principios, color con contraste medido, tipografía, espaciado, motion, layout, a11y, mapeo a Tailwind | Siempre: al montar el tema y el layout |
| `tokens.css` | Variables listas para importar | Se copia a `src/styles/` sin editar |
| `COMPONENTES.md` | 21 componentes con anatomía, medidas, estados y teclado | Al construir cada componente |
| `PANTALLAS.md` | 9 pantallas + flujo de renovación: campos del modelo, acciones y estados | Al construir cada vista |
| `preview/index.html` | Referencia visual navegable y offline | Antes de dar una vista por terminada |

---

## 0. Decisiones cerradas (no renegociar sin ADR de diseño)

| # | Decisión | Consecuencia para `frontend-web` |
|---|---|---|
| D-01 | **Sin marca ni logo.** Wordmark tipográfico "IPTV Manager" en `--text-xl` semibold con tracking `-0.015em`. | No crear SVG de logo, no pedir assets, no usar imágenes decorativas. |
| D-02 | **Sin fuentes externas.** `--font-sans` = pila del sistema. | No agregar `<link>` a Google Fonts ni `@fontsource`. |
| D-03 | **Chrome de navegación oscuro en ambos temas** (sidebar y topbar móvil). | El sidebar usa tokens `--color-nav-*`, no `--color-surface`. |
| D-04 | **El color comunica estado; la tinta estructura.** El índigo solo marca acción primaria, foco y enlace. | Ningún estado de vigencia usa índigo. Ningún botón usa verde/ámbar. |
| D-05 | **VENCIDA es el único badge sólido**; ARCHIVADA es el único con borde discontinuo. | No "suavizar" VENCIDA a un tinte: perdería el peso de máxima severidad. |
| D-06 | **Densidad de tabla 52 px** (compacta 40 px, preferencia en Configuración). | No usar `py-4` en celdas: usar `--row-h` / padding de celda tokenizado. |
| D-07 | **≤640 px la tabla se convierte en tarjetas apiladas**, no en scroll horizontal. | Un solo marcado, dos presentaciones vía `@media` / `@container`. Ver §7. |
| D-08 | **Inputs a 16 px siempre** (evita el zoom de iOS y el salto de layout). | No reducir `font-size` de inputs en móvil. |
| D-09 | **Toda cifra monetaria en `tabular-nums`** y con 2 decimales: `S/ 1,485.00`. | Nunca `S/1485` ni `S/ 1485.0`. Separador de miles con coma. |
| D-10 | **Cero cálculo de negocio en el cliente.** El estado viene de `v_account_status`, los totales de SQL. | La UI solo formatea. No hay `reduce()` de importes ni comparación de fechas para decidir estado. |
| D-11 | **No hay contraseñas IPTV en la UI** (ADR-002). | Nunca renderizar un campo `password` para cuentas. Solo `external_username`, `reference`, `notes`. |
| D-12 | **Cobros = dinero recibido** (ADR-003). | No existe "pago pendiente" como entidad; el pendiente se muestra como diferencia calculada por SQL. |

---

## 1. Principios

1. **El bucle diario manda.** La pantalla por defecto responde en 3 segundos: *¿quién vence hoy?* y
   permite *abrir WhatsApp* y *registrar la renovación* desde la misma fila. Cualquier elemento que
   compita con eso está mal jerarquizado.
2. **Jerarquía por tipografía y espacio, no por color.** Un panel denso con cinco colores de estado
   ya está al límite: el resto de la interfaz es tinta sobre papel.
3. **Denso pero no apretado.** Filas de 52 px con 14 px de texto: cabe más información que con
   tarjetas grandes y sigue siendo legible a 200 % de zoom.
4. **Nada se comunica solo por color.** Cada estado lleva texto + glifo con forma distinta +
   tratamiento de borde. Se entiende en escala de grises y con daltonismo.
5. **Estados completos o no existe.** Un componente sin `disabled`, `loading` y `error` es deuda.
   Una vista sin carga/vacío/error/sin permiso está a medio construir.
6. **El teclado es un usuario de primera clase.** Todo se opera con Tab/Shift+Tab/Enter/Escape;
   el foco se ve siempre, incluso sobre el sidebar oscuro.
7. **Una sola acción primaria por vista.** En el dashboard: *Registrar renovación*. En el sheet de
   renovación: *Confirmar renovación*. El resto es secundario o ghost.

---

## 2. Color

### 2.1 Estructura

```
primitivas (escala cerrada)  →  semánticas (lo que usa el componente)  →  componente
--indigo-600                    --color-primary                          .btn-primary
--red-700                       --status-vencida-bg                      .badge-status
```

Regla dura: **los componentes nunca referencian primitivas**. Si un componente necesita un color
que no existe como semántico, falta un token, no un `#hex`.

### 2.2 Familias y su significado

| Familia | Uso exclusivo | No usar para |
|---|---|---|
| **Neutros** (`--gray-*`) | Superficies, bordes, texto, sidebar | Estados |
| **Índigo** (`--indigo-*`) | Acción primaria, foco, enlace, selección | Estados de vigencia ni éxito |
| **Verde** | Éxito, `ACTIVA`, seguimiento `CONFIRMADO`/`RENOVADO` | Acción primaria |
| **Ámbar** | Advertencia, `PROXIMA` | Errores |
| **Naranja** | `URGENTE` | Errores (reservado a VENCIDA) |
| **Rojo** | `VENCIDA`, peligro, error de validación | Texto de ayuda |
| **Azul cielo** | Información, seguimiento `CONTACTADO` | Enlaces (son índigo) |

### 2.3 Estados de vigencia — tres canales, no uno

El estado viene calculado de `v_account_status`. La UI solo lo pinta.

| Estado | Color | Tratamiento | Glifo (forma) | Texto |
|---|---|---|---|---|
| `ACTIVA` | verde | tinte + borde 1 px | **círculo lleno** | `Activa` |
| `PROXIMA` | ámbar | tinte + borde 1 px | **reloj** (círculo con manecilla) | `Próxima` |
| `URGENTE` | naranja | tinte + borde 1 px + barra izquierda 3 px en la fila | **triángulo** | `Urgente` |
| `VENCIDA` | rojo | **relleno sólido**, sin tinte | **cuadrado con ✕** | `Vencida` |
| `ARCHIVADA` | gris | **sin relleno**, borde **discontinuo** | **guion** | `Archivada` |

Diferencias estructurales (relleno/tinte/discontinuo) + forma del glifo + etiqueta: legible sin
color. En la tabla, las filas `VENCIDA` y `URGENTE` llevan además una barra de 3 px a la izquierda
(`border-left`) y **no** cambian el color del texto de la fila.

Estados de seguimiento (`followup_status`, 6 valores) usan la misma receta de chip pero sin glifo
propio: texto + color, porque el nombre del estado es explícito (`En conversación`). Tokens:
`--followup-*`.

### 2.4 Contraste medido (WCAG 2.1)

Medición real sobre los valores de `tokens.css`, resolviendo `var()` por tema y componiendo los
tintes `rgba()` sobre `--color-surface`. Script de auditoría: 44 pares × 2 temas = **88
combinaciones, 0 fallos**.

| Elemento | Tokens | Mín. | Claro | Oscuro |
|---|---|---|---|---|
| Texto principal | `--color-text` / `--color-surface` | 4.5 | **16.90:1** | **14.65:1** |
| Texto principal sobre fondo | `--color-text` / `--color-bg` | 4.5 | **15.74:1** | **16.40:1** |
| Texto secundario | `--color-text-muted` / `--color-surface` | 4.5 | **6.76:1** | **7.62:1** |
| Texto secundario sobre fondo | `--color-text-muted` / `--color-bg` | 4.5 | **6.29:1** | **8.53:1** |
| Texto secundario en cabecera de tabla | `--color-text-muted` / `--color-surface-sunken` | 4.5 | **5.86:1** | **8.03:1** |
| Placeholder | `--color-text-placeholder` / `--color-surface` | 4.5 | **4.61:1** | **5.52:1** |
| Texto sobre botón primario | `--color-primary-fg` / `--color-primary` | 4.5 | **7.90:1** | **6.29:1** |
| … hover | `--color-primary-fg` / `--color-primary-hover` | 4.5 | **9.93:1** | **5.01:1** |
| … active | `--color-primary-fg` / `--color-primary-active` | 4.5 | **12.20:1** | **7.90:1** |
| Enlace | `--color-primary-text` / `--color-surface` | 4.5 | **9.93:1** | **8.22:1** |
| Texto sobre tinte primario | `--color-primary-soft-fg` / `--color-primary-soft` | 4.5 | **8.77:1** | **9.18:1** |
| **Foco** vs superficie | `--color-focus` / `--color-surface` | 3 | **7.90:1** | **8.22:1** |
| **Foco** vs fondo | `--color-focus` / `--color-bg` | 3 | **7.36:1** | **9.20:1** |
| **Borde de control** | `--color-border-control` / `--color-surface` | 3 | **3.36:1** | **3.67:1** |
| Borde de control sobre fondo | `--color-border-control` / `--color-bg` | 3 | **3.13:1** | **4.10:1** |
| Borde de selección | `--color-border-selected` / `--color-surface` | 3 | **7.90:1** | **5.67:1** |
| Peligro (texto) | `--color-danger-text` / `--color-surface` | 4.5 | **6.47:1** | **8.90:1** |
| Éxito (texto) | `--color-success-text` / `--color-surface` | 4.5 | **7.13:1** | **12.04:1** |
| Advertencia (texto) | `--color-warning-text` / `--color-surface` | 4.5 | **7.09:1** | **11.72:1** |
| Información (texto) | `--color-info-text` / `--color-surface` | 4.5 | **7.56:1** | **10.14:1** |
| `ACTIVA` texto / fondo | `--status-activa-fg` / `--status-activa-bg` | 4.5 | **8.19:1** | **9.41:1** |
| `ACTIVA` glifo / fondo | `--status-activa-mark` / `--status-activa-bg` | 3 | **4.51:1** | **7.58:1** |
| `PROXIMA` texto / fondo | `--status-proxima-fg` / `--status-proxima-bg` | 4.5 | **8.28:1** | **8.61:1** |
| `PROXIMA` glifo / fondo | `--status-proxima-mark` / `--status-proxima-bg` | 3 | **4.66:1** | **7.44:1** |
| `URGENTE` texto / fondo | `--status-urgente-fg` / `--status-urgente-bg` | 4.5 | **8.21:1** | **7.75:1** |
| `URGENTE` glifo / fondo | `--status-urgente-mark` / `--status-urgente-bg` | 3 | **4.54:1** | **5.72:1** |
| `VENCIDA` texto / fondo sólido | `--status-vencida-fg` / `--status-vencida-bg` | 4.5 | **6.47:1** | **6.47:1** |
| `ARCHIVADA` texto / fondo | `--status-archivada-fg` / `--status-archivada-bg` | 4.5 | **5.86:1** | **6.50:1** |
| `ARCHIVADA` glifo / fondo | `--status-archivada-mark` / `--status-archivada-bg` | 3 | **5.86:1** | **4.70:1** |
| Seguimiento `PENDIENTE` | `--followup-pendiente-*` | 4.5 | **8.38:1** | **9.07:1** |
| Seguimiento `CONTACTADO` | `--followup-contactado-*` | 4.5 | **8.39:1** | **8.93:1** |
| Seguimiento `EN_CONVERSACION` | `--followup-conversacion-*` | 4.5 | **10.77:1** | **9.18:1** |
| Seguimiento `CONFIRMADO` | `--followup-confirmado-*` | 4.5 | **6.41:1** | **10.19:1** |
| Seguimiento `RENOVADO` | `--followup-renovado-*` | 4.5 | **7.18:1** | **10.85:1** |
| Seguimiento `NO_RENOVARA` | `--followup-no-renovara-*` | 4.5 | **7.26:1** | **8.24:1** |
| Sidebar texto | `--color-nav-text` / `--color-nav-bg` | 4.5 | **14.65:1** | **15.75:1** |
| Sidebar texto secundario | `--color-nav-text-muted` / `--color-nav-bg` | 4.5 | **7.62:1** | **7.12:1** |
| Sidebar ítem activo | `--color-nav-active-text` / `--color-nav-active-bg` | 4.5 | **14.15:1** | **14.22:1** |
| Foco sobre sidebar | `--color-nav-focus` / `--color-nav-bg` | 3 | **8.22:1** | **8.83:1** |
| Barra de ítem activo | `--color-nav-active-bar` / `--color-nav-bg` | 3 | **5.67:1** | **8.83:1** |
| Fila seleccionada | `--color-text` / `--color-surface-selected` | 4.5 | **14.92:1** | **12.33:1** |
| Fila en hover | `--color-text-muted` / `--color-surface-hover` | 4.5 | **6.12:1** | **7.03:1** |

Notas obligatorias:

- `--color-text-disabled` (#98a2af, 2.59:1) **no** cumple AA: está permitido solo en componentes
  inactivos (`disabled`), exentos por WCAG 1.4.3. Nunca para texto informativo.
- `--color-border` (#dde2e9) es decorativo (divisores de tabla). El borde que **identifica** un
  control es `--color-border-control` (≥3:1). No intercambiarlos.
- `--color-text-placeholder` se usa solo sobre `--color-surface` (4.61:1). Sobre `--color-bg`
  cae a 4.29:1: prohibido.

### 2.5 Tema oscuro

No es una inversión. Cambian superficie, borde, texto, foco y los tintes de estado; `VENCIDA`
mantiene el mismo par sólido y el sidebar se vuelve más oscuro que la superficie (`#12161b`) para
seguir separándose del contenido (`#191d24`). Tema por `data-theme="dark"` en `<html>`, persistido
en `localStorage` (`light | dark | system`). Sin `prefers-color-scheme` como única fuente: el
usuario puede forzar.

---

## 3. Tipografía

```css
--font-sans: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
--font-mono: "Cascadia Mono", Consolas, ui-monospace, "SF Mono", monospace;
```

Sin descarga de fuentes: cero FOUT, cero CDN, el preview abre offline.

### 3.1 Escala

| Token | px / line-height | Peso | Dónde |
|---|---|---|---|
| `--text-xs` | 12 / 16 | 500–600 | Badges, cabecera de tabla (mayúsculas), metadatos de tarjeta |
| `--text-sm` | 13 / 18 | 400–500 | Texto secundario en tablas, ayudas de campo, celdas de fecha relativa |
| `--text-base` | 14 / 20 | 400 | Cuerpo, celdas de tabla, items de navegación |
| `--text-lg` | 16 / 24 | 400–500 | Controles de formulario, cuerpo largo, botones `md` |
| `--text-xl` | 18 / 26 | 600 | Título de tarjeta (h3), nombre de cliente en ficha |
| `--text-2xl` | 22 / 30 | 600 | Título de sección (h2), cifra de tarjeta secundaria |
| `--text-3xl` | 28 / 36 | 600 | Título de página (h1) |
| `--text-4xl` | 34 / 40 | 600 | Cifra de métrica del dashboard |
| `--text-5xl` | 44 / 48 | 600 | Wordmark, cifra principal del login/tokens |

Reglas:

- **Máximo 4 tamaños por vista.** Dashboard: `3xl` (h1), `4xl` (métricas), `base` (tabla), `xs`
  (badges y cabeceras).
- **Números tabulares siempre** en columnas de dinero, tokens, fechas y contadores:
  `font-variant-numeric: tabular-nums`.
- **Mono solo para identificadores**: `external_username`, `reference`, IDs en auditoría. Nunca para
  importes (un mono a 13 px en una tabla de dinero se lee peor que el sans tabular).
- **Mayúsculas solo en cabecera de tabla y overline de sección**: `--text-xs`, `600`,
  `letter-spacing: 0.06em`. Nunca en botones ni badges (los badges van en capitalización normal:
  "Vencida", no "VENCIDA").
- El texto de un botón nunca se parte en dos líneas: `white-space: nowrap`.

---

## 4. Espaciado (base 4/8)

| Token | px | Uso típico |
|---|---|---|
| `--space-0-5` | 2 | Separación dentro de un badge, entre glifo y texto |
| `--space-1` | 4 | Gap de icono, padding vertical de chip `xs` |
| `--space-2` | 8 | Gap entre label y control, padding de celda vertical, gap de botones |
| `--space-3` | 12 | Padding horizontal de control y celda, gap de lista |
| `--space-4` | 16 | Padding de tarjeta en móvil, gutter móvil, gap de grid |
| `--space-5` | 20 | Padding de tarjeta en escritorio (vertical) |
| `--space-6` | 24 | Padding de tarjeta en escritorio, separación entre bloques |
| `--space-8` | 32 | Gutter de escritorio, separación entre secciones |
| `--space-10` | 40 | Separación entre bloques mayores del dashboard |
| `--space-12` | 48 | Alto de estado vacío, padding de modal |
| `--space-16` | 64 | Padding vertical de página vacía |
| `--space-20` | 80 | Separación de pantalla de login |
| `--space-24` | 96 | Solo login/estados vacíos a pantalla completa |

Reglas:

- **Ritmo vertical en múltiplos de 4.** Un `13px` de margen es un bug.
- El espacio entre secciones es siempre mayor que el espacio dentro de una sección (8 vs 4, 32 vs 16).
- No se usa `margin` para separar hermanos en listas: `gap` en el contenedor flex/grid.
- En tablas, el padding vertical de celda es `--space-2` y la altura se garantiza con `--row-h`.

---

## 5. Radios, sombras y bordes

### 5.1 Radios

| Token | px | Uso |
|---|---|---|
| `--radius-xs` | 4 | Chip interno, marca de estado, kbd |
| `--radius-sm` | 6 | Input pequeño, botón `sm`, celda de tabla agrupada |
| `--radius-md` | 8 | **Botones, inputs, selects, badges** |
| `--radius-lg` | 12 | Tarjetas, paneles, tabla contenedora |
| `--radius-xl` | 16 | Modal y sheet |
| `--radius-full` | 9999 | Avatar/contador, switch, píldora de filtro |

Nunca se mezclan radios en un mismo grupo: un botón (`md`) dentro de un contenedor `lg` deja 4 px
de aire mínimo en la esquina.

### 5.2 Sombras

La jerarquía la hace el **borde**, no la sombra. Un panel denso con sombras grandes parece una
pila de hojas.

| Token | Uso |
|---|---|
| `--shadow-xs` | Fila sticky, cabecera de tabla |
| `--shadow-sm` | Tarjeta de métrica, dropdown |
| `--shadow-md` | Popover, combobox abierto, toast |
| `--shadow-lg` | Modal centrado |
| `--shadow-sheet` | Sheet lateral (sombra hacia la izquierda) |
| `--shadow-focus` | Anillo de foco (siempre junto al `outline`, nunca en su lugar) |

### 5.3 Foco

```css
outline: 2px solid var(--color-focus);
outline-offset: 2px;
box-shadow: var(--shadow-focus); /* halo de 3px, refuerzo */
```

- `:focus-visible` **siempre**; `:focus` no se estiliza para no pintar el foco en clic de ratón.
- `outline: none` está prohibido sin este reemplazo.
- Sobre el sidebar (chrome oscuro) el token cambia a `--color-nav-focus` vía
  `[data-chrome="dark"]`.
- El foco de una fila de tabla se dibuja en el `tr` (`outline-offset: -2px` para que no lo recorte
  el `overflow: hidden` del contenedor).

---

## 6. Motion

| Token | ms | Uso |
|---|---|---|
| `--duration-instant` | 80 | Cambio de color en `:active`, check del switch |
| `--duration-fast` | 120 | Hover, foco, apertura de dropdown |
| `--duration-normal` | 180 | Toast, tooltip, cierre de sheet, cambio de tab |
| `--duration-slow` | 260 | Entrada de modal/sheet, transición de página |

- Easing: `--ease-out` para entradas, `--ease-standard` para cambios de estado, `--ease-in` para
  salidas. Sin `bounce`, sin `elastic`, sin rotaciones decorativas.
- Se animan solo `opacity` y `transform`. Nunca `height`, `width`, `top` ni `box-shadow`.
- **Skeleton**: pulso de opacidad 0.55 → 1 en 1.4 s, `ease-in-out`, infinito. No shimmer con
  gradiente (cuesta CPU y distrae en un panel de trabajo).
- `prefers-reduced-motion: reduce` deja las duraciones en `0ms` (ya resuelto en `tokens.css`):
  los componentes deben usar las variables, no valores literales, para heredar el cambio.
- Nada que tarde más de 260 ms en una acción de trabajo diario.

---

## 7. Layout, breakpoints y densidad

### 7.1 Breakpoints

Se definen por contenido, no por dispositivo.

| Nombre | min-width | Qué cambia |
|---|---|---|
| `xs` | 0 | Móvil: 1 columna, tabla → tarjetas, bottom-bar, sheet a pantalla completa |
| `sm` | 480 | Métricas en 2 columnas, acciones de tarjeta en línea |
| `md` | 768 | Formulario a 2 columnas, filtros en barra, tabla conserva tarjetas |
| `lg` | 1024 | **Aparece el sidebar** (236 px), tabla real, gutter 32 px |
| `xl` | 1280 | Dashboard a 2 columnas (tabla + rail de 344 px), sidebar 252 px |
| `2xl` | 1536 | Contenido tope 1320 px centrado; el resto es margen |

Breakpoint de **contenedor** para tablas: `640px` (`@container (max-width: 639px)`). Es el que
convierte tabla en tarjetas; así una tabla dentro de un sheet estrecho también se convierte.

### 7.2 Estructura

```
≥1024 px                          <1024 px
┌──────────┬──────────────────┐   ┌──────────────────────┐
│ sidebar  │ topbar 56 sticky │   │ topbar 56 + menú     │
│ 236/252  ├──────────────────┤   ├──────────────────────┤
│ fijo     │ contenido        │   │ contenido            │
│          │ max 1320         │   │ padding 16           │
│          │ gutter 32        │   │                      │
│          │                  │   ├──────────────────────┤
│          │                  │   │ bottom-bar 56+safe   │
└──────────┴──────────────────┘   └──────────────────────┘
```

- Sidebar: 236 px (`lg`), 252 px (`xl`). Fondo `--color-nav-bg`. Items de
  `--nav-item-h` (36 px; **44 px con puntero grueso**), 8 px de radio, icono 18 px + label 14 px,
  ítem activo con barra de 3 px a la izquierda y `--color-nav-active-bg`.
- Topbar: 56 px, `position: sticky; top: 0`, fondo `--color-surface` con borde inferior. Contiene
  el título de la página y las acciones. En móvil contiene el botón de menú (44×44) y el título.
- **Móvil**: bottom-bar de 4 destinos (`Hoy`, `Clientes`, `Cuentas`, `Más`) con
  `padding-bottom: env(safe-area-inset-bottom)`. "Más" abre un drawer con Seguimiento,
  Renovaciones, Tokens, Finanzas y Configuración.
- Contenido nunca a ancho completo en `2xl`: `max-width: 1320px`, `margin-inline: auto`.

### 7.3 Densidad de datos

| Contexto | Alto de fila | Texto | Padding horizontal | Notas |
|---|---|---|---|---|
| Tabla escritorio (`lg+`) | **52 px** (+1 de divisor) | 14 px | 12 px | Cabecera 12 px mayúsculas, sticky |
| Tabla compacta (preferencia) | **40 px** (+1) | 13 px | 8 px | Configuración → Apariencia → Densidad |
| Tarjeta móvil | libre (mín. 96 px) | 14 px | 16 px | Máx. 4 datos + 2 acciones |
| Lista de definición (ficha) | 36 px | 13/14 px | 0 | Label 120 px fijo, valor a la derecha |

**Conversión tabla → tarjeta (≤640 px de contenedor).** No es scroll horizontal. Cada fila se
convierte en una tarjeta con este orden fijo:

```
┌────────────────────────────────────────┐
│ ● Urgente              Vence hoy 22:00 │  ← estado (glifo+texto) + fecha
│ Julio César Mendoza Ríos               │  ← nombre, 16 px semibold
│ jmendoza_3d · 1 mes / 3 dispositivos   │  ← usuario (mono) + plan, 12 px muted
│ [ WhatsApp ]      [ Registrar renovación ]  ← 44 px, reparto 1:1
└────────────────────────────────────────┘
```

Columnas que se conservan: **estado, cliente, cuenta (con plan), vencimiento, acciones**. Se
eliminan de la tarjeta (siguen en la ficha): referencia, notas, `last_verified_at`.

### 7.4 Reglas de tabla

- Cabecera sticky con `--color-surface-sunken`, `--text-xs` mayúsculas, `--color-text-muted`.
- Alineación: texto a la izquierda; **dinero, tokens y fechas a la derecha** (comparación vertical
  por dígitos); acciones a la derecha, alineadas al borde.
- Orden: clic en cabecera alterna `asc → desc → sin orden`. Indicador con **flecha + `aria-sort`**
  (no solo color). Orden por defecto del dashboard: `status` (VENCIDA → URGENTE → PROXIMA →
  ACTIVA → ARCHIVADA) y luego `expires_on asc`, tal como lo entrega la vista.
- Paginación: 25 filas por defecto (opciones 25/50/100), pie con "1–25 de 128" y navegación
  anterior/siguiente. La paginación es de servidor (`range()` de PostgREST).
- Selección: checkbox de 16 px con área táctil de 44 px; la barra de acciones masivas reemplaza la
  cabecera y anuncia el conteo (`role="status"`).
- Acciones por fila: máximo **2 visibles** (WhatsApp y Registrar renovación). El resto, en un menú
  `⋯` de 44 px. Nunca acciones solo en `hover` (en táctil no existen).

---

## 8. Accesibilidad

Checklist que `frontend-web` debe cumplir y que QA puede verificar:

### Contraste
- [x] Todos los pares de texto ≥ 4.5:1 (≥3:1 en ≥24 px o ≥18.66 px bold) — tabla §2.4.
- [x] Bordes de control identificables ≥ 3:1 (`--color-border-control`).
- [x] Foco ≥ 3:1 contra superficie y fondo en ambos temas.
- [ ] Verificar en runtime con las capturas reales (pendiente de implementación).

### Teclado
- [ ] Orden de tabulación = orden visual. Sin `tabindex` positivos.
- [ ] Skip link "Saltar al contenido" como primer elemento enfocable.
- [ ] `Enter`/`Espacio` activan botones; `Escape` cierra modal, sheet, dropdown y combobox.
- [ ] Flechas mueven el foco en tablist (`←/→`), combobox (`↑/↓`) y menú.
- [ ] El foco se atrapa dentro de modal/sheet y vuelve al disparador al cerrar.
- [ ] Fila de tabla navegable: `tabindex="0"` en `tr` con `aria-label` del cliente y `Enter` abre
      la ficha; las acciones de la fila son botones reales (no `div` clicables).

### Semántica
- [ ] Un solo `<h1>` por pantalla; jerarquía sin saltos.
- [ ] `<table>` real con `<caption>` (visualmente oculto), `<th scope="col">` y `aria-sort`.
- [ ] Formularios: `<label for>` siempre visible (nunca placeholder como label). `aria-describedby`
      para ayuda y error. `aria-invalid="true"` en el campo con error.
- [ ] Errores anunciados en una región `role="alert"` y **también** junto al campo. El foco va al
      primer campo inválido al enviar.
- [ ] `aria-live="polite"` para el resultado de guardar y para el conteo de resultados de búsqueda.
- [ ] Iconos decorativos `aria-hidden="true"`; iconos con acción, `aria-label`.
- [ ] Estado nunca solo por color: badge con texto, glifo y (en tabla) barra lateral.

### Táctil y móvil
- [ ] Todo objetivo ≥ **44×44 px** (incluye checkbox, icon-button, cierre de modal, paginación).
      Si el diseño pide 32 px visuales, el `::before`/padding lleva el hit area a 44 px.
- [ ] `env(safe-area-inset-*)` en bottom-bar y sheet.
- [ ] Teclado no tapa el campo activo: `scroll-margin-bottom: 96px` en inputs.
- [ ] `inputmode` correcto: `numeric` para teléfono y tokens, `decimal` para dinero.
- [ ] Sin scroll horizontal a 320 px.

### Movimiento
- [ ] `prefers-reduced-motion` heredado por tokens (no hay animación con duración literal).
- [ ] Ninguna animación parpadea más de 3 veces por segundo.
- [ ] Skeleton se detiene si la petición tarda > 10 s y muestra error con reintento.

### Zoom
- [ ] 200 % de zoom sin pérdida de contenido ni scroll horizontal (probado en 1440 → 720 CSS px,
      que cae en el layout `md`).

---

## 9. Mapeo a Tailwind

`tokens.css` se importa una vez (`src/styles/tokens.css`) y el theme **referencia las variables**;
no se duplican valores en `tailwind.config`.

```ts
// Referencia para frontend-web. Este archivo NO se crea desde docs/04-diseno.
export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: {
          DEFAULT: "var(--color-surface)",
          raised: "var(--color-surface-raised)",
          sunken: "var(--color-surface-sunken)",
          hover: "var(--color-surface-hover)",
          selected: "var(--color-surface-selected)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
          control: "var(--color-border-control)",
          selected: "var(--color-border-selected)",
        },
        content: {
          DEFAULT: "var(--color-text)",
          muted: "var(--color-text-muted)",
          placeholder: "var(--color-text-placeholder)",
          disabled: "var(--color-text-disabled)",
          inverse: "var(--color-text-inverse)",
        },
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
          active: "var(--color-primary-active)",
          fg: "var(--color-primary-fg)",
          text: "var(--color-primary-text)",
          soft: "var(--color-primary-soft)",
          "soft-fg": "var(--color-primary-soft-fg)",
          border: "var(--color-primary-border)",
        },
        success: { DEFAULT: "var(--color-success)", text: "var(--color-success-text)", soft: "var(--color-success-soft)", border: "var(--color-success-border)" },
        warning: { DEFAULT: "var(--color-warning)", text: "var(--color-warning-text)", soft: "var(--color-warning-soft)", border: "var(--color-warning-border)" },
        danger:  { DEFAULT: "var(--color-danger)",  text: "var(--color-danger-text)",  soft: "var(--color-danger-soft)",  border: "var(--color-danger-border)" },
        info:    { DEFAULT: "var(--color-info)",    text: "var(--color-info-text)",    soft: "var(--color-info-soft)",    border: "var(--color-info-border)" },
        nav: {
          bg: "var(--color-nav-bg)",
          text: "var(--color-nav-text)",
          muted: "var(--color-nav-text-muted)",
          hover: "var(--color-nav-hover)",
          "active-bg": "var(--color-nav-active-bg)",
          "active-text": "var(--color-nav-active-text)",
          border: "var(--color-nav-border)",
        },
      },
      spacing: {
        "0.5": "var(--space-0-5)", 1: "var(--space-1)", 2: "var(--space-2)",
        3: "var(--space-3)", 4: "var(--space-4)", 5: "var(--space-5)",
        6: "var(--space-6)", 7: "var(--space-7)", 8: "var(--space-8)",
        10: "var(--space-10)", 12: "var(--space-12)", 14: "var(--space-14)",
        16: "var(--space-16)", 20: "var(--space-20)", 24: "var(--space-24)",
      },
      borderRadius: {
        xs: "var(--radius-xs)", sm: "var(--radius-sm)", DEFAULT: "var(--radius-md)",
        md: "var(--radius-md)", lg: "var(--radius-lg)", xl: "var(--radius-xl)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)", sm: "var(--shadow-sm)", DEFAULT: "var(--shadow-sm)",
        md: "var(--shadow-md)", lg: "var(--shadow-lg)", sheet: "var(--shadow-sheet)",
      },
      fontSize: {
        xs: ["var(--text-xs)", { lineHeight: "var(--leading-normal)" }],
        sm: ["var(--text-sm)", { lineHeight: "1.38" }],
        base: ["var(--text-base)", { lineHeight: "1.43" }],
        lg: ["var(--text-lg)", { lineHeight: "1.5" }],
        xl: ["var(--text-xl)", { lineHeight: "1.44" }],
        "2xl": ["var(--text-2xl)", { lineHeight: "1.36" }],
        "3xl": ["var(--text-3xl)", { lineHeight: "1.29" }],
        "4xl": ["var(--text-4xl)", { lineHeight: "1.18" }],
        "5xl": ["var(--text-5xl)", { lineHeight: "1.09" }],
      },
      transitionDuration: {
        instant: "var(--duration-instant)", fast: "var(--duration-fast)",
        normal: "var(--duration-normal)", slow: "var(--duration-slow)",
      },
      screens: { sm: "480px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px" },
    },
  },
}
```

Advertencia sobre alpha: las variables contienen hex, no canales. **No usar modificadores de
opacidad de Tailwind** (`bg-primary/50`) porque generan `color-mix` sobre un hex y el resultado
difiere del token auditado. Si hace falta transparencia, se define un token nuevo y se audita.

### Tokens de estado en clases utilitarias

Los estados no se mapean a `colors` porque necesitan 4 valores a la vez. Se consumen con clases
semánticas (o `@layer components`):

```css
.badge-status[data-status="ACTIVA"] {
  color: var(--status-activa-fg);
  background: var(--status-activa-bg);
  border: 1px solid var(--status-activa-border);
}
.badge-status[data-status="ARCHIVADA"] { border-style: dashed; }
.badge-status[data-status="VENCIDA"]  { color: var(--status-vencida-fg); background: var(--status-vencida-bg); border-color: var(--status-vencida-bg); }
.badge-status .mark { background: var(--status-activa-mark); } /* misma var por estado */
```

`data-status` toma exactamente los valores de `v_account_status`: `ACTIVA | PROXIMA | URGENTE |
VENCIDA | ARCHIVADA`. No se crean valores nuevos en el cliente.

---

## 10. Copy y formato (español)

| Regla | Correcto | Incorrecto |
|---|---|---|
| Dinero | `S/ 1,485.00` | `S/1485`, `S/. 1485`, `PEN 1485` |
| Negativo | `−S/ 40.00` (U+2212) | `-S/40` |
| Fecha en tabla | `12 nov 2026` | `12/11/2026` |
| Fecha + hora | `12 nov 2026 · 08:00` | `2026-11-12T08:00:00-05:00` |
| Fecha relativa | `hoy`, `mañana`, `en 3 días`, `hace 2 días` | `+3d`, `-2d` |
| Hora | 24 h, zona `America/Lima` (mostrar `· Lima` solo en el detalle de la operación) | AM/PM sin zona |
| Botón | Verbo + objeto: `Registrar renovación`, `Guardar cambios`, `Comprar tokens` | `OK`, `Aceptar`, `Enviar` |
| Estado | Capitalización normal: `Vencida` | `VENCIDA` (salvo en `data-status`) |
| Tokens | `14 tokens`, `1 token` | `14 tk`, `14 T` |
| Teléfono | `987 654 321` (9 dígitos, agrupado 3-3-3) | `+51 987654321` |
| Vacío | `Sin renovaciones registradas` (frase completa) | `No data`, `—` |

Nunca se escribe "contraseña" en la UI de cuentas. Si hace falta explicar: "La contraseña se
gestiona fuera de este panel (referencia: …)".

---

## 11. Verificación visual

### 11.1 Ejecutado sobre `preview/index.html` (21/10/2026)

Medido con Chrome headless + Chrome DevTools Protocol, viewport emulado (no capturas a ojo):

| Comprobación | Resultado medido |
|---|---|
| Contraste de tokens | 44 pares × 2 temas = **88/88 ≥ AA**, 0 fallos (§2.4) |
| Peticiones de red al abrir el archivo | **1** (el propio `index.html`); 0 externas, 0 `http(s)`, 0 `<script>`, 0 imágenes, 1 hoja de estilos inline |
| Scroll horizontal a 375 px | `scrollWidth (375) === clientWidth (375)` → **sin desbordamiento** |
| Conversión tabla → tarjeta a 375 px | contenedor 323 px, `container-type: inline-size`, `thead` oculto, `tr` en `grid`, tarjeta de 176 px |
| Alto de fila en escritorio | **52 px** de contenido (53 con el divisor de 1 px) |
| Objetivos táctiles a 375 px (puntero grueso) | **0 controles < 44×44** (69 interactivos auditados) |
| Foco con teclado real (Tab) | `outline: solid 2px` + halo; claro `rgb(67,56,202)`, sidebar `rgb(165,176,252)`; offset 2 px |
| Breakpoints | 375/768: menú visible, sidebar oculto, búsqueda oculta · 1024/1440: menú oculto, sidebar visible, búsqueda visible · sin scroll horizontal en ninguno |
| Tema oscuro | `color-scheme: dark`, fondo `#0e1116`, superficie `#191d24`, VENCIDA conserva `#b91c1c` + texto blanco |
| Escala de grises | los 5 estados siguen siendo distinguibles (relleno/tinte/discontinuo + glifo + texto) |
| Consola | 0 errores, 0 excepciones |

### 11.2 Pendiente de verificar en la app real

| Qué | Cómo | Responsable |
|---|---|---|
| Contraste con datos reales | Repetir el script de §2.4 si cambia un token; revisar los 4 estados de Alert en pantalla | `ui-designer` |
| Responsive 320 px | Captura a 320 px: sin scroll horizontal (el preview solo llega a 359 por el margen del documento) | `frontend-web` |
| Zoom 200 % | DevTools → 200 % sobre 1440 px; sin pérdida de contenido | `qa-reviewer` |
| Foco en modal/sheet | Recorrido completo con Tab, `Esc`, retorno de foco al disparador | `frontend-web` |
| Reduced motion | Emular `prefers-reduced-motion: reduce`; ninguna transición > 0 ms | `qa-reviewer` |
| Densidad compacta | Verificar 40 px de fila y que el texto a 13 px siga legible a 1440 | `ui-designer` |

### 11.3 Reproducir la verificación

```
docs/04-diseno/preview/index.html   → abrir con doble clic (offline, sin servidor)
```

El archivo no contiene `http://`, `https://`, `<link>`, `@import` ni `<script src>`. El tema oscuro
se activa con el interruptor de la barra superior del preview (CSS `:has()`, sin JavaScript).
