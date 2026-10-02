import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ProgresoTask } from '../types'
import {
  agentsLabel,
  estimate,
  fromTodos,
  isLedgerPath,
  isPlanPath,
  ledgerItems,
  ledgerRoot,
  minutes,
  parseLedger,
  parsePlan,
  planTaskTitles,
  planToTasks,
  progress,
  range,
  setStatus,
} from './lib'

const tasks = atom({ plugin: 'progreso', key: 'tasks' } as const, [])
const planStartedAt = atom({ plugin: 'progreso', key: 'planStartedAt' } as const, null)
const agents = atom({ plugin: 'progreso', key: 'agents' } as const, {})
const waiting = atom({ plugin: 'progreso', key: 'waiting' } as const, false)
const now = atom({ plugin: 'progreso', key: 'now' } as const, 0)
const hidden = atom({ plugin: 'progreso', key: 'hidden' } as const, false)
// De dónde sale el plan: la lista de tareas de Claude o un .md con casillas
const fuente = atom({ plugin: 'progreso', key: 'fuente' } as const, null)

const PANE = 'progreso'
const LINGER_MS = 10 * 60_000 // la banda sigue 10 min tras terminar el plan

let ticking = false
function ensureTicker($: EngineInterface) {
  if (ticking) return
  ticking = true
  $.clock.every(1_000, () => {
    void $.clock.now().then(ms => update($, now, () => ms))
  })
}

async function touchPlan($: EngineInterface) {
  ensureTicker($)
  const t = await $.clock.now()
  await update($, planStartedAt, p => p ?? t)
  await update($, now, () => t)
  return t
}

