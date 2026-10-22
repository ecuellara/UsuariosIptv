import { formatLima } from './dates'

/* Plantillas de WhatsApp y construcción del enlace `wa.me`.
   La app NUNCA envía mensajes: solo prepara el texto, muestra la vista previa
   y abre el chat. Lo que se persiste es el snapshot que envía el RPC
   `rpc_update_followup` (docs/02 §2). */

export const TEMPLATE_VARIABLES = [
  'nombre',
  'apellido',
  'usuario',
  'plan',
  'fecha_vencimiento',
  'dias_restantes',
] as const

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number]

export type TemplateValues = Record<TemplateVariable, string>

export interface TemplateSample {
  firstName: string
  lastName: string
  username: string
  plan: string | null
  expiresAt: string
  /** Días que devuelve `v_account_status.days_left` (nunca se resta en el cliente). */
  daysLeft: number
}

const VARIABLE_PATTERN = /\{([^{}]+)\}/g

function isAllowedVariable(value: string): value is TemplateVariable {
  return (TEMPLATE_VARIABLES as readonly string[]).includes(value)
}

/**
 * Texto de `{dias_restantes}`:
 * - futuro → el número tal cual;
 * - hoy → `0` (la plantilla del seed lo usa como «te quedan 0 días»);
 * - pasado → «vencido hace N días», nunca un número negativo.
 */
export function daysLeftLabel(daysLeft: number): string {
  if (!Number.isFinite(daysLeft)) return '—'
  if (daysLeft > 0) return String(daysLeft)
  if (daysLeft === 0) return '0'
  const days = Math.abs(daysLeft)
  return `vencido hace ${days} ${days === 1 ? 'día' : 'días'}`
}

/** Variables de una cuenta para interpolar una plantilla. */
export function buildTemplateValues(sample: TemplateSample): TemplateValues {
  return {
    nombre: sample.firstName,
    apellido: sample.lastName,
    usuario: sample.username,
    plan: sample.plan?.trim() ? sample.plan.trim() : 'sin plan',
    fecha_vencimiento: formatLima(sample.expiresAt, 'dd/MM/yyyy'),
    dias_restantes: daysLeftLabel(sample.daysLeft),
  }
}

export interface RenderedTemplate {
  text: string
  /** Variables entre llaves que no están en la lista permitida. Se dejan tal cual. */
  unknown: string[]
}

/** Interpola solo variables conocidas; una desconocida se conserva y se avisa. */
export function renderTemplate(body: string, values: TemplateValues): RenderedTemplate {
  const unknown = new Set<string>()
  const text = body.replace(VARIABLE_PATTERN, (match, raw: string) => {
    const key = raw.trim()
    if (isAllowedVariable(key)) return values[key]
    unknown.add(key)
    return match
  })
  return { text, unknown: [...unknown] }
}

/** Variables escritas entre llaves, conocidas o no (sin duplicados). */
export function extractTemplateVariables(body: string): string[] {
  const found = new Set<string>()
  for (const match of body.matchAll(VARIABLE_PATTERN)) {
    const key = match[1]?.trim()
    if (key) found.add(key)
  }
  return [...found]
}

export function extractUnknownVariables(body: string): string[] {
  return extractTemplateVariables(body).filter((key) => !isAllowedVariable(key))
}

export interface TemplateValidation {
  error: string | null
  unknown: string[]
}

/**
 * Validación previa al guardado. La base también bloquea `{password}` con un
 * CHECK; aquí se da un mensaje claro antes de llegar a Postgres.
 */
export function validateTemplateBody(body: string): TemplateValidation {
  const unknown = extractUnknownVariables(body)
  if (body.trim().length === 0) {
    return { error: 'El cuerpo de la plantilla no puede quedar vacío.', unknown }
  }

  const blocked = unknown.filter((key) => key.toLowerCase() === 'password')
  if (blocked.length > 0) {
    return {
      error:
        'No se permite {password}: el panel nunca guarda ni envía contraseñas.',
      unknown,
    }
  }

  if (unknown.length > 0) {
    const list = unknown.map((key) => `{${key}}`).join(', ')
    return {
      error: `Variables no permitidas: ${list}. Usa solo ${TEMPLATE_VARIABLES.map((key) => `{${key}}`).join(', ')}.`,
      unknown,
    }
  }

  return { error: null, unknown: [] }
}

/**
 * Teléfono para `wa.me`: 9 dígitos que empiezan por 9 → antepone `51`;
 * 11 dígitos que ya empiezan por `51` → se usan tal cual. El resto se deja
 * como venga (solo dígitos).
 */
export function normalizeWaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('51')) return digits
  if (digits.length === 9 && digits.startsWith('9')) return `51${digits}`
  return digits
}

/** Enlace para mostrar/abrir WhatsApp. El texto se codifica completo. */
export function buildWhatsAppUrl(phone: string, message: string): string {
  return `https://wa.me/${normalizeWaPhone(phone)}?text=${encodeURIComponent(message)}`
}
