import { addMonths, format, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz'

/** Zona de presentación y de negocio (ADR-006). La base persiste UTC. */
export const LIMA_TZ = 'America/Lima'

export function nowIso(): string {
  return new Date().toISOString()
}

/** Fuente única para mostrar fechas: siempre America/Lima. */
export function formatLima(
  value: string | Date,
  pattern: string,
): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return formatInTimeZone(date, LIMA_TZ, pattern, { locale: es })
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return formatLima(value, 'd MMM yyyy')
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return formatLima(value, 'd MMM yyyy · HH:mm')
}

export function formatLongDate(value: string | Date = new Date()): string {
  return formatLima(value, "EEEE d 'de' MMMM")
}

/** Fecha sin hora (p. ej. `expires_on` de la vista): `12 nov 2026`. */
export function formatDateKey(value: string | null | undefined): string {
  if (!value) return '—'
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return '—'
  return format(new Date(year, month - 1, day), 'd MMM yyyy', { locale: es })
}

export function formatMonthYear(value: string | Date = new Date()): string {
  return formatLima(value, 'MMMM yyyy')
}

/** yyyy-MM-dd del calendario de Lima (no del huso del navegador). */
export function limaDateKey(value: string | Date): string {
  return formatLima(value, 'yyyy-MM-dd')
}

/** HH:mm del calendario de Lima. */
export function limaTimeKey(value: string | Date): string {
  return formatLima(value, 'HH:mm')
}

/**
 * Combina una fecha y hora de pared de Lima en un instante UTC.
 * Se usa en el DatePicker: nunca se envía una fecha "local" del navegador.
 */
export function limaDateTimeToIso(date: string, time: string): string {
  const normalizedTime = /^\d{2}:\d{2}$/.test(time) ? time : '00:00'
  return fromZonedTime(`${date}T${normalizedTime}:00`, LIMA_TZ).toISOString()
}

/** Inicio y fin (inclusive) del mes en curso según el calendario de Lima. */
export function currentMonthRangeInLima(reference: Date = new Date()): {
  startIso: string
  endIso: string
  label: string
  key: string
} {
  const zoned = toZonedTime(reference, LIMA_TZ)
  const start = startOfMonth(zoned)
  const startIso = fromZonedTime(
    format(start, "yyyy-MM-dd'T'00:00:00"),
    LIMA_TZ,
  ).toISOString()
  // Fin exclusivo: primer instante del mes siguiente.
  const nextMonthStart = startOfMonth(addMonths(zoned, 1))
  const endIso = fromZonedTime(
    format(nextMonthStart, "yyyy-MM-dd'T'00:00:00"),
    LIMA_TZ,
  ).toISOString()
  return {
    startIso,
    endIso,
    label: format(zoned, 'MMMM yyyy', { locale: es }),
    key: format(zoned, 'yyyy-MM'),
  }
}

/** Rango del día de Lima [00:00, 24:00) en UTC. */
export function todayRangeInLima(reference: Date = new Date()): {
  startIso: string
  endIso: string
} {
  const zoned = toZonedTime(reference, LIMA_TZ)
  const day = format(zoned, 'yyyy-MM-dd')
  return {
    startIso: fromZonedTime(`${day}T00:00:00`, LIMA_TZ).toISOString(),
    endIso: fromZonedTime(`${day}T23:59:59.999`, LIMA_TZ).toISOString(),
  }
}

/**
 * Suma meses calendario con ajuste a fin de mes sobre el calendario de Lima.
 * Es una **sugerencia de formulario**: la fuente de verdad es
 * `public.add_months()` en SQL (docs/05-sql.md §4.2). Copia exacta de la regla:
 * 31 ene + 1 mes = 28 feb.
 */
export function addMonthsInLima(iso: string, months: number): string {
  const zoned = toZonedTime(new Date(iso), LIMA_TZ)
  const shifted = addMonths(zoned, months)
  return fromZonedTime(format(shifted, "yyyy-MM-dd'T'HH:mm:ss"), LIMA_TZ).toISOString()
}
