/* Lógica pura de MFA (TOTP) y cambio de contraseña.
   Sin llamadas a red: se prueba con Vitest y la usan la pantalla de login,
   la sección Seguridad y el store de sesión. */

import { asErrorLike, toUserMessage } from '@/lib/errors'

/** Niveles de garantía que emite Supabase Auth (`aal` del JWT). */
export type AalLevel = 'aal1' | 'aal2'

export const OTP_LENGTH = 6
export const PASSWORD_MIN_LENGTH = 12

/**
 * Deja solo los dígitos del código y corta a 6.
 * Acepta lo que pega el usuario desde la app autenticadora ("123 456",
 * "123-456", "123\n456") y nunca deja pasar letras al servidor.
 */
export function normalizeOtpCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, OTP_LENGTH)
}

export function isOtpComplete(value: string): boolean {
  return normalizeOtpCode(value).length === OTP_LENGTH
}

/**
 * ¿La sesión actual (aal1) debe pasar por el desafío TOTP?
 *
 * `nextLevel` lo calcula supabase-js con los factores **verificados** del
 * usuario. Un factor a medio enrolar no cuenta. Si el usuario no tiene
 * factores, `nextLevel` es aal1 y el login sigue igual que antes.
 */
export function requiresMfaChallenge(
  currentLevel: AalLevel | string | null,
  nextLevel: AalLevel | string | null,
): boolean {
  return nextLevel === 'aal2' && currentLevel !== 'aal2'
}

/**
 * El `qr_code` de Supabase es el markup SVG del QR. Se muestra como imagen
 * (data URL) en lugar de inyectarlo con `v-html`, para no abrir un sink HTML.
 */
export function qrCodeDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export type PasswordStrength = 'empty' | 'very-weak' | 'weak' | 'fair' | 'strong'

export interface PasswordAssessment {
  length: number
  /** Cumple el mínimo de 12 caracteres que exige la UI. */
  meetsMinimum: boolean
  /** Cantidad de clases de caracteres presentes (minúscula, mayúscula, dígito, símbolo). */
  classes: number
  score: 0 | 1 | 2 | 3 | 4
  strength: PasswordStrength
  label: string
  percent: number
}

/** Fortaleza solo informativa: el requisito duro es la longitud mínima. */
export function assessPassword(password: string): PasswordAssessment {
  const length = password.length
  if (length === 0) {
    return {
      length,
      meetsMinimum: false,
      classes: 0,
      score: 0,
      strength: 'empty',
      label: 'Sin contraseña',
      percent: 0,
    }
  }

  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length

  const meetsMinimum = length >= PASSWORD_MIN_LENGTH

  let score: PasswordAssessment['score'] = 1
  if (meetsMinimum) score = 2
  if (meetsMinimum && classes >= 2) score = 3
  if (length >= 16 && classes >= 3) score = 4

  const labels: Record<PasswordAssessment['score'], string> = {
    0: 'Sin contraseña',
    1: 'Muy débil',
    2: 'Débil',
    3: 'Aceptable',
    4: 'Fuerte',
  }
  const strengths: Record<PasswordAssessment['score'], PasswordStrength> = {
    0: 'empty',
    1: 'very-weak',
    2: 'weak',
    3: 'fair',
    4: 'strong',
  }
  const percents: Record<PasswordAssessment['score'], number> = {
    0: 0,
    1: 25,
    2: 50,
    3: 75,
    4: 100,
  }

  return {
    length,
    meetsMinimum,
    classes,
    score,
    strength: strengths[score],
    label: labels[score],
    percent: percents[score],
  }
}

export interface PasswordChangeFields {
  current: string
  next: string
  confirm: string
}

export interface PasswordChangeErrors {
  current?: string
  next?: string
  confirm?: string
  /** Error del servidor que no pertenece a un campo concreto. */
  form?: string
}

/**
 * Validación por campo del cambio de contraseña. Devuelve un objeto vacío si
 * los tres campos son válidos. El servidor sigue siendo la autoridad final
 * (política de Auth, `same_password`, etc.).
 */
export function validatePasswordChange(
  fields: PasswordChangeFields,
): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {}

  if (fields.current.length === 0) {
    errors.current = 'Escribe tu contraseña actual.'
  }

  if (fields.next.length === 0) {
    errors.next = 'Escribe la contraseña nueva.'
  } else if (fields.next.length < PASSWORD_MIN_LENGTH) {
    errors.next = `La contraseña nueva debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`
  } else if (fields.next === fields.current) {
    errors.next = 'La contraseña nueva debe ser distinta de la actual.'
  }

  if (fields.confirm.length === 0) {
    errors.confirm = 'Repite la contraseña nueva.'
  } else if (fields.next !== fields.confirm) {
    errors.confirm = 'Las contraseñas no coinciden.'
  }

  return errors
}

export function hasPasswordChangeErrors(errors: PasswordChangeErrors): boolean {
  return Object.values(errors).some((message) => typeof message === 'string')
}

/**
 * Mensaje de un fallo de MFA. El límite de intentos se anuncia cuando el
 * servidor lo devuelve (429): no se inventa un contador local.
 */
export function mfaErrorMessage(
  error: unknown,
  fallback = 'No pudimos verificar el código. Inténtalo de nuevo.',
): string {
  const detail = asErrorLike(error)
  if (detail?.status === 429 || detail?.code === 'over_request_rate_limit') {
    return 'Demasiados intentos. Espera un minuto y vuelve a probar.'
  }
  return toUserMessage(error, fallback)
}
