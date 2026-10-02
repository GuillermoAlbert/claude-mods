import { expect, test } from 'claude-code/testing'

const capture = (on: any, seen: (string | undefined)[]) =>
  on('tool.call', { tool: 'Agent' }, (_$: unknown, e: { model?: string }) => {
    seen.push(e.model)
    return { result: { status: 'completed', content: [] } }
  })

test('Sonnet por defecto, respetando lo que elige Claude y los tipos con modelo propio', async ($, on) => {
  const seen: (string | undefined)[] = []
  capture(on, seen)
  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p' })
  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type: 'general-purpose' })
  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', model: 'opus' })
  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type: 'Explore' })
  expect(seen).toEqual(['sonnet', 'sonnet', 'opus', undefined])
})

test('el modelo por defecto se puede cambiar', { options: { modelo: 'haiku' } }, async ($, on) => {
  const seen: (string | undefined)[] = []
  capture(on, seen)
  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p' })
  expect(seen).toEqual(['haiku'])
})
