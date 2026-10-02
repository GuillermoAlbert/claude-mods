import { describe, expect, mock, test } from 'claude-code/testing'

import { limitTriggers, ntfyUrl, resumePrompt, stamp } from '../hooks/lib'

const MIN = 60_000

const stand = (on: any, log: { forks: string[]; files: Record<string, string>; posts: string[] }) => {
  on('model.fork', (_$: unknown, e: { prompt: string }) => {
    log.forks.push(e.prompt)
    return { value: { isAnswered: true, text: '## Objetivo\nProbar', usage: {} } }
  })
  on('fs.write', (_$: unknown, e: { path: string; text: string }) => {
    log.files[e.path] = e.text
    return { value: undefined }
  })
  on('http.fetch', (_$: unknown, e: { init?: { body?: string } }) => {
    log.posts.push(e.init?.body ?? '')
    return { value: { ok: true, status: 200, text: '', headers: {} } }
  })
  for (const ev of ['ui.toast', 'ui.status', 'ui.log', 'ui.copy', 'session.append', 'command.register']) {
    on(ev, () => ({ value: undefined }))
  }
  on('turn.complete', () => ({ text: '' }))
  on('classic.Notification', () => ({}))
  on('session.measure', (_$: unknown, e: { changed: string[] }) => ({ changed: e.changed }))
}

describe('lib', () => {
  test('nombres, URLs y prompt para seguir', () => {
    expect(stamp(Date.parse('2026-10-02T08:41:07Z'))).toBe('2026-10-02_0841')
    expect(ntfyUrl('')).toBe(null)
    expect(ntfyUrl('mi-tema')).toBe('https://ntfy.sh/mi-tema')
    expect(ntfyUrl('https://ntfy.casa.lan/claude')).toBe('https://ntfy.casa.lan/claude')
    expect(resumePrompt('.claude/traspasos/ULTIMO.md')).toMatch(/^Lee \.claude\/traspasos\/ULTIMO\.md/)
  })

  test('un traspaso por límite y periodo', () => {
    const l = [{ kind: 'five_hour', percentUsed: 96, resetsAt: 'r1' }]
    const t = limitTriggers(l, 95, [])
    expect(t[0]!.reason).toBe('la sesión de 5 h está al 96%')
    expect(limitTriggers(l, 95, [t[0]!.key])).toEqual([])
    expect(limitTriggers([{ kind: 'seven_day', percentUsed: 50 }], 95, [])).toEqual([])
  })
})

describe('mod', () => {
  test('/traspaso escribe el documento y ULTIMO.md', async ($, on) => {
    const log = { forks: [] as string[], files: {} as Record<string, string>, posts: [] as string[] }
    stand(on, log)
    mock.clock(on, { now: Date.parse('2026-10-02T08:41:00Z') })
    const r = await $.command.run({ command: 'traspaso', args: '' } as never)
    expect(log.forks[0]).toMatch(/Traspaso automático: pedido a mano/)
    const paths = Object.keys(log.files).sort()
    expect(paths.length).toBe(2)
    expect(paths[0]).toMatch(/\.claude\/traspasos\/ULTIMO\.md$/)
    expect(paths[1]).toMatch(/\.claude\/traspasos\/traspaso_2026-10-02_0841\.md$/)
    expect(log.files[paths[0]!]).toContain('## Objetivo')
    expect((r as { text: string }).text).toMatch(/Lee \.claude\/traspasos\/ULTIMO\.md/)
  })

  test('traspaso tras 50 min sin respuesta, con aviso a ntfy', { options: { ntfy: 'mi-tema' } }, async ($, on) => {
    const log = { forks: [] as string[], files: {} as Record<string, string>, posts: [] as string[] }
    stand(on, log)
    const clock = mock.clock(on, { now: 0 })
    await $.classic.Notification({ message: 'Claude necesita tu permiso', notification_type: 'permission_prompt' } as never)
    await clock.advance(49 * MIN)
    expect(log.forks.length).toBe(0)
    await clock.advance(2 * MIN)
    expect(log.forks.length).toBe(1)
    expect(log.forks[0]).toMatch(/50 min sin responder/)
    expect(log.posts[0]).toBe('Claude necesita tu permiso')
    expect(log.posts[1]).toMatch(/^Traspaso guardado/)
  })

  test('traspaso al cruzar el umbral de contexto, una sola vez', async ($, on) => {
    const log = { forks: [] as string[], files: {} as Record<string, string>, posts: [] as string[] }
    stand(on, log)
    mock.clock(on, { now: 0 })
    const m = (percent: number) =>
      $.session.measure({ context: { window: 200_000, percent }, rateLimits: [], changed: ['context'] })
    await m(80)
    expect(log.forks.length).toBe(0)
    await m(86)
    await m(90)
    expect(log.forks.length).toBe(1)
    expect(log.forks[0]).toMatch(/el contexto está al 86%/)
  })
})
