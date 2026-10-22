# Registro de backups y restauraciones

Complemento de `docs/06-runbook.md` §2–3 y `docs/07-deploy.md` §10.
**Un backup no existe hasta que se restauró al menos una vez.**

Regla: cada fila se escribe el mismo día. Sin fecha, archivo y resultado, la fila no cuenta.

## 1. Inventario de backups

| Fecha (UTC) | Archivo | Tamaño | Cifrado | Origen | Retención | Ubicación | ¿Verificado? |
|---|---|---|---|---|---|---|---|
| `<AAAA-MM-DD>` | `<iptv-YYYYMMDDTHHMMSSZ.dump.age>` | `<bytes>` | age (`age1…`) | `backup.yml` / manual | `<30 d>` | `<GitHub Actions artifact / .secrets/backups>` | `<pg_restore --list OK>` |

- Dumps **en claro**: solo dentro de `.secrets/backups/`, ACL restringida al usuario actual
  (`icacls .secrets /inheritance:r /grant:r "$env:USERNAME:(OI)(CI)F"`), nunca versionados.
- Dumps **cifrados**: artefacto de Actions (30 días) + copia externa si se necesita más tiempo.
- El archivo debe incluir `auth.users` (hashes) y PII: tratarlo como material sensible.

## 2. Registro de restauraciones (prueba trimestral)

| Fecha | Archivo restaurado | Descifrado | Destino | Resultado | Conteos OK | Diferencias | Responsable | Notas |
|---|---|---|---|---|---|---|---|---|
| 2026-10-21 | `verify-20261021-231156.dump` (409,3 KB, sin cifrar) | N/A (en claro) | Contenedor `postgres:17` desechable en Docker | **OK en el núcleo**, exit 1 por extensiones | **Sí** | Ninguna en tablas de negocio | Lead | 15 tablas, 7 vistas, 7 RPC, 5 planes, 4 plantillas, `token_stock` 0. 393 errores **no-core** por *event triggers* de `extensions` y propiedad de extensiones (`pgrst_ddl_watch`, `pgrst_drop_watch`). Ver nota metodológica. |

### Nota metodológica: qué significa `pg_restore` con exit 1

Un dump de Supabase incluye extensiones (`pg_graphql`, `pg_net`, `supabase_vault`, `pgsodium`, etc.)
y *event triggers* propiedad de `supabase_admin`. Al restaurar en un Postgres **sin el bootstrap de
Supabase**, esos objetos fallan aunque las tablas y los datos se restauren bien.

Por eso el criterio de éxito no es el código de salida, sino:

```sql
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r')  as tablas,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v')  as vistas,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'rpc_%') as rpc,
  (select count(*) from public.plans)                as planes,
  (select count(*) from public.whatsapp_templates)   as plantillas,
  (select quantity from public.token_stock)          as stock;
```

Debe coincidir exactamente con el origen. Para una prueba 1:1 de la plataforma, restaurar sobre un
**proyecto Supabase de prueba**, no sobre un Postgres limpio.

### Checklist de la prueba

Marcar cada punto en la columna *Notas* o en el PR asociado:

- [ ] `age --decrypt -i key.txt -o restore.dump <archivo>.dump.age` sin errores.
- [ ] `pg_restore --list restore.dump` lista tablas (`renewals`, `payments`, `token_stock`, ...).
- [ ] `pg_restore --no-owner --no-privileges -d "<url de prueba>" restore.dump` termina con
      código 0.
- [ ] Conteos iguales al origen:

```sql
select
  (select count(*) from public.renewals)                        as renewals,
  (select count(*) from public.payments)                        as payments,
  (select count(*) from public.token_movements)                 as movimientos,
  (select quantity from public.token_stock)                     as stock,
  (select coalesce(sum(amount), 0) from public.v_cash_movements) as caja;
```

- [ ] `token_stock.quantity` coincide con `sum(quantity_delta)` de `token_movements`.
- [ ] RLS activo: `select tablename, rowsecurity from pg_tables where schemaname = 'public';`
      (todas las tablas de negocio en `true`).
- [ ] Login del admin contra la base restaurada (Site URL local/proyecto de prueba).
- [ ] Se borró el entorno de prueba y el `restore.dump` en claro al terminar.

## 3. Calendario

| Actividad | Frecuencia | Responsable | Última ejecución |
|---|---|---|---|
| Backup automático (`backup.yml`) | diario 07:00 UTC | GitHub Actions | `<pendiente: secretos sin crear>` |
| Descarga + copia externa del `.age` | mensual | `<nombre>` | `<pendiente>` |
| Prueba de restauración | trimestral | `<nombre>` | `<pendiente>` |
| Rotación `SUPABASE_DB_PASSWORD` | 12 meses o si se filtró | `<nombre>` | `<pendiente>` |
| Rotación clave age (nuevo par, re-cifrar copias) | anual | `<nombre>` | `<pendiente>` |

## 4. Incidentes

| Fecha | Qué pasó | Backup usado | Pérdida de datos | Acción correctiva |
|---|---|---|---|---|
| `<AAAA-MM-DD>` | `<descripción>` | `<archivo>` | `<sí/no, rango>` | `<cambio en workflow, runbook, etc.>` |

Si un backup falla dos días seguidos, se trata como incidente: el plan free de Supabase se pausa
por inactividad y la contraseña pudo rotarse.
