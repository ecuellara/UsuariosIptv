import { describe, expect, it } from 'vitest'
import {
  addMonthsInLima,
  formatDate,
  formatDateKey,
  formatDateTime,
  limaDateTimeToIso,
  limaTimeKey,
} from '@/lib/dates'

describe('fechas en America/Lima', () => {
  it('convierte una hora de Lima al instante UTC correcto', () => {
    expect(limaDateTimeToIso('2026-10-21', '08:00')).toBe('2026-10-21T13:00:00.000Z')
    expect(limaDateTimeToIso('2026-10-21', '23:30')).toBe('2026-10-22T04:30:00.000Z')
  })

  it('muestra las fechas en hora de Lima y no en UTC', () => {
    const iso = '2026-10-22T02:00:00.000Z'
    expect(formatDate(iso)).toBe('21 oct 2026')
    expect(limaTimeKey(iso)).toBe('21:00')
    expect(formatDateTime(iso)).toBe('21 oct 2026 · 21:00')
  })

  it('formatea fechas sin hora (`expires_on`) sin desfase de huso', () => {
    expect(formatDateKey('2026-11-12')).toBe('12 nov 2026')
    expect(formatDateKey(null)).toBe('—')
  })

  it('suma meses calendario con ajuste a fin de mes en Lima', () => {
    // 31 ene 2026 20:00 Lima → 28 feb 2026 20:00 Lima
    const jan31 = limaDateTimeToIso('2026-01-31', '20:00')
    expect(addMonthsInLima(jan31, 1)).toBe('2026-03-01T01:00:00.000Z')
    expect(formatDate(addMonthsInLima(jan31, 1))).toBe('28 feb 2026')
  })
})
