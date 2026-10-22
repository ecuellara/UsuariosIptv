/* Generador CSV mínimo (sin dependencias). Se usa para exportar filas ya
   traídas de la base: no agrega ni recalcula importes. Delimitador `;` para
   que Excel en español no parta los importes con coma de miles. */

export type CsvValue = string | number | null | undefined

export interface CsvOptions {
  /** Delimitador entre columnas. Por defecto `;`. */
  delimiter?: string
  /** BOM UTF-8 para que Excel respete las tildes. */
  bom?: boolean
}

/* Un valor que empieza por estos caracteres puede ejecutarse como fórmula al
   abrir el CSV en Excel/LibreOffice (OWASP: CSV injection). Los números
   negativos legítimos (`-15.50`) se dejan intactos. */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/
const PLAIN_NUMBER = /^-?\d+([.,]\d+)?$/

function neutralizeFormula(text: string): string {
  if (!FORMULA_TRIGGER.test(text) || PLAIN_NUMBER.test(text)) return text
  return `'${text}`
}

export function csvEscape(value: CsvValue, delimiter = ';'): string {
  if (value === null || value === undefined) return ''
  const text = neutralizeFormula(String(value))
  if (
    text.includes('"') ||
    text.includes(delimiter) ||
    text.includes('\n') ||
    text.includes('\r')
  ) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function toCsv(
  rows: ReadonlyArray<ReadonlyArray<CsvValue>>,
  options: CsvOptions = {},
): string {
  const { delimiter = ';', bom = true } = options
  const body = rows
    .map((row) => row.map((value) => csvEscape(value, delimiter)).join(delimiter))
    .join('\r\n')
  return `${bom ? '\uFEFF' : ''}${body}`
}

/** Descarga el contenido como archivo. Solo se llama desde un clic del usuario. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** `finanzas-gastos-2026-10.csv` */
export function csvFilename(prefix: string, monthKey: string): string {
  return `${prefix}-${monthKey}.csv`
}
