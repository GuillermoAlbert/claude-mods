import { describe, expect, mock, test } from 'claude-code/testing'

import type { ProgresoTask } from '../types'
import {
  agentsLabel,
  estimate,
  fromTodos,
  isLedgerPath,
  isPlanPath,
  ledgerItems,
  parseLedger,
  numbering,
  parsePlan,
  planTaskTitles,
  planToTasks,
  progress,
  range,
} from '../hooks/lib'

const MIN = 60_000

const BAND = {
  component: 'AbovePrompt' as const,
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 10,
    bodyColumns: 140,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
}

describe('lib', () => {
  test('lee la numeración de fases', () => {
    expect(numbering('4.2 Migrar entidades')).toEqual([4, 2])
    expect(numbering('Fase 3: tests')).toEqual([3])
    expect(numbering('2) Revisar')).toEqual([2])
    expect(numbering('Revisar 2 cosas')).toBe(null)
    expect(numbering('2026 planning')).toEqual([2026])
  })

  test('etiqueta por fases o por tareas', () => {
    const phased: ProgresoTask[] = [
      { id: '1', subject: '1 Preparar', status: 'completed' },
      { id: '2', subject: '2.1 Modelo', status: 'completed' },
      { id: '3', subject: '2.2 Servicio', status: 'in_progress' },
      { id: '4', subject: '3 Tests', status: 'pending' },
    ]
    const p = progress(phased)
    expect(p.label).toBe('Fase 2.2 / 3')
    expect(p.segments.map(s => s.boundary)).toEqual([false, true, false, true])

    const plain = progress([
      { id: '1', subject: 'Leer código', status: 'completed' },
      { id: '2', subject: 'Arreglar bug', status: 'in_progress' },
      { id: '3', subject: 'Probar', status: 'pending' },
    ])
    expect(plain.label).toBe('Tarea 2 / 3')
  })

  test('estima lo que falta con lo que tardaron las terminadas', () => {
    const list: ProgresoTask[] = [
      { id: '1', subject: 'a', status: 'completed', startedAt: 0, doneAt: 10 * MIN },
      { id: '2', subject: 'b', status: 'in_progress', startedAt: 10 * MIN },
      { id: '3', subject: 'c', status: 'pending' },
    ]
    const r = estimate(list, 12 * MIN)!
    // 1 pendiente (10) + lo que queda de la actual (8) = 18 min → 12.6–25.2
    expect(range(r)).toBe('13–25 min')
    expect(estimate([{ id: '1', subject: 'a', status: 'pending' }], 0)).toBe(null)
  })

  test('resume los subagentes por modelo', () => {
    expect(agentsLabel({})).toBe('')
    expect(agentsLabel({ a: 'claude-opus-5-5' })).toBe('1 subagente: Opus')
    expect(
      agentsLabel({ a: 'claude-sonnet-5-5', b: 'claude-sonnet-5-5', c: 'claude-fable-5-1' }),
    ).toBe('3 subagentes: 2 Sonnet, Fable')
  })

  test('lee planes en Markdown con casillas', () => {
    const md = [
      '# Plan',
      'Intro',
      '### Task 1: Modelo',
      '- [x] **Step 1: test**',
      '- [x] Step 2: implementar',
      '### Task 2: API',
      '- [ ] Step 1: endpoint',
      '- [ ] Step 2: `docs`',
    ].join('\n')
    const items = parsePlan(md)
    expect(items.map(i => `${i.phase}.${i.step}:${i.done}`)).toEqual(['1.1:true', '1.2:true', '2.1:false', '2.2:false'])
    expect(items[0]!.text).toBe('Step 1: test')
    const tasks = planToTasks(items, [], 1000)
    expect(progress(tasks).label).toBe('Fase 2.1 / 2')
    expect(tasks[0]!.startedAt).toBe(undefined) // ya marcada: no cuenta para estimar
    // se marca el 2.1 mientras lo seguimos: ahora sí cuenta
    const later = planToTasks(parsePlan(md.replace('- [ ] Step 1: endpoint', '- [x] Step 1: endpoint')), tasks, 61_000)
    expect(later[2]).toMatchObject({ status: 'completed', startedAt: 1000, doneAt: 61_000 })
    expect(later[3]!.status).toBe('in_progress')
    expect(isPlanPath('/r/docs/superpowers/plans/2026-10-01-bot.md')).toBe(true)
    expect(isPlanPath('/r/README.md')).toBe(false)
  })

  test('lee el registro de superpowers', () => {
    const ledger = '# SDD ledger — plan: docs/superpowers/plans/bot.md\nTask 1: complete (commits a1..b2, review clean)\nTask 2: fix round 1/5 (2 addressed, 1 open)\n'
    const l = parseLedger(ledger)
    expect(l.planPath).toBe('docs/superpowers/plans/bot.md')
    expect([...l.complete]).toEqual([1])
    const titles = planTaskTitles('# Plan\n### Task 1: Modelo\n- [ ] x\n### Task 2: API\n### Task 3: Docs\n')
    expect(titles).toEqual([
      { n: 1, title: 'Modelo' },
      { n: 2, title: 'API' },
      { n: 3, title: 'Docs' },
    ])
    const tasks = planToTasks(ledgerItems(titles, l.complete), [], 0)
    expect(progress(tasks).label).toBe('Tarea 2 / 3')
    expect(isLedgerPath('/r/.superpowers/sdd/bot/progress.md')).toBe(true)
  })

  test('TodoWrite conserva los tiempos de cada tarea', () => {
    const a = fromTodos([], [{ content: 'x', status: 'in_progress' }], 100)
    const b = fromTodos(a, [{ content: 'x', status: 'completed' }], 500)
    expect(b[0]).toEqual({ id: 'todo-0', subject: 'x', status: 'completed', startedAt: 100, doneAt: 500 })
  })
})