const isPlanOver = (list: readonly ProgresoTask[], t: number) =>
  list.length === 0 ||
  (list.every(x => x.status === 'completed') &&
    t - Math.max(...list.map(x => x.doneAt ?? 0)) > LINGER_MS)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'progreso',
      description: 'Abre el panel con las tareas del plan (o: /progreso ocultar | mostrar | reiniciar)',
    })
    return next(e)
  })

  on('command.run', { command: 'progreso' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'ocultar' || arg === 'mostrar') {
      await update($, hidden, () => arg === 'ocultar')
      return { text: arg === 'ocultar' ? 'Banda de progreso oculta.' : 'Banda de progreso visible.' }
    }
    if (arg === 'reiniciar') {
      await update($, fuente, () => null)
      await update($, tasks, () => [])
      await update($, planStartedAt, () => null)
      return { text: 'Progreso reiniciado.' }
    }
    await $.ui.open({ id: PANE, title: 'Progreso del plan' })
    return { text: 'Panel de progreso abierto.' }
  })

  // Listas de tareas: TodoWrite (lista completa) y TaskCreate/TaskUpdate (una a una)
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError) {
      const t = await touchPlan($)
      await update($, fuente, () => 'tareas')
      await update($, tasks, list => fromTodos(list, e.todos, t))
    }
    return ran
  })

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError) {
      const t = await touchPlan($)
      await update($, fuente, () => 'tareas')
      const r = ran.result as { task?: { id?: string } } | undefined
      const id = r?.task?.id ?? /#(\d+)/.exec(ran.text ?? '')?.[1] ?? `t${t}`
      await update($, tasks, list => {
        const fresh = isPlanOver(list, t) ? [] : list
        return [...fresh, { id, subject: e.subject, status: 'pending' as const }]
      })
    }
    return ran
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError) {
      const t = await touchPlan($)
      const status = e.status
      await update($, tasks, list => {
        if (status === 'deleted') return list.filter(x => x.id !== e.taskId)
        return list.map(x => {
          if (x.id !== e.taskId) return x
          const renamed = e.subject ? { ...x, subject: e.subject } : x
          return status ? setStatus(renamed, status, t) : renamed
        })
      })
    }
    return ran
  })

  // Planes en Markdown con casillas (p. ej. docs/superpowers/plans/*.md): se
  // siguen cuando Claude los lee o los edita, si no hay lista de tareas activa
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const tool = String(e.tool)
    if (!['Read', 'Write', 'Edit', 'MultiEdit'].includes(tool) || ran.deny !== undefined || ran.isError) {
      return ran
    }
    const path = (e as { file_path?: unknown }).file_path
    if (typeof path !== 'string') return ran
    const isLedger = isLedgerPath(path)
    if (!isLedger && !isPlanPath(path)) return ran
    let items
    try {
      if (isLedger) {
        // superpowers (subagent-driven-development): el registro manda
        const ledger = parseLedger(await $.fs.read(path))
        if (!ledger.planPath) return ran
        const planPath = ledger.planPath.startsWith('/')
          ? ledger.planPath
          : `${ledgerRoot(path)}/${ledger.planPath}`
        items = ledgerItems(planTaskTitles(await $.fs.read(planPath)), ledger.complete)
      } else {
        items = parsePlan(await $.fs.read(path))
      }
    } catch {
      return ran
    }
    if (items.length < 2) return ran
    const t = await $.clock.now()
    const list = await read($, tasks)
    const src = await read($, fuente)
    const key = isLedger ? `sdd:${path}` : `plan:${path}`
    const isOurs = src === key
    if (src === 'tareas' && !isPlanOver(list, t)) return ran
    // con un registro de superpowers activo, leer el plan no cambia nada
    if (!isLedger && src?.startsWith('sdd:') && !isPlanOver(list, t)) return ran
    if (!isOurs && tool === 'Read' && src !== null && !isPlanOver(list, t)) return ran
    await touchPlan($)
    if (!isOurs) await update($, planStartedAt, () => t)
    await update($, fuente, () => key)
    await update($, tasks, prev => planToTasks(items, isOurs ? prev : [], t))
    return ran
  })

  // Subagentes en marcha y el modelo con el que corre cada uno (el ya resuelto)
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const id = e.agentId
    if (id !== undefined) {
      await update($, agents, map => {
        const { [id]: _gone, ...rest } = map
        return rest
      })
    }
    return done
  })

  // Esperando una respuesta o un permiso tuyo
  on('classic.Notification', async ($, e, next) => {
    await update($, waiting, () => true)
    return next(e)
  })
  on('prompt.submit', async ($, e, next) => {
    await update($, waiting, () => false)
    return next(e)
  })
  on('turn.step', async function* ($, e, next) {
    await update($, waiting, () => false)
    const id = e.agentId
    if (id !== undefined) {
      const model = e.model
      await update($, agents, map => (map[id] === model ? map : { ...map, [id]: model }))
    }
    return yield* next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey || (await read($, hidden))) return below
    const list = await read($, tasks)
    await read($, now) // tic del reloj
    const t = await $.clock.now()
    const agentsOnly = agentsLabel(await read($, agents))
    if (isPlanOver(list, t)) {
      if (agentsOnly === '') return below
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Text color="cyan" wrap="truncate-end">
            {agentsOnly}
          </Text>
          {below}
        </Box>
      )
    }

    const p = progress(list)
    const started = await read($, planStartedAt)
    const eta = estimate(list, t)
    const agentsText = agentsLabel(await read($, agents))
    const isWaiting = await read($, waiting)
    const { Box, Text } = $.ui.resolve(e)

    const room = Math.max(10, e.props.bodyColumns - 60)
    const segs = p.segments.length <= room ? p.segments : []
    const bar = segs.map((s, i) => (
      <Text>
        {s.boundary && <Text dimColor>│</Text>}
        <Text
          color={s.status === 'completed' ? 'green' : s.status === 'in_progress' ? 'yellow' : undefined}
          dimColor={s.status === 'pending'}
        >
          {s.status === 'completed' ? '▓' : s.status === 'in_progress' ? '▒' : '░'}
        </Text>
      </Text>
    ))
    const pct = p.total ? Math.round((p.done / p.total) * 100) : 0

    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text bold>{p.label} </Text>
          {bar.length > 0 ? bar : <Text dimColor>{pct}%</Text>}
          <Text dimColor>
            {'  '}
            {p.done}/{p.total}
            {started !== null ? ` · ${minutes(t - started)}` : ''}
            {eta ? ` · quedan ~${range(eta)}` : p.done < p.total ? ' · estimando…' : ' · terminado'}
          </Text>
          {isWaiting && <Text color="red"> · ⏸ esperando tu respuesta</Text>}
        </Text>
        {((p.current && p.current.status === 'in_progress') || agentsText !== '') && (
          <Text wrap="truncate-end">
            {p.current && p.current.status === 'in_progress' && (
              <Text dimColor>▸ {p.current.subject}</Text>
            )}
            {agentsText !== '' && (
              <Text color="cyan">
                {p.current && p.current.status === 'in_progress' ? '  · ' : ''}
                {agentsText}
              </Text>
            )}
          </Text>
        )}
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, tasks)
    await read($, now)
    const t = await $.clock.now()
    if (list.length === 0) return <Text dimColor>Todavía no hay un plan con tareas.</Text>
    const p = progress(list)
    const eta = estimate(list, t)
    return (
      <Box flexDirection="column">
        <Text bold>
          {p.label} · {p.done}/{p.total}
          {eta ? ` · quedan ~${range(eta)}` : ''}
        </Text>
        {list.map(x => (
          <Text
            color={x.status === 'completed' ? 'green' : x.status === 'in_progress' ? 'yellow' : undefined}
            dimColor={x.status === 'pending'}
            wrap="truncate-end"
          >
            {x.status === 'completed' ? '✓' : x.status === 'in_progress' ? '▸' : '·'} {x.subject}
            {x.status === 'completed' && x.startedAt !== undefined && x.doneAt !== undefined
              ? `  (${minutes(x.doneAt - x.startedAt)})`
              : x.status === 'in_progress' && x.startedAt !== undefined
                ? `  (${minutes(t - x.startedAt)})`
                : ''}
          </Text>
        ))}
      </Box>
    )
  })
}
