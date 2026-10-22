import { describe, expect, it } from 'vitest'
import {
  formatMoney,
  formatPhone,
  formatSignedInteger,
  formatTokens,
  movementTypeLabel,
  normalizePhone,
  paymentMethodLabel,
  relativeDays,
  statusLabel,
  toNumber,
} from '@/lib/format'
import { sanitizeSearch, truncate, whatsappUrl } from '@/lib/text'

describe('formatMoney', () => {
  it('usa el formato S/ con coma de miles y dos decimales', () => {
    expect(formatMoney(1485)).toBe('S/ 1,485.00')
    expect(formatMoney('15.5')).toBe('S/ 15.50')
    expect(formatMoney(0)).toBe('S/ 0.00')
  })

  it('marca los negativos con el signo menos tipográfico', () => {
    expect(formatMoney(-40)).toBe('−S/ 40.00')
  })

  it('antepone el signo cuando se pide explícitamente', () => {
    expect(formatMoney(15, { sign: 'always' })).toBe('+S/ 15.00')
  })

  it('no inventa un cero cuando falta el dato', () => {
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney(undefined)).toBe('—')
    expect(formatMoney('no-es-un-numero')).toBe('—')
  })
})

describe('teléfono', () => {
  it('normaliza lo que se pega al formato del modelo', () => {
    expect(normalizePhone('+51 987 654 321')).toBe('987654321')
    expect(normalizePhone('51987654321')).toBe('987654321')
    expect(normalizePhone('987-654-321')).toBe('987654321')
    expect(normalizePhone('987 654 321')).toBe('987654321')
  })

  it('formatea 9 dígitos en grupos de 3', () => {
    expect(formatPhone('987654321')).toBe('987 654 321')
    expect(formatPhone(null)).toBe('—')
  })

  it('arma el enlace de WhatsApp con el código de Perú', () => {
    expect(whatsappUrl('987654321')).toBe('https://wa.me/51987654321')
    expect(whatsappUrl('987654321', 'Hola')).toContain('text=Hola')
  })
})

describe('presentación de datos', () => {
  it('traduce los estados de la vista', () => {
    expect(statusLabel('URGENTE')).toBe('Urgente')
    expect(statusLabel('VENCIDA')).toBe('Vencida')
    expect(statusLabel(null)).toBe('Sin estado')
  })

  it('usa días de SQL para el texto relativo', () => {
    expect(relativeDays(0)).toBe('hoy')
    expect(relativeDays(1)).toBe('mañana')
    expect(relativeDays(3)).toBe('en 3 días')
    expect(relativeDays(-2)).toBe('hace 2 días')
    expect(relativeDays(null)).toBe('—')
  })

  it('concuerda singular y plural de tokens', () => {
    expect(formatTokens(1)).toBe('1 token')
    expect(formatTokens(14)).toBe('14 tokens')
  })

  it('firma las cantidades del libro de tokens', () => {
    expect(formatSignedInteger(10)).toBe('+10')
    expect(formatSignedInteger(-3)).toBe('−3')
    expect(formatSignedInteger(null)).toBe('—')
  })

  it('traduce métodos de pago y tipos de movimiento', () => {
    expect(paymentMethodLabel('YAPE')).toBe('Yape')
    expect(paymentMethodLabel('TRANSFERENCIA')).toBe('Transferencia')
    expect(movementTypeLabel('REVERSION')).toBe('Reversión')
    expect(movementTypeLabel(null)).toBe('—')
  })

  it('convierte numeric de Postgres sin romper el valor', () => {
    expect(toNumber('15.50')).toBe(15.5)
    expect(toNumber(null)).toBeNull()
  })
})

describe('texto', () => {
  it('sanea los metacaracteres del filtro PostgREST', () => {
    expect(sanitizeSearch('  perez, juan (iptv)  ')).toBe('perez juan iptv')
    expect(sanitizeSearch('100%')).toBe('100')
  })

  it('recorta sin partir la palabra de forma agresiva', () => {
    expect(truncate('gestor personal', 8)).toBe('gestor …')
    expect(truncate(null, 8)).toBe('')
  })
})
