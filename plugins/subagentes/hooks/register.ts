import type { Register } from 'claude-code'

type Model = 'sonnet' | 'haiku' | 'opus' | 'fable'

// Tipos genéricos: sin modelo propio en su definición
const GENERIC = new Set(['general-purpose', 'claude'])

// Un fork hereda el modelo de la sesión e ignora `model`
const FORK = 'fork'

const REPARTO =
  '- `sonnet` por defecto.\n' +
  '- `haiku` para lo fácil y mecánico, y para investigar o recopilar datos.\n' +
  '- `opus` para lo delicado: interfaz de usuario (UI/UX), seguridad, migraciones de datos, ' +
  'concurrencia, arquitectura y cambios difíciles de deshacer.\n' +
  '- `fable` solo para la revisión final de un plan; si falla porque no está disponible, ' +
  'repítela con `opus`.'

// Lo que lee Claude para elegir modelo; texto fijo para no romper la caché
export const GUIDANCE_EXIGIR =
  '# Modelo de los subagentes\n' +
  'Al lanzar un subagente con la herramienta Agent, indica SIEMPRE el modelo en el campo `model` ' +
  '(sin él la llamada se rechaza; un `fork` no lo necesita):\n' +
  REPARTO

export const GUIDANCE_DEFECTO =
  '# Modelo de los subagentes\n' +
  'Al lanzar subagentes con la herramienta Agent, elige el modelo con el campo `model` ' +
  '(si no lo indicas, se usará el modelo por defecto):\n' +
  REPARTO

export const DENY =
  'subagentes: falta el campo `model`. Elige el modelo según el reparto y vuelve a lanzar el subagente:\n' +
  REPARTO

export const register: Register = (on, options) => {
  const model = String(options.modelo ?? 'sonnet') as Model
  const exigir = options.exigir !== false
  const withGuidance = options.instrucciones !== false

  on('tool.call', { tool: 'Agent' }, ($, e, next) => {
    if (e.model !== undefined || e.subagent_type === FORK) return next(e)
    if (exigir) return { deny: DENY }
    const isGeneric = e.subagent_type === undefined || GENERIC.has(e.subagent_type)
    return isGeneric ? next({ ...e, model }) : next(e)
  })

  // Añade la regla al prompt de sistema de la sesión principal (la que lanza subagentes)
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!withGuidance || !e.tools.includes('Agent')) return composed
    return {
      sections: [
        ...composed.sections,
        { id: 'subagentes:modelos', text: exigir ? GUIDANCE_EXIGIR : GUIDANCE_DEFECTO, scope: 'session' as const },
      ],
    }
  })
}
