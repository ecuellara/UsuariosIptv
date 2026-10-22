# Registro de decisiones (ADR)

Formato corto: contexto → decisión → consecuencia. Una decisión cerrada no se reabre sin ADR nuevo.

---

## ADR-001 — Hosting: Cloudflare Pages + Supabase

**Contexto:** Supabase no ofrece hospedaje de SPA como servicio soportado. Storage no sirve sitios
y una Edge Function sirviendo `index.html` no tiene CDN de assets, sufre cold starts y no resuelve
el fallback de rutas de SPA.

**Decisión:** frontend estático en **Cloudflare Pages** (plan gratuito, dominio y HTTPS incluidos).
Supabase solo para Auth, PostgreSQL y RPC. Si Cloudflare diera problemas operativos, el fallback
aprobado es Vercel.

**Consecuencia:** el repo debe producir un `dist/` estático puro. Nada de server-side rendering ni
de secretos en el build. Configurar `Site URL` y `Redirect URLs` de Supabase Auth con el dominio
de Pages.

---

## ADR-002 — No se almacenan contraseñas IPTV

**Contexto:** guardar `password_ciphertext` obliga a gestionar claves, rotación, endpoint de
descifrado, rate limiting, auditoría de accesos y un procedimiento de recuperación si se pierde la
clave. Todo para ahorrar abrir un gestor de contraseñas.

**Decisión:** la cuenta IPTV guarda **usuario externo, fechas y notas** únicamente. No existe
columna de contraseña, ni Edge Function de descifrado, ni acceso a secretos.

**Consecuencia:** se elimina la superficie de ataque más delicada del proyecto. Si en el futuro se
reabre, requiere ADR propio y cifrado a nivel de aplicación con clave fuera de la base.

---

## ADR-003 — Cobros: solo dinero recibido; lo pendiente es derivado

**Contexto:** el modelo original tenía `payments.status`, lo que permite guardar "pagos pendientes"
que no son pagos y obliga a filtrar en cada consulta de caja.

**Decisión:** la app es de **control interno**, no cobra nada. Una fila de `payments` es **dinero que
ya entró**, sin estado. La obligación vive en `renewals.amount_agreed`. El pendiente es siempre
`amount_agreed − Σ payments`, calculado, nunca almacenado.

**Consecuencia:** no existen adelantos ni abonos previos (confirmado por el propietario), por lo que
`payments.renewal_id` es `NOT NULL`. No hay riesgo de contar dinero no recibido.

---

## ADR-004 — Un solo libro de tokens con estado materializado

**Contexto:** el promedio ponderado no se puede reconstruir a posteriori: el costo de un consumo
depende del inventario en ese instante. Además, validar el saldo con `SUM()` bajo concurrencia no
toma locks de fila y permite carreras.

**Decisión:** dos piezas:
1. `token_movements` = libro mayor inmutable, con **costo congelado** (`unit_cost`, `cost_amount`)
   en cada salida.
2. `token_stock` = fila singleton con `quantity` y `avg_unit_cost`, actualizada **dentro de la
   transacción con `SELECT ... FOR UPDATE`**. Es la fuente del saldo y del costo promedio.

El saldo reportado se lee de `token_stock`; el libro sirve para auditar y para recalcular si hiciera
falta.

**Consecuencia:** la validación de saldo es una resta sobre una fila bloqueada, no un agregado.
Toda compra recalcula el promedio ponderado; todo consumo congela el costo vigente.

---

## ADR-005 — Caja: una vista, no un libro duplicado

**Contexto:** registrar la compra de tokens como `token_purchases` **y** como `expenses` duplica el
egreso. Añadir una columna de origen arregla el síntoma pero deja la puerta abierta.

**Decisión:** cada hecho se guarda **una sola vez** en su tabla de origen
(`payments`, `expenses`, `token_purchases`). La caja es una **vista** `v_cash_movements` que une las
tres con dirección `IN`/`OUT`. El saldo neto es `SUM(IN) − SUM(OUT)` sobre la vista.

**Consecuencia:** el doble conteo es imposible por construcción. `expenses` **no** admite categoría
de tokens (bloqueado por constraint). Comprar tokens es conversión de caja en inventario, no gasto
del mes; el costo aparece cuando se consume.

---

## ADR-006 — Vencimientos: instante real + día calendario de Lima

**Contexto:** el proveedor muestra una fecha/hora real, pero los umbrales son en días calendario.
Guardar solo `date` pierde la hora; calcular días restando timestamps produce errores de ±1 día.

**Decisión:** se persiste `timestamptz` en UTC (`purchased_at`, `expires_at`, `effective_at`).
El "día" se deriva con `(expires_at AT TIME ZONE 'America/Lima')::date`. America/Lima no tiene
horario de verano, así que no hay ambigüedad estacional.

**Consecuencia:** el estado se calcula con dos criterios explícitos:
- `VENCIDA` si `now() >= expires_at` (instante real).
- Si no, días = `expires_on − hoy(Lima)` → `URGENTE` 0–3, `PROXIMA` 4–7, `ACTIVA` > 7.
- `ARCHIVADA` prevalece sobre todo.

Ese cálculo vive **solo** en la vista `v_account_status`. El frontend no lo reimplementa.

---

## ADR-007 — Cálculo de la nueva fecha de vencimiento

**Contexto:** al renovar, el proveedor normalmente extiende desde el vencimiento actual si la cuenta
sigue activa, y desde la fecha efectiva si ya venció. Calcular siempre desde la fecha de compra
acortaría el servicio de quien renueva antes de tiempo.

**Decisión:** el formulario pide **fecha y hora de la operación** y sugiere:
- Cuenta nueva o vencida: `new_expiration = effective_at + N meses`.
- Cuenta aún vigente: `new_expiration = expires_at + N meses`.
- La suma de meses es calendario con ajuste a fin de mes (`31 ene + 1 mes = 28 feb`).
- El campo de fecha final es **editable** y siempre visible; si el admin lo edita, se marca
  `expiration_edited = true` y la fecha editada prevalece.

**Consecuencia:** el admin puede copiar exactamente lo que muestra el proveedor. La fecha del
proveedor siempre gana sobre la sugerencia.

---

## ADR-008 — Escrituras críticas: solo RPC, nunca INSERT directo

**Contexto:** el spec prohíbe escritura directa desde el navegador en movimientos críticos.

**Decisión:** `renewals`, `payments`, `token_movements`, `token_purchases`, `token_stock` y
`audit_log` **no** tienen `INSERT/UPDATE/DELETE` para el rol `authenticated`. Toda mutación pasa por
funciones `SECURITY DEFINER` que: (1) verifican `is_admin()`, (2) validan invariantes, (3) escriben
en una transacción, (4) dejan rastro en `audit_log`. Las lecturas sí van por PostgREST con RLS.

**Consecuencia:** la UI no puede saltarse las reglas ni aunque tenga un bug. Cada RPC tiene
`idempotency_key` y devuelve el registro existente ante reintento.

---

## ADR-009 — Configuración tipada, no clave/valor

**Contexto:** una vista no puede leer umbrales desde un JSON sin casteos frágiles ni validación.

**Decisión:** `app_settings` es una **fila singleton** (`id = 1`) con columnas tipadas
(`urgent_days`, `warning_days`, `min_token_balance`, `timezone`) y checks de rango.

**Consecuencia:** la vista de estado lee columnas reales; los defaults están en el `DEFAULT` de la
tabla, no en el código del frontend.
