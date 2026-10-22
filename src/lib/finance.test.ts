import { describe, expect, it } from 'vitest'
import {
  cashOperatingOutflow,
  currentMonthKeyInLima,
  expenseCategoryLabel,
  lastMonthsInLima,
  monthKeyToDate,
  monthLabelFromKey,
  monthRangeInLima,
  shiftMonthKey,
} from '@/lib/finance'

describe('meses de Finanzas en America/Lima', () => {
  it('toma el mes del calendario de Lima, no el de UTC', () => {
    // 1 nov 2026 02:00 UTC = 31 oct 2026 21:00 en Lima
    expect(currentMonthKeyInLima(new Date('2026-11-01T02:00:00Z'))).toBe('2026-10')
    // 21 oct 2026 18:00 UTC = 13:00 en Lima
    expect(currentMonthKeyInLima(new Date('2026-10-21T18:00:00Z'))).toBe('2026-10')
  })

  it('desplaza meses cruzando el año sin depender del huso', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12')
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01')
    expect(shiftMonthKey('2026-10', -11)).toBe('2025-11')
    expect(shiftMonthKey('2026-10', 14)).toBe('2027-12')
  })

  it('arma la clave de fecha que espera la vista', () => {
    expect(monthKeyToDate('2026-10')).toBe('2026-10-01')
    expect(() => monthKeyToDate('2026-13')).toThrow()
  })

  it('lista los últimos 12 meses con el actual primero', () => {
    const reference = new Date('2026-10-21T18:00:00Z')
    const months = lastMonthsInLima(reference, 12)
    expect(months).toHaveLength(12)
    expect(months[0]).toEqual({ value: '2026-10', label: 'octubre 2026' })
    expect(months[11]).toEqual({ value: '2025-11', label: 'noviembre 2025' })
  })

  it('etiqueta el mes en español', () => {
    expect(monthLabelFromKey('2026-01')).toBe('enero 2026')
    expect(monthLabelFromKey('2026-12')).toBe('diciembre 2026')
  })

  it('calcula el rango [inicio, fin) del mes en Lima', () => {
    const range = monthRangeInLima('2026-10')
    expect(range.startIso).toBe('2026-10-01T05:00:00.000Z')
    expect(range.endIso).toBe('2026-11-01T05:00:00.000Z')
    expect(range.label).toBe('octubre 2026')
  })
})

describe('derivaciones de caja y etiquetas', () => {
  it('resta compras de tokens del egreso total (dos escalares SQL)', () => {
    expect(cashOperatingOutflow(55, 55)).toBe(0)
    expect(cashOperatingOutflow(62, 50)).toBe(12)
    expect(cashOperatingOutflow(null, null)).toBe(0)
  })

  it('redondea a 2 decimales el resultado de la resta', () => {
    expect(cashOperatingOutflow(0.3, 0.1)).toBe(0.2)
    expect(cashOperatingOutflow(10.1, 3.35)).toBe(6.75)
  })

  it('traduce las categorías de gasto sin categoría de tokens', () => {
    expect(expenseCategoryLabel('OPERATIVO')).toBe('Operativo')
    expect(expenseCategoryLabel('PUBLICIDAD')).toBe('Publicidad')
    expect(expenseCategoryLabel('HERRAMIENTAS')).toBe('Herramientas')
    expect(expenseCategoryLabel('OTRO')).toBe('Otro')
    expect(expenseCategoryLabel(null)).toBe('—')
  })
})
