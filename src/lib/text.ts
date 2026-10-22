import { buildWhatsAppUrl, normalizeWaPhone } from './whatsapp'

/** Utilidades de texto sin dependencias. */

/** Sanea un término de búsqueda antes de interpolarlo en un filtro PostgREST. */
export function sanitizeSearch(term: string): string {
  return term
    .trim()
    .replace(/[,()%*\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function initials(firstName: string, lastName: string): string {
  const first = firstName.trim().charAt(0)
  const last = lastName.trim().charAt(0)
  return `${first}${last}`.toUpperCase() || '?'
}

export function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim()
}

export function truncate(value: string | null | undefined, max: number): string {
  if (!value) return ''
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

/** Enlace de WhatsApp con el número normalizado. Sin mensaje, abre el chat. */
export function whatsappUrl(phone: string, message?: string): string {
  if (!message) return `https://wa.me/${normalizeWaPhone(phone)}`
  return buildWhatsAppUrl(phone, message)
}