describe('banda', () => {
  test('sigue el plan de TaskCreate/TaskUpdate y lo dibuja', async ($, on) => {
    const clock = mock.clock(on, { now: 0 })
    on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
    let n = 0
    on('tool.call', { tool: 'TaskCreate' }, () => {
      n += 1
      return { result: { task: { id: String(n), subject: 's' } } } as never
    })
    on('tool.call', { tool: 'TaskUpdate' }, () => ({ result: { success: true, taskId: '1', updatedFields: [] } }) as never)

    await $.tool.call({ tool: 'TaskCreate', subject: '1 Preparar', description: '' })
    await $.tool.call({ tool: 'TaskCreate', subject: '2 Construir', description: '' })
    await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'in_progress' })
    await clock.advance(5 * MIN)
    await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
    await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress' })

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'progreso', surface, ...BAND })
      const row = await ui.find({ type: 'Text', text: /Fase/ })
      expect(row?.text).toMatch(/Fase 2 \/ 2/)
      expect(row?.text).toMatch(/1\/2/)
      expect(row?.text).toMatch(/quedan ~/)
      expect((await ui.find({ type: 'Text', text: /▸/ }))?.text).toMatch(/2 Construir/)
      await ui.unmount()
    }
  })

  test('sigue un plan en Markdown cuando Claude lo edita', async ($, on) => {
    mock.clock(on, { now: 0 })
    on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
    const md = '## Fase 1\n- [x] a\n- [ ] b\n## Fase 2\n- [ ] c\n'
    on('fs.read', () => ({ value: md }) as never)
    on('tool.call', { tool: 'Edit' }, () => ({ result: {} }) as never)
    await $.tool.call({
      tool: 'Edit',
      file_path: '/r/docs/plans/plan.md',
      old_string: 'x',
      new_string: 'y',
    } as never)
    const ui = await $.ui.mount({ plugin: 'progreso', surface: 'terminal', ...BAND })
    expect((await ui.find({ type: 'Text', text: /Fase/ }))?.text).toMatch(/Fase 1\.2 \/ 2/)
    await ui.unmount()
  })

  test('muestra los subagentes aunque no haya plan', async ($, on) => {
    mock.clock(on, { now: 0 })
    on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
    on('turn.step', async function* (_$: unknown, e: { turnId: string; index: number }) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
    })
    const step = $.turn.step({ turnId: 't', index: 0, model: 'claude-sonnet-5-5', messageCount: 1, agentId: 'a1' } as never)
    for await (const _ of step as AsyncIterable<unknown>) {
      // consume
    }
    const ui = await $.ui.mount({ plugin: 'progreso', surface: 'terminal', ...BAND })
    expect((await ui.find({ type: 'Text', text: /subagente/ }))?.text).toBe('1 subagente: Sonnet')
    await ui.unmount()
  })
})
