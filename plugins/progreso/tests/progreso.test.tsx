import { describe, expect, mock, test } from 'claude-code/testing'

import type { ProgresoTask } from '../types'
import { estimate, fromTodos, numbering, progress, range } from '../hooks/lib'

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
})
