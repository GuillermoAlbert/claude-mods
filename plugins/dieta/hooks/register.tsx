import type { Register } from 'claude-code'

import { isTextRead, kb, mapText, readDenial, tokensK, trim } from './lib'

// Herramientas cuya salida no se recorta: Read ya se controla antes de leer
const NO_TRIM = new Set(['Read', 'Edit', 'Write', 'NotebookEdit'])

export const register: Register = (on, options) => {
  const maxBytes = Number(options.maxLecturaKB ?? 100) * 1024
  const maxChars = Number(options.maxSalida ?? 20000)
  const isStrict = String(options.modo ?? 'frenar') === 'frenar'

  // Lecturas ya frenadas una vez: si Claude insiste, se le deja
  const insisted = new Set<string>()

  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const isPartial = e.offset !== undefined || e.limit !== undefined || e.pages !== undefined
    if (isPartial || !isTextRead(e.file_path)) return next(e)

    let size = 0
    try {
      size = (await $.fs.stat(e.file_path)).size
    } catch {
      return next(e)
    }
    if (size <= maxBytes) return next(e)

    if (!isStrict) {
      $.ui.toast(`dieta: leyendo ${kb(size)} KB enteros (~${tokensK(size)}k tokens)`)
      return next(e)
    }
    if (insisted.has(e.file_path)) {
      insisted.delete(e.file_path)
      return next(e)
    }
    insisted.add(e.file_path)
    $.ui.toast(`dieta: frenada la lectura entera de ${kb(size)} KB`)
    return { deny: readDenial(e.file_path, size) }
  })

  on('session.append', async ($, e, next) => {
    if (e.door !== 'tool-result' || e.origin.kind !== 'tool' || NO_TRIM.has(e.origin.tool)) {
      return next(e)
    }
    let longest = 0
    const { blocks, changed } = mapText(e.message.content, text => {
      if (text.length <= maxChars) return null
      longest = Math.max(longest, text.length)
      return isStrict ? trim(text, maxChars) : null
    })
    if (longest > 0) {
      const k = Math.round(longest / 4 / 1000)
      $.ui.toast(
        isStrict
          ? `dieta: salida de ${e.origin.tool} recortada (~${k}k tokens)`
          : `dieta: salida enorme de ${e.origin.tool} (~${k}k tokens)`,
      )
    }
    return changed ? next({ ...e, message: { ...e.message, content: blocks } }) : next(e)
  })
}
