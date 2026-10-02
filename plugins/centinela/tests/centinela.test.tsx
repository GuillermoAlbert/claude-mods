import { describe, expect, mock, test } from 'claude-code/testing'

import { cacheState, clock, newWarnings, resetClock, span, ttlMs } from '../hooks/lib'

const props = (bodyColumns: number, isWorking = false) => ({
  hasSurvey: false,
  isWorking,
  maxRows: 10,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
})

const LIMITS = [
  { kind: 'seven_day', percentUsed: 31 },
  { kind: 'five_hour', percentUsed: 62 },
  { kind: 'seven_day_fable', percentUsed: 18 },
]

describe('lib', () => {
  test('ttl auto: 1 h con suscripción, 5 min sin límites o con la sesión agotada', () => {
    expect(ttlMs('auto', LIMITS)).toBe(3_600_000)
    expect(ttlMs('auto', [])).toBe(300_000)
    expect(ttlMs('auto', [{ kind: 'five_hour', percentUsed: 100 }])).toBe(300_000)
    expect(ttlMs('5m', LIMITS)).toBe(300_000)
  })

  test('semáforo de caché', () => {
    const h = 3_600_000
    expect(cacheState(null, 0, h, false)).toBe(null)
    expect(cacheState(0, 10 * 60_000, h, false)).toEqual({ color: 'green', text: 'caché 50:00' })
    expect(cacheState(0, 50 * 60_000, h, false)?.color).toBe('yellow')
    expect(cacheState(0, 61 * 60_000, h, false)?.color).toBe('red')
    expect(cacheState(0, 61 * 60_000, h, true)?.color).toBe('green')
  })

  test('formatos de tiempo', () => {
    expect(span(125 * 60_000)).toBe('2h05')
    expect(span(45 * 60_000)).toBe('45m')
    expect(span((3 * 24 + 4) * 3_600_000)).toBe('3d 4h')
    expect(clock(65 * 60_000)).toBe('1:05:00')
  })

  test('hora de reinicio en hora de España', () => {
    const now = Date.parse('2026-10-02T06:52:00Z') // vie 08:52 en Madrid
    expect(resetClock(Date.parse('2026-10-02T08:48:00Z'), now, 'Europe/Madrid')).toBe('10:48')
    expect(resetClock(Date.parse('2026-10-09T06:00:00Z'), now, 'Europe/Madrid')).toBe('vie 08:00')
    // invierno: UTC+1
    expect(resetClock(Date.parse('2026-12-02T08:48:00Z'), Date.parse('2026-12-02T07:00:00Z'), 'Europe/Madrid')).toBe('09:48')
  })

  test('avisos una sola vez por umbral y reinicio', () => {
    const l = [{ kind: 'five_hour', percentUsed: 96, resetsAt: 'r1' }]
    const first = newWarnings(l, [])
    expect(first.map(w => w.message)).toEqual(['Sesión al 96%'])
    expect(newWarnings(l, first.map(w => w.key))).toEqual([])
  })
})

const beneath = (on: any, toasts: string[] = []) => {
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))
  on('session.measure', (_$: unknown, e: { changed: string[] }) => ({ changed: e.changed }))
  on('ui.toast', (_$: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return { value: undefined }
  })
}

describe('banda', () => {
  test('muestra límites y contexto en terminal y escritorio', async ($, on) => {
    beneath(on)
    mock.clock(on)
    await $.session.measure({
      context: { window: 200_000, tokens: 108_000, percent: 54 },
      rateLimits: [...LIMITS, { kind: 'spend_limit', percentUsed: 85 }],
      changed: ['context', 'rateLimits'],
    })

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'centinela',
        surface,
        component: 'AbovePrompt',
        props: props(140),
      })
      const drawn = await ui.find({ type: 'Text', text: /Sesión/ })
      expect(drawn?.text).toMatch(/Sesión ▓+░* 62%/)
      expect(drawn?.text).toMatch(/Semana .*31%/)
      expect(drawn?.text).toMatch(/Fable .*18%/)
      expect(drawn?.text).toMatch(/Ctx .*54%/)
      // order: Sesión antes que Semana
      expect(drawn!.text.indexOf('Sesión')).toBeLessThan(drawn!.text.indexOf('Semana'))
      await ui.unmount()
    }
  })

  test('compacta sin barras en pantallas estrechas', async ($, on) => {
    beneath(on)
    mock.clock(on)
    await $.session.measure({
      context: { window: 200_000, percent: 10 },
      rateLimits: LIMITS,
      changed: ['rateLimits'],
    })
    const ui = await $.ui.mount({
      plugin: 'centinela',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: props(60),
    })
    const drawn = await ui.find({ type: 'Text', text: /Sesión/ })
    expect(drawn?.text).not.toMatch(/▓|░/)
    await ui.unmount()
  })

  test('avisa al pasar del 80%', async ($, on) => {
    const toasts: string[] = []
    beneath(on, toasts)
    await $.session.measure({
      context: { window: 200_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 83, resetsAt: '2026-10-02T10:48:00Z' }],
      changed: ['rateLimits'],
    })
    await $.session.measure({
      context: { window: 200_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 84, resetsAt: '2026-10-02T10:48:00Z' }],
      changed: ['rateLimits'],
    })
    expect(toasts).toEqual(['Sesión al 83%'])
  })

  test('el reloj sigue corriendo con la sesión parada', async ($, on) => {
    beneath(on)
    const clock = mock.clock(on, { now: Date.parse('2026-10-02T08:00:00Z') })
    await $.session.measure({
      context: { window: 200_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 10, resetsAt: '2026-10-02T10:00:00Z' }],
      changed: ['rateLimits'],
    })
    const ui = await $.ui.mount({
      plugin: 'centinela',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: props(140),
    })
    expect((await ui.find({ type: 'Text', text: /Sesión/ }))?.text).toMatch(/↻12:00 \(2h00\)/)
    await clock.advance(30 * 60_000)
    expect((await ui.find({ type: 'Text', text: /Sesión/ }))?.text).toMatch(/↻12:00 \(1h30\)/)
    await ui.unmount()
  })
})
