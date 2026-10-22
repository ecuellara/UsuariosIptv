import type { AccountStatus, FollowupStatus } from '@/types/domain'

/* Formato de presentación. La UI solo formatea: no decide estados ni suma
   importes (DESIGN.md D-10). Las fechas siempre se muestran en America/Lima:
   la implementación vive en `lib/dates`. */

export { formatDate, formatDateKey, formatDateTime, formatLongDate, formatMonthYear } from './dates'

const moneyFormatter = new Intl.NumberFormat('es-PE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const integerFormatter = new Intl.NumberFormat('es-PE', {
  maximumFractionDigits: 0,
})

/** Convierte `numeric` de Postgres (number o string) sin perder el valor. */
export function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(n) ? n : null
}

type MoneySign = 'negative' | 'always' | 'none'

/**
 * `S/ 1,485.00`. Negativo: `−S/ 40.00` (U+2212, DESIGN.md §10).
 */
export function formatMoney(
  value: number | string | null | undefined,
  options: { sign?: MoneySign } = {},
): string {
  const { sign = 'negative' } = options
  const n = toNumber(value)
  if (n === null) return '—'
  const magnitude = moneyFormatter.format(Math.abs(n))
  if (n < 0) return `−S/ ${magnitude}`
  if (sign === 'always') return `+S/ ${magnitude}`
  return `S/ ${magnitude}`
}

/** Importes que se guardan como texto decimal en formularios (`"15.00"`). */
export function decimalString(value: number | string | null | undefined): string {
  const n = toNumber(value)
  if (n === null) return ''
  return moneyFormatter.format(n).replace(/,/g, '')
}

export function formatDecimal(
  value: number | string | null | undefined,
  digits = 2,
): string {
  const n = toNumber(value)
  if (n === null) return '—'
  return new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n)
}

export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return integerFormatter.format(value)
}

export function formatTokens(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${formatInteger(value)} ${value === 1 ? 'token' : 'tokens'}`
}

/** 9 dígitos → `987 654 321`. Otros largos (modelo 9–15) → grupos de 3. */
export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return '—'
  const clean = digits.replace(/\D/g, '')
  if (clean.length === 0) return '—'
  if (clean.length === 9) return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6, 9)}`
  return clean.replace(/(\d{3})(?=\d)/g, '$1 ').trim()
}

/**
 * Normaliza lo que el admin pega al formato del modelo: solo dígitos, sin `+`.
 * `+51 987 654 321`, `51987654321`, `987-654-321` → `987654321`.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('51')) return digits.slice(2)
  if (digits.length === 12 && digits.startsWith('051')) return digits.slice(3)
  return digits
}

export function isPeruMobile(digits: string): boolean {
  return /^9\d{8}$/.test(digits)
}

const STATUS_LABELS: Record<AccountStatus, string> = {
  ACTIVA: 'Activa',
  PROXIMA: 'Próxima',
  URGENTE: 'Urgente',
  VENCIDA: 'Vencida',
  ARCHIVADA: 'Archivada',
}

export function statusLabel(status: AccountStatus | null | undefined): string {
  if (!status) return 'Sin estado'
  return STATUS_LABELS[status]
}

const FOLLOWUP_LABELS: Record<FollowupStatus, string> = {
  PENDIENTE: 'Pendiente',
  CONTACTADO: 'Contactado',
  EN_CONVERSACION: 'En conversación',
  CONFIRMADO: 'Confirmado',
  RENOVADO: 'Renovado',
  NO_RENOVARA: 'No renovará',
}

export function followupLabel(status: FollowupStatus | null | undefined): string {
  if (!status) return 'Sin seguimiento'
  return FOLLOWUP_LABELS[status]
}

/** Texto relativo a partir de `days_left` (dato de SQL), nunca por resta de fechas. */
export function relativeDays(daysLeft: number | null | undefined): string {
  if (daysLeft === null || daysLeft === undefined) return '—'
  if (daysLeft === 0) return 'hoy'
  if (daysLeft === 1) return 'mañana'
  if (daysLeft === -1) return 'ayer'
  if (daysLeft > 1) return `en ${daysLeft} días`
  return `hace ${Math.abs(daysLeft)} días`
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${formatInteger(count)} ${count === 1 ? singular : plural}`
}
