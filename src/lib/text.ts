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

/** Mensaje de WhatsApp con el número peruano en formato internacional. */
export function whatsappUrl(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, '')
  const international = digits.length === 9 ? `51${digits}` : digits
  const suffix = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${international}${suffix}`
}
