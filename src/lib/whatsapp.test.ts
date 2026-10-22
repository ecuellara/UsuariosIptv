import { describe, expect, it } from 'vitest'
import {
  buildTemplateValues,
  buildWhatsAppUrl,
  daysLeftLabel,
  normalizeWaPhone,
  renderTemplate,
  validateTemplateBody,
} from '@/lib/whatsapp'

/* Las plantillas se interpolan en el cliente solo para la vista previa y el
   enlace; lo persistido es el snapshot que envía el RPC. */

describe('días restantes', () => {
  it('usa el número de SQL cuando el vencimiento es futuro', () => {
    expect(daysLeftLabel(1)).toBe('1')
    expect(daysLeftLabel(7)).toBe('7')
  })

  it('no muestra un cero negativo cuando vence hoy', () => {
    expect(daysLeftLabel(0)).toBe('0')
  })

  it('convierte el pasado en texto y nunca deja números negativos', () => {
    expect(daysLeftLabel(-1)).toBe('vencido hace 1 día')
    expect(daysLeftLabel(-12)).toBe('vencido hace 12 días')
    expect(daysLeftLabel(-3)).not.toContain('-')
  })
})

describe('normalización del teléfono para wa.me', () => {
  it('antepone 51 a un móvil peruano de 9 dígitos que empieza por 9', () => {
    expect(normalizeWaPhone('987654321')).toBe('51987654321')
    expect(normalizeWaPhone('987 654 321')).toBe('51987654321')
  })

  it('respeta un número que ya trae 51', () => {
    expect(normalizeWaPhone('51987654321')).toBe('51987654321')
    expect(normalizeWaPhone('+51 987 654 321')).toBe('51987654321')
  })

  it('no inventa prefijo para números que no son móviles peruanos', () => {
    expect(normalizeWaPhone('123456789')).toBe('123456789')
    expect(normalizeWaPhone('5198765432')).toBe('5198765432')
  })
})

describe('enlace de WhatsApp', () => {
  it('codifica saltos de línea y caracteres especiales del mensaje', () => {
    const url = buildWhatsAppUrl(
      '987654321',
      'Hola María & Juan:\n¿renovamos? #plan 100% + S/ 15',
    )

    expect(url.startsWith('https://wa.me/51987654321?text=')).toBe(true)
    const encoded = url.slice('https://wa.me/51987654321?text='.length)
    expect(encoded).toContain('%0A')
    expect(encoded).toContain('%26')
    expect(encoded).toContain('%3F')
    expect(encoded).toContain('%23')
    expect(encoded).toContain('%25')
    expect(encoded).toContain('%2B')
    expect(encoded).toContain('%2F')
    expect(encoded).not.toContain('\n')
    expect(decodeURIComponent(encoded)).toBe(
      'Hola María & Juan:\n¿renovamos? #plan 100% + S/ 15',
    )
  })
})

describe('interpolación de plantillas', () => {
  const values = buildTemplateValues({
    firstName: 'María',
    lastName: 'Quispe',
    username: 'maria.iptv',
    plan: '3 meses / 3 dispositivos',
    expiresAt: '2026-11-15T03:00:00.000Z',
    daysLeft: 5,
  })

  it('reemplaza todas las variables permitidas', () => {
    const result = renderTemplate(
      '{nombre} {apellido} / {usuario} / {plan} / {fecha_vencimiento} / {dias_restantes}',
      values,
    )

    expect(result.unknown).toEqual([])
    // 2026-11-15 03:00 UTC es 14/11/2026 en America/Lima (UTC-5).
    expect(result.text).toBe(
      'María Quispe / maria.iptv / 3 meses / 3 dispositivos / 14/11/2026 / 5',
    )
  })

  it('usa «sin plan» cuando la cuenta no tiene renovaciones vigentes', () => {
    const result = renderTemplate('Plan: {plan}', { ...values, plan: 'sin plan' })
    expect(result.text).toBe('Plan: sin plan')
  })

  it('deja la variable desconocida tal cual y la informa', () => {
    const result = renderTemplate('Hola {nombre}, clave {password}', values)
    expect(result.text).toBe('Hola María, clave {password}')
    expect(result.unknown).toEqual(['password'])
  })

  it('no interpreta los dólares del texto de reemplazo como grupos de regex', () => {
    const result = renderTemplate('{nombre} paga S/ 15', {
      ...values,
      nombre: 'Ana $& $1',
    })
    expect(result.text).toBe('Ana $& $1 paga S/ 15')
  })
})

describe('validación del cuerpo de una plantilla', () => {
  it('acepta las variables permitidas', () => {
    expect(
      validateTemplateBody('Hola {nombre}, vence {fecha_vencimiento}.').error,
    ).toBeNull()
  })

  it('rechaza {password} con un mensaje explícito', () => {
    const result = validateTemplateBody('Hola {nombre}, clave {password}')
    expect(result.error).toContain('No se permite {password}')
    expect(result.unknown).toEqual(['password'])
  })

  it('rechaza variables desconocidas e indica cuáles son', () => {
    const result = validateTemplateBody('Hola {nombre}, saldo {saldo}')
    expect(result.error).toContain('{saldo}')
    expect(result.error).toContain('Variables no permitidas')
    expect(result.unknown).toEqual(['saldo'])
  })

  it('no permite guardar un cuerpo vacío', () => {
    expect(validateTemplateBody('   \n ').error).toBe(
      'El cuerpo de la plantilla no puede quedar vacío.',
    )
  })
})
