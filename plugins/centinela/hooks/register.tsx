import { atom, read, update } from 'claude-code'
import type { Register, SessionRateLimit } from 'claude-code'

import type { CentinelaSnapshot } from '../types'
import {
  bar,
  cacheState,
  label,
  levelColor,
  newWarnings,
  order,
  span,
  ttlMs,
} from './lib'

const snap = atom({ plugin: 'centinela', key: 'snap' } as const, null)
const lastStepAt = atom({ plugin: 'centinela', key: 'lastStepAt' } as const, null)
const now = atom({ plugin: 'centinela', key: 'now' } as const, 0)
const warned = atom({ plugin: 'centinela', key: 'warned' } as const, [])
const hidden = atom({ plugin: 'centinela', key: 'hidden' } as const, false)

const TICK_MS = 5_000

const toSnapshot = (
  limits: SessionRateLimit[],
  contextPercent: number | undefined,
): CentinelaSnapshot => ({
  limits: limits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
  contextPercent: contextPercent ?? null,
})

export const register: Register = (on, options) => {
  const ttlSetting = String(options.cacheTtl ?? 'auto')
  const avisos = options.avisos !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'centinela',
      description: 'Muestra u oculta la banda de uso y caché',
    })
    const usage = await $.session.usage()
    await update($, snap, () => toSnapshot(usage.rateLimits, usage.context.percent))
    const t = await $.clock.now()
    await update($, now, () => t)
    $.clock.every(TICK_MS, () => {
      void $.clock.now().then(ms => update($, now, () => ms))
    })
    return next(e)
  })

  on('command.run', { command: 'centinela' }, async $ => {
    const isHidden = await update($, hidden, h => !h)
    return { text: isHidden ? 'Banda de centinela oculta.' : 'Banda de centinela visible.' }
  })

  // Cada petición del hilo principal lee o escribe la caché: reinicia el reloj
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (!e.agentId) {
      const t = await $.clock.now()
      await update($, lastStepAt, () => t)
      await update($, now, () => t)
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    const s = toSnapshot(e.rateLimits, e.context.percent)
    await update($, snap, () => s)
    if (avisos) {
      const seen = await read($, warned)
      const fresh = newWarnings(s.limits, seen)
      for (const w of fresh) $.ui.toast(w.message)
      if (fresh.length > 0) {
        await update($, warned, list => [...list, ...fresh.map(w => w.key)].slice(-50))
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, hidden))) return next(e)
    const s = await read($, snap)
    const t = await read($, now)
    const last = await read($, lastStepAt)
    const limits = order(s?.limits ?? [])
    const ctx = s?.contextPercent ?? null
    const cache = cacheState(last, t, ttlMs(ttlSetting, limits), e.props.isWorking)
    if (limits.length === 0 && ctx === null && cache === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const cols = e.props.bodyColumns
    const width = cols >= 110 ? 8 : cols >= 80 ? 5 : 0
    const sep = <Text dimColor> · </Text>
    const parts = []

    for (const l of limits) {
      const left = l.resetsAt ? Date.parse(l.resetsAt) - t : NaN
      parts.push(
        <Text>
          <Text dimColor>{label(l.kind)} </Text>
          {width > 0 && <Text color={levelColor(l.percentUsed)}>{bar(l.percentUsed, width)} </Text>}
          <Text color={levelColor(l.percentUsed)}>{Math.round(l.percentUsed)}%</Text>
          {Number.isFinite(left) && left > 0 && <Text dimColor> ↻{span(left)}</Text>}
        </Text>,
      )
    }
    if (ctx !== null) {
      parts.push(
        <Text>
          <Text dimColor>Ctx </Text>
          {width > 0 && <Text color={levelColor(ctx)}>{bar(ctx, width)} </Text>}
          <Text color={levelColor(ctx)}>{ctx}%</Text>
        </Text>,
      )
    }
    if (cache !== null) {
      parts.push(
        <Text>
          <Text color={cache.color}>● </Text>
          <Text dimColor>{cache.text}</Text>
        </Text>,
      )
    }

    return (
      <Box flexDirection="row">
        <Text wrap="truncate-end">
          {parts.flatMap((p, i) => (i === 0 ? [p] : [sep, p]))}
        </Text>
      </Box>
    )
  })
}
