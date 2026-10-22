/* Traducción de errores de Supabase/PostgREST a mensajes en español.
   Regla: el usuario nunca ve el mensaje técnico ni el SQLSTATE. Se mapea por
   código y por prefijo estable (docs/05-sql.md §4.4), nunca por texto completo. */

export type AppErrorCode =
  | 'CONFIG'
  | 'AUTH'
  | 'FORBIDDEN'
  | 'NETWORK'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'DATA'
  | 'UNKNOWN'

export class AppError extends Error {
  readonly code: AppErrorCode

  constructor(message: string, code: AppErrorCode = 'UNKNOWN', cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'AppError'
    this.code = code
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

interface ErrorLike {
  message: string
  code: string
  status: number | null
  name: string
}

/** Lee un error sin `any`: Supabase devuelve PostgrestError / AuthError con
 *  esos cuatro campos, pero no comparten una interfaz pública común. */
export function asErrorLike(error: unknown): ErrorLike | null {
  if (typeof error !== 'object' || error === null) return null
  const record = error as Record<string, unknown>
  return {
    message: typeof record.message === 'string' ? record.message : '',
    code: typeof record.code === 'string' ? record.code : '',
    status: typeof record.status === 'number' ? record.status : null,
    name: typeof record.name === 'string' ? record.name : '',
  }
}

/** Mensajes de las RPC, por prefijo (docs/05-sql.md §4.4). */
const RPC_MESSAGES: ReadonlyArray<readonly [prefix: string, message: string]> = [
  ['NO_AUTORIZADO', 'Tu sesión no tiene permisos de administrador.'],
  ['STOCK_INSUFICIENTE', 'No hay tokens suficientes para esta operación.'],
  ['PAGO_EXCEDE_MONTO_ACORDADO', 'El cobro supera el importe acordado.'],
  ['CUENTA_ARCHIVADA', 'La cuenta está archivada: no se puede renovar.'],
  ['RENOVACION_REVERTIDA', 'La renovación fue revertida: no admite cobros.'],
  ['CUENTA_NO_ENCONTRADA', 'No encontramos la cuenta.'],
  ['PLAN_NO_ENCONTRADO', 'No encontramos el plan.'],
  ['RENOVACION_NO_ENCONTRADA', 'No encontramos la renovación.'],
  ['MONTO_INVALIDO', 'El importe no es válido.'],
  ['COSTO_INVALIDO', 'El costo no es válido.'],
  ['TOKENS_INVALIDOS', 'La cantidad de tokens no es válida.'],
  ['CANTIDAD_INVALIDA', 'La cantidad no es válida.'],
  ['DELTA_INVALIDO', 'El ajuste de tokens no es válido.'],
  ['MOTIVO_REQUERIDO', 'Escribe el motivo de la operación.'],
  ['FECHAS_REQUERIDAS', 'Faltan las fechas de la operación.'],
  ['FECHA_REQUERIDA', 'Falta la fecha.'],
  ['FECHA_PAGO_REQUERIDA', 'Falta la fecha del cobro.'],
  ['FECHA_COMPRA_REQUERIDA', 'Falta la fecha de la compra.'],
  [
    'FECHA_VENCIMIENTO_INVALIDA',
    'El vencimiento debe ser posterior a la fecha de compra.',
  ],
  ['IDEMPOTENCY_KEY_REQUERIDA', 'La operación no se pudo identificar. Reintenta.'],
  ['STOCK_NO_INICIALIZADO', 'El inventario de tokens no está inicializado.'],
  ['METODO_REQUERIDO', 'Elige el método de pago.'],
  ['TIPO_OPERACION_REQUERIDO', 'Elige el tipo de operación.'],
]

/** Códigos de Supabase Auth. */
const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials:
    'No pudimos iniciar sesión. Revisa tu correo y contraseña.',
  email_not_confirmed: 'Confirma tu correo antes de entrar.',
  email_exists: 'Ese correo ya tiene una cuenta.',
  user_not_found:
    'No pudimos iniciar sesión. Revisa tu correo y contraseña.',
  weak_password: 'La contraseña no cumple los requisitos mínimos.',
  session_not_found: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  refresh_token_not_found: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  over_request_rate_limit: 'Demasiados intentos. Espera un momento.',
  over_email_send_rate_limit: 'Demasiados intentos. Espera un momento.',
  same_password: 'La contraseña nueva debe ser distinta de la actual.',
  /* MFA (TOTP). */
  mfa_verification_failed:
    'Código incorrecto. Revisa el código de tu aplicación e inténtalo de nuevo.',
  invalid_totp:
    'Código incorrecto. Revisa el código de tu aplicación e inténtalo de nuevo.',
  mfa_challenge_expired: 'El código expiró. Vuelve a intentarlo.',
  mfa_factor_not_found: 'No encontramos el segundo factor de esta cuenta.',
  mfa_factor_name_conflict: 'Ya existe un factor con ese nombre.',
  too_many_enrolled_mfa_factors:
    'La cuenta ya tiene el máximo de factores de autenticación.',
  mfa_totp_enroll_not_enabled:
    'La verificación en dos pasos (TOTP) no está habilitada en Supabase Auth.',
  mfa_totp_verify_not_enabled:
    'La verificación de códigos TOTP no está habilitada en Supabase Auth.',
  insufficient_aal:
    'Necesitas verificar tu segundo factor para continuar.',
  reauthentication_needed: 'Vuelve a iniciar sesión para continuar.',
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  iptv_accounts_external_username_active_ux:
    'Ya existe una cuenta activa con ese usuario externo.',
  plans_key_key: 'Ya existe un plan con esa clave.',
  customers_phone_check: 'El teléfono debe tener entre 9 y 15 dígitos.',
  iptv_accounts_expira_despues_de_compra_chk:
    'El vencimiento debe ser posterior a la fecha de compra.',
  app_settings_umbrales_chk:
    'Los días de urgencia deben ser menores que los de aviso.',
  plans_devices_check: 'Los dispositivos permitidos son 1 o 3.',
  whatsapp_templates_sin_password_chk:
    'La plantilla no puede contener {password}: el panel nunca guarda ni envía contraseñas.',
}

function matchPrefix(message: string): string | null {
  for (const [prefix, text] of RPC_MESSAGES) {
    if (message.startsWith(prefix)) return text
  }
  return null
}

function matchConstraint(message: string): string | null {
  for (const [constraint, text] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (message.includes(constraint)) return text
  }
  return null
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  const detail = asErrorLike(error)
  const message = detail?.message ?? (error instanceof Error ? error.message : '')
  return /failed to fetch|networkerror|network request failed|fetch failed|load failed/i.test(
    message,
  )
}

export function isAuthError(error: unknown): boolean {
  const detail = asErrorLike(error)
  if (!detail) return false
  if (detail.status === 401) return true
  if (
    ['PGRST301', 'PGRST302', 'PGRST303', 'refresh_token_not_found', 'session_not_found'].includes(
      detail.code,
    )
  ) {
    return true
  }
  return /jwt expired|invalid jwt|invalid refresh token/i.test(detail.message)
}

export function isPermissionError(error: unknown): boolean {
  const detail = asErrorLike(error)
  if (!detail) return false
  return (
    detail.code === '42501' ||
    detail.status === 403 ||
    detail.message.startsWith('NO_AUTORIZADO')
  )
}

/**
 * Mensaje seguro para la UI. Nunca incluye detalles internos.
 */
export function toUserMessage(
  error: unknown,
  fallback = 'No se pudo completar la operación. Inténtalo de nuevo.',
): string {
  if (isAppError(error)) return error.message
  if (isNetworkError(error)) {
    return 'Sin conexión. Revisa tu red e inténtalo de nuevo.'
  }

  const detail = asErrorLike(error)
  if (!detail) return fallback

  const rpc = matchPrefix(detail.message)
  if (rpc) return rpc

  const auth = AUTH_MESSAGES[detail.code]
  if (auth) return auth

  if (detail.message.startsWith('NO_AUTORIZADO')) {
    return 'Tu sesión no tiene permisos de administrador.'
  }

  const constraint = matchConstraint(detail.message)
  if (constraint) return constraint

  if (detail.code === '23505') {
    return 'Ya existe un registro con esos datos.'
  }
  if (detail.code === '23514') {
    return 'Los datos no cumplen las reglas del sistema. Revisa los valores.'
  }
  if (detail.code === '23503') {
    return 'El registro está en uso y no se puede modificar así.'
  }
  if (detail.code === '22P02' || detail.code === '22007') {
    return 'Alguno de los valores tiene un formato inválido.'
  }
  if (detail.code === '42501' || detail.status === 403) {
    return 'Tu sesión no tiene permisos para esta acción.'
  }
  if (isAuthError(error)) {
    return 'Tu sesión expiró. Vuelve a iniciar sesión.'
  }
  if (detail.code === 'PGRST116') {
    return 'No encontramos el registro solicitado.'
  }
  if (detail.status === 429) {
    return 'Demasiadas solicitudes. Espera unos segundos.'
  }
  if (detail.status !== null && detail.status >= 500) {
    return 'El servidor no respondió bien. Inténtalo de nuevo en unos segundos.'
  }

  return fallback
}

export function getTechnicalDetail(error: unknown): string {
  const detail = asErrorLike(error)
  if (detail) {
    return [detail.code, detail.message].filter(Boolean).join(' · ')
  }
  if (error instanceof Error) return error.message
  return ''
}
