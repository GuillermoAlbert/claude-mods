import type { Register } from 'claude-code'

type Model = 'sonnet' | 'haiku' | 'opus' | 'fable'

// Tipos genéricos: sin modelo propio en su definición
const GENERIC = new Set(['general-purpose', 'claude'])

// Lo que lee Claude para elegir modelo; texto fijo para no romper la caché
export const GUIDANCE =
  '# Modelo de los subagentes\n' +
  'Al lanzar subagentes con la herramienta Agent, elige el modelo con el campo `model`:\n' +
  '- Por defecto, `sonnet` (si no lo indicas, se usará sonnet).\n' +
  '- `opus` para interfaz de usuario (UI/UX), seguridad, migraciones de datos, concurrencia, ' +
  'arquitectura y cambios difíciles de deshacer.\n' +
  '- La revisión final de un plan largo, con `fable`; si falla porque no está disponible, ' +
  'repítela con `opus`.'

export const register: Register = (on, options) => {
  const model = String(options.modelo ?? 'sonnet') as Model
  const withGuidance = options.instrucciones !== false

  on('tool.call', { tool: 'Agent' }, ($, e, next) => {
    const isGeneric = e.subagent_type === undefined || GENERIC.has(e.subagent_type)
    if (e.model !== undefined || !isGeneric) return next(e)
    return next({ ...e, model })
  })

  // Añade la regla al prompt de sistema de la sesión principal (la que lanza subagentes)
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!withGuidance || !e.tools.includes('Agent')) return composed
    return {
      sections: [
        ...composed.sections,
        { id: 'subagentes:modelos', text: GUIDANCE, scope: 'session' as const },
      ],
    }
  })
}
