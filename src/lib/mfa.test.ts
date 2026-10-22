import { describe, expect, it } from 'vitest'
import {
  assessPassword,
  hasPasswordChangeErrors,
  isOtpComplete,
  mfaErrorMessage,
  normalizeOtpCode,
  qrCodeDataUrl,
  requiresMfaChallenge,
  validatePasswordChange,
} from '@/lib/mfa'

describe('normalizeOtpCode', () => {
  it('deja solo dígitos y corta a 6', () => {
    expect(normalizeOtpCode('123 456')).toBe('123456')
    expect(normalizeOtpCode('123-456')).toBe('123456')
    expect(normalizeOtpCode(' 12\n34 56 ')).toBe('123456')
    expect(normalizeOtpCode('12a34b56')).toBe('123456')
    expect(normalizeOtpCode('123456789')).toBe('123456')
    expect(normalizeOtpCode('')).toBe('')
  })

  it('solo considera completo un código de 6 dígitos', () => {
    expect(isOtpComplete('123 456')).toBe(true)
    expect(isOtpComplete('12345')).toBe(false)
    expect(isOtpComplete('1234567')).toBe(true)
    expect(isOtpComplete('abcdef')).toBe(false)
  })
})

describe('requiresMfaChallenge', () => {
  it('pide desafío cuando hay factores verificados y la sesión es aal1', () => {
    expect(requiresMfaChallenge('aal1', 'aal2')).toBe(true)
  })

  it('no pide desafío si ya está en aal2 o no tiene factores', () => {
    expect(requiresMfaChallenge('aal2', 'aal2')).toBe(false)
    expect(requiresMfaChallenge('aal1', 'aal1')).toBe(false)
    expect(requiresMfaChallenge(null, null)).toBe(false)
  })
})

describe('qrCodeDataUrl', () => {
  it('codifica el SVG para usarlo como imagen, sin inyectar markup', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000"/></svg>'
    const url = qrCodeDataUrl(svg)
    expect(url.startsWith('data:image/svg+xml;utf8,')).toBe(true)
    expect(url).not.toContain('<svg')
    expect(url).toContain('%23')
    expect(decodeURIComponent(url.split(',')[1] ?? '')).toBe(svg)
  })
})

describe('assessPassword', () => {
  it('marca vacío y contraseñas cortas', () => {
    expect(assessPassword('').score).toBe(0)
    expect(assessPassword('corta').score).toBe(1)
    expect(assessPassword('corta').meetsMinimum).toBe(false)
  })

  it('cumple el mínimo con 12 caracteres y sube con variedad', () => {
    const weak = assessPassword('aaaaaaaaaaaa')
    expect(weak.meetsMinimum).toBe(true)
    expect(weak.score).toBe(2)
    expect(weak.label).toBe('Débil')

    const fair = assessPassword('FraseLarga2026')
    expect(fair.score).toBe(3)
    expect(fair.label).toBe('Aceptable')

    const strong = assessPassword('Frase-Larga-2026!')
    expect(strong.score).toBe(4)
    expect(strong.label).toBe('Fuerte')
    expect(strong.percent).toBe(100)
  })
})

describe('validatePasswordChange', () => {
  const valid = { current: 'vieja-clave-2026', next: 'nueva-clave-2026', confirm: 'nueva-clave-2026' }

  it('acepta tres campos válidos', () => {
    expect(validatePasswordChange(valid)).toEqual({})
    expect(hasPasswordChangeErrors(validatePasswordChange(valid))).toBe(false)
  })

  it('señala cada campo', () => {
    const empty = validatePasswordChange({ current: '', next: '', confirm: '' })
    expect(empty.current).toContain('actual')
    expect(empty.next).toContain('nueva')
    expect(empty.confirm).toContain('Repite')

    const short = validatePasswordChange({ current: 'x', next: '12345678901', confirm: '12345678901' })
    expect(short.next).toContain('12 caracteres')

    const same = validatePasswordChange({ current: 'misma-clave-2026', next: 'misma-clave-2026', confirm: 'misma-clave-2026' })
    expect(same.next).toContain('distinta')

    const mismatch = validatePasswordChange({ ...valid, confirm: 'otra-clave-2026' })
    expect(mismatch.confirm).toBe('Las contraseñas no coinciden.')
    expect(hasPasswordChangeErrors(mismatch)).toBe(true)
  })
})

describe('mfaErrorMessage', () => {
  it('traduce código inválido sin mostrar el mensaje técnico', () => {
    const message = mfaErrorMessage({
      code: 'mfa_verification_failed',
      message: 'Invalid TOTP code entered',
      status: 422,
    })
    expect(message).toContain('Código incorrecto')
    expect(message).not.toContain('TOTP')
  })

  it('anuncia el límite de intentos cuando el servidor responde 429', () => {
    expect(
      mfaErrorMessage({ code: 'over_request_rate_limit', message: 'x', status: 429 }),
    ).toBe('Demasiados intentos. Espera un minuto y vuelve a probar.')
  })

  it('usa el fallback con errores desconocidos', () => {
    expect(mfaErrorMessage(new Error('boom'))).toContain('No pudimos verificar')
  })
})
