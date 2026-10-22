import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { LIMA_TZ } from '@/lib/dates'
import type { ExpenseCategory } from '@/types/domain'

/* Utilidades del módulo de Finanzas. Todo lo que se muestra como total viene
   de `v_cash_monthly` / `v_profit_monthly`; aquí solo se preparan claves de
   mes, etiquetas y la resta de dos escalares ya calculados por SQL. */

export interface MonthOption {
  value: string
  label: string
}

const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

function parseMonthKey(monthKey: string): { year: number; month: number } {
  const match = MONTH_KEY_PATTERN.exec(monthKey)
  if (!match) throw new Error(`Clave de mes inválida: ${monthKey}`)
  return { year: Number(match[1]), month: Number(match[2]) }
}

/** `yyyy-MM` del calendario de Lima (no del huso del navegador). */
export function currentMonthKeyInLima(reference: Date = new Date()): string {
  return formatInTimeZone(reference, LIMA_TZ, 'yyyy-MM')
}

/** Desplaza una clave `yyyy-MM` sin depender del huso del navegador. */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const { year, month } = parseMonthKey(monthKey)
  const absolute = year * 12 + (month - 1) + delta
  const nextYear = Math.floor(absolute / 12)
  const nextMonth = (absolute % 12) + 1
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`
}

/** `2026-10` → `2026-10-01`, el valor que espera `?month=eq.…`. */
export function monthKeyToDate(monthKey: string): string {
  parseMonthKey(monthKey)
  return `${monthKey}-01`
}

/** `2026-10` → `octubre 2026`. */
export function monthLabelFromKey(monthKey: string): string {
  const { year, month } = parseMonthKey(monthKey)
  return format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: es })
}

/** Últimos `count` meses, el actual primero (para el selector). */
export function lastMonthsInLima(
  reference: Date = new Date(),
  count = 12,
): MonthOption[] {
  const current = currentMonthKeyInLima(reference)
  return Array.from({ length: count }, (_, index) => {
    const value = shiftMonthKey(current, -index)
    return { value, label: monthLabelFromKey(value) }
  })
}

/**
 * Rango [inicio, fin) del mes en el calendario de Lima, para filtrar
 * `expenses.spent_at` (`timestamptz`).
 */
export function monthRangeInLima(monthKey: string): {
  key: string
  startIso: string
  endIso: string
  label: string
} {
  parseMonthKey(monthKey)
  const nextKey = shiftMonthKey(monthKey, 1)
  return {
    key: monthKey,
    startIso: fromZonedTime(`${monthKey}-01T00:00:00`, LIMA_TZ).toISOString(),
    endIso: fromZonedTime(`${nextKey}-01T00:00:00`, LIMA_TZ).toISOString(),
    label: monthLabelFromKey(monthKey),
  }
}

/**
 * Gastos operativos de caja = `outflow − token_purchases`.
 *
 * Son dos columnas ya agregadas por `v_cash_monthly`: no se suman filas ni se
 * recalcula la caja. `token_purchases` es informativo y está dentro de
 * `outflow`; restarlo permite mostrar el gasto operativo sin duplicar la
 * compra de tokens.
 */
export function cashOperatingOutflow(
  outflow: number | null,
  tokenPurchases: number | null,
): number {
  const out = outflow ?? 0
  const tokens = tokenPurchases ?? 0
  return Math.round((out - tokens) * 100) / 100
}

const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  OPERATIVO: 'Operativo',
  PUBLICIDAD: 'Publicidad',
  HERRAMIENTAS: 'Herramientas',
  OTRO: 'Otro',
}

export function expenseCategoryLabel(
  category: ExpenseCategory | null | undefined,
): string {
  if (!category) return '—'
  return EXPENSE_CATEGORY_LABELS[category]
}
