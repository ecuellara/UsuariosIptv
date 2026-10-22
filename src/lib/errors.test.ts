import { describe, expect, it } from 'vitest'
import { isAuthError, isNetworkError, toUserMessage } from '@/lib/errors'

describe('toUserMessage', () => {
  it('traduce por prefijo las RPC', () => {
    expect(toUserMessage({ message: 'NO_AUTORIZADO' })).toContain('permisos')
    expect(
      toUserMessage({ message: 'STOCK_INSUFICIENTE: disponible 0, solicitado 3' }),
    ).toBe('No hay tokens suficientes para esta operación.')
    expect(
      toUserMessage({ message: 'PAGO_EXCEDE_MONTO_ACORDADO: acordado 15.00' }),
    ).toBe('El cobro supera el importe acordado.')
  })

  it('traduce errores de Auth sin revelar si el correo existe', () => {
    const message = toUserMessage({
      code: 'invalid_credentials',
      message: 'Invalid login credentials',
    })
    expect(message).toBe('No pudimos iniciar sesión. Revisa tu correo y contraseña.')
    expect(toUserMessage({ code: 'email_not_confirmed', message: 'x' })).toBe(
      'Confirma tu correo antes de entrar.',
    )
  })

  it('traduce constraints conocidos', () => {
    expect(
      toUserMessage({
        code: '23505',
        message: 'duplicate key value violates unique constraint "iptv_accounts_external_username_active_ux"',
      }),
    ).toBe('Ya existe una cuenta activa con ese usuario externo.')
  })

  it('reconoce problemas de red', () => {
    expect(toUserMessage(new TypeError('Failed to fetch'))).toContain('Sin conexión')
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('nunca filtra el mensaje técnico desconocido', () => {
    const message = toUserMessage({
      message: 'relation "secret_table" does not exist',
    })
    expect(message).not.toContain('secret_table')
    expect(message).toBe('No se pudo completar la operación. Inténtalo de nuevo.')
  })

  it('detecta sesión expirada por código de PostgREST', () => {
    expect(isAuthError({ code: 'PGRST301', message: 'JWT expired' })).toBe(true)
    expect(isAuthError({ code: '23505', message: 'duplicate' })).toBe(false)
  })
})
