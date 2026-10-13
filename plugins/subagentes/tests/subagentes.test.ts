import { expect, test } from 'claude-code/testing'

const capture = (on: any, seen: (string | undefined)[]) =>
  on('tool.call', { tool: 'Agent' }, (_$: unknown, e: { model?: string }) => {
    seen.push(e.model)
    return { result: { status: 'completed', content: [] } }
  })

test('rechaza el subagente sin modelo y recuerda el reparto', async ($, on) => {
  const seen: (string | undefined)[] = []
  capture(on, seen)
  const sinModelo = await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p' })
  const explore = await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type: 'Explore' })
  expect(sinModelo.deny).toContain('falta el campo `model`')
  expect(sinModelo.deny).toContain('`haiku`')
  expect(explore.deny).toContain('falta el campo `model`')
  expect(seen).toEqual([])
})

test('deja pasar el modelo elegido y los fork', async ($, on) => {
  const seen: (string | undefined)[] = []
  capture(on, seen)
  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', model: 'haiku' })
  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type: 'Explore', model: 'opus' })
  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type: 'fork' })
  expect(seen).toEqual(['haiku', 'opus', undefined])
})

test('sin exigir: Sonnet por defecto, respetando los tipos con modelo propio', { options: { exigir: false } }, async ($, on) => {
  const seen: (string | undefined)[] = []
  capture(on, seen)
  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p' })
  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type: 'general-purpose' })
  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', model: 'opus' })
  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type: 'Explore' })
  expect(seen).toEqual(['sonnet', 'sonnet', 'opus', undefined])
})

test('sin exigir, el modelo por defecto se puede cambiar', { options: { exigir: false, modelo: 'haiku' } }, async ($, on) => {
  const seen: (string | undefined)[] = []
  capture(on, seen)
  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p' })
  expect(seen).toEqual(['haiku'])
})

const BASE = { sections: [{ id: 'base', text: 'x', scope: 'shared' as const }] }
const compose = ($: any, tools: string[]) =>
  $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, traits: [], tools } as never)

test('añade la regla al prompt de la sesión que lanza subagentes', async ($, on) => {
  on('prompt.compose', () => BASE)
  const main = await compose($, ['Agent', 'Bash'])
  expect(main.sections.map((s: { id: string }) => s.id)).toEqual(['base', 'subagentes:modelos'])
  expect(main.sections[1].text).toContain('indica SIEMPRE el modelo')
  expect(main.sections[1].text).toContain('`haiku`')
  const sub = await compose($, ['Bash'])
  expect(sub.sections.map((s: { id: string }) => s.id)).toEqual(['base'])
})

test('sin exigir, la regla no promete el rechazo', { options: { exigir: false } }, async ($, on) => {
  on('prompt.compose', () => BASE)
  const main = await compose($, ['Agent'])
  expect(main.sections[1].text).toContain('se usará el modelo por defecto')
})

test('la regla se puede desactivar', { options: { instrucciones: false } }, async ($, on) => {
  on('prompt.compose', () => BASE)
  const main = await compose($, ['Agent'])
  expect(main.sections.map((s: { id: string }) => s.id)).toEqual(['base'])
})
