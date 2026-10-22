# Aviso de privacidad — borrador operativo

> Documento interno para publicar en el panel o entregar al cliente que lo solicite.
> Reemplaza los campos entre `<...>` con los datos reales del negocio **antes** de usarlo.

## 1. Responsable del tratamiento

`<Razón social o nombre del titular>`
RUC/DNI: `<...>` · Domicilio: `<...>` · Correo de contacto: `<...>`

## 2. Qué datos tratamos

| Categoría | Datos | Origen |
|---|---|---|
| Identificación y contacto | nombres, apellidos, teléfono | el propio cliente |
| Servicio | usuario de la plataforma IPTV, plan, fecha de compra y vencimiento | el propio cliente y el panel del proveedor |
| Comercial | renovaciones, importes acordados y cobrados, medio de pago, referencias | registro interno |
| Comunicaciones | plantillas enviadas por WhatsApp, fecha, estado del seguimiento y notas | registro interno |
| Observaciones | notas libres que el administrador escriba | registro interno |

**No se almacenan contraseñas de la plataforma IPTV.** El sistema solo guarda el usuario externo y
una referencia de dónde está la contraseña.

## 3. Para qué y con qué base legal

- Gestionar la venta, activación, renovación y soporte del servicio contratado.
- Controlar vencimientos y comunicaciones relacionadas con la renovación.
- Llevar el registro contable interno de ingresos, gastos y tokens.

Base legal: ejecución de la relación contractual y consentimiento del titular para las
comunicaciones comerciales (Ley 29733 — Protección de Datos Personales, Perú).

## 4. Conservación

Los datos se conservan mientras exista relación comercial y hasta `<N>` años después del último
movimiento, por obligaciones contables. Después se anonimizan o eliminan, salvo que exista una
obligación legal de conservarlos.

El historial de auditoría del sistema se conserva para trazabilidad y no se edita.

## 5. Quién accede

- El administrador del panel, con una única cuenta autenticada.
- Proveedores de infraestructura que actúan como encargados del tratamiento:
  - **Supabase** (base de datos y autenticación), región `us-east-1` (Estados Unidos).
  - **Cloudflare Pages** (entrega del sitio estático).
  - **WhatsApp** solo cuando el administrador abre manualmente un enlace `wa.me`; el mensaje se
    envía desde el dispositivo del administrador.

Esto implica una **transferencia internacional** de datos a EE. UU. El titular lo acepta al
contratar el servicio.

## 6. Derechos del titular

El titular puede solicitar **acceso, rectificación, cancelación y oposición (ARCO)** escribiendo a
`<correo de contacto>`. El procedimiento interno es:

1. Identificar al solicitante y localizar su registro por `customer_id` o teléfono.
2. **Acceso**: exportar sus datos (cliente, cuentas, renovaciones, pagos y contactos) desde el panel
   o con la consulta SQL de `docs/06-runbook.md`.
3. **Rectificación**: corregir nombres, teléfono o notas en el panel.
4. **Cancelación**: archivar la cuenta y, si no hay obligación contable, anonimizar los datos
   personales (nombre, teléfono, notas) conservando los importes.
5. Responder en un plazo máximo de `<10 días hábiles>`.

## 7. Seguridad

- Acceso restringido a una sola cuenta autenticada; registro público deshabilitado.
- Aislamiento por RLS en todas las tablas: sin perfil autorizado no se lee ningún dato.
- Las credenciales de la plataforma IPTV no se almacenan.
- Copias de seguridad cifradas y restauración probada periódicamente.
- Las operaciones sobre dinero y tokens quedan auditadas.

## 8. Cambios

Este aviso puede actualizarse. La versión vigente es la publicada en el panel, con fecha
`<AAAA-MM-DD>`.
