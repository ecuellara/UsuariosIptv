import { describe, expect, it } from 'vitest'
import { csvEscape, csvFilename, toCsv } from '@/lib/csv'

describe('CSV de Finanzas', () => {
  it('usa punto y coma como delimitador y BOM por defecto', () => {
    const csv = toCsv([
      ['Concepto', 'Valor'],
      ['Cobrado', 'S/ 75.00'],
    ])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toBe('\uFEFFConcepto;Valor\r\nCobrado;S/ 75.00')
  })

  it('permite desactivar el BOM para pruebas o consumidores externos', () => {
    expect(toCsv([['a', 'b']], { bom: false })).toBe('a;b')
  })

  it('escapa comillas, delimitador y saltos de línea', () => {
    expect(csvEscape('S/ 1,485.00')).toBe('S/ 1,485.00')
    expect(csvEscape('hosting; anual')).toBe('"hosting; anual"')
    expect(csvEscape('dijo "hola"')).toBe('"dijo ""hola"""')
    expect(csvEscape('linea1\nlinea2')).toBe('"linea1\nlinea2"')
  })

  it('escribe celdas vacías para null/undefined', () => {
    expect(csvEscape(null)).toBe('')
    expect(csvEscape(undefined)).toBe('')
    expect(toCsv([['Referencia', null]], { bom: false })).toBe('Referencia;')
  })

  it('neutraliza fórmulas al abrir el CSV en Excel', () => {
    expect(csvEscape('=1+1')).toBe("'=1+1")
    expect(csvEscape('+SUM(A1:A9)')).toBe("'+SUM(A1:A9)")
    expect(csvEscape('@cmd')).toBe("'@cmd")
    expect(csvEscape('=HYPERLINK("http://x","y")')).toContain("'=")
    // Un número negativo legítimo no se toca.
    expect(csvEscape('-15.50')).toBe('-15.50')
    expect(csvEscape(-15.5)).toBe('-15.5')
    // Un texto que empieza por guion pero no es número sí se neutraliza.
    expect(csvEscape('-2+3')).toBe("'-2+3")
  })

  it('nombra el archivo con el mes visible', () => {
    expect(csvFilename('finanzas-gastos', '2026-10')).toBe('finanzas-gastos-2026-10.csv')
  })
})
