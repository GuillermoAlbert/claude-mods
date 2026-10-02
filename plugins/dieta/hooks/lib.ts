export type Block = { type: string; [field: string]: unknown }

// Archivos que Read no lee como texto: no se frenan
const BINARY = /\.(png|jpe?g|gif|webp|bmp|ico|svg|pdf|ipynb)$/i

export const isTextRead = (path: string): boolean => !BINARY.test(path)

export const kb = (bytes: number): number => Math.round(bytes / 1024)

// ~4 bytes por token en código y texto
export const tokensK = (bytes: number): number => Math.max(1, Math.round(bytes / 4 / 1000))

export const readDenial = (path: string, bytes: number): string =>
  `dieta: ${path} pesa ${kb(bytes)} KB (~${tokensK(bytes)}k tokens). ` +
  'Para no inflar el contexto, lee solo lo que necesites: busca primero con Grep ' +
  'y luego usa Read con offset/limit (por ejemplo limit: 200). ' +
  'Si de verdad necesitas el archivo entero, vuelve a pedir la misma lectura y se permitirá.'

// Conserva el principio (70%) y el final (30%) del presupuesto
export const trim = (text: string, max: number): string | null => {
  if (text.length <= max) return null
  const head = Math.floor(max * 0.7)
  const tail = max - head
  const cut = text.length - head - tail
  const headPart = text.slice(0, head)
  const tailPart = text.slice(text.length - tail)
  return (
    `${headPart}\n\n[dieta: ${cut.toLocaleString('es-ES')} caracteres omitidos de ${text.length.toLocaleString('es-ES')}. ` +
    'Si necesitas esa parte, repite el comando filtrando con grep, head, tail o sed -n.]\n\n' +
    tailPart
  )
}

// Aplica fn a todo el texto de una fila: bloques de texto y resultados de herramientas
export const mapText = (
  blocks: readonly Block[],
  fn: (text: string) => string | null,
): { blocks: Block[]; changed: boolean } => {
  let changed = false
  const apply = (text: string) => {
    const out = fn(text)
    if (out === null || out === text) return text
    changed = true
    return out
  }
  const out = blocks.map(b => {
    if (b.type === 'text' && typeof b.text === 'string') return { ...b, text: apply(b.text) }
    if (b.type === 'tool_result') {
      if (typeof b.content === 'string') return { ...b, content: apply(b.content) }
      if (Array.isArray(b.content)) {
        return {
          ...b,
          content: (b.content as Block[]).map(c =>
            c.type === 'text' && typeof c.text === 'string' ? { ...c, text: apply(c.text) } : c,
          ),
        }
      }
    }
    return b
  })
  return { blocks: out, changed }
}
