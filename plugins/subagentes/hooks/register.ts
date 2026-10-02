import type { Register } from 'claude-code'

type Model = 'sonnet' | 'haiku' | 'opus' | 'fable'

// Tipos genéricos: sin modelo propio en su definición
const GENERIC = new Set(['general-purpose', 'claude'])

export const register: Register = (on, options) => {
  const model = String(options.modelo ?? 'sonnet') as Model

  on('tool.call', { tool: 'Agent' }, ($, e, next) => {
    const isGeneric = e.subagent_type === undefined || GENERIC.has(e.subagent_type)
    if (e.model !== undefined || !isGeneric) return next(e)
    return next({ ...e, model })
  })
}
