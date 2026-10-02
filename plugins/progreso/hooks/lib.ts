import type { ProgresoStatus, ProgresoTask } from '../types'

const MIN = 60_000

// "4.2 Migrar entidades", "Fase 3: tests", "2) Revisar" → [4, 2], [3], [2]
export const numbering = (subject: string): number[] | null => {
  const m = /^\s*(?:fase|paso|etapa|phase|step)?\s*(\d+)((?:\.\d+)*)\.?(?=[\s:)\-–]|$)/i.exec(subject)
  if (!m) return null
  const rest = m[2] ? m[2].split('.').filter(Boolean).map(Number) : []
  return [Number(m[1]), ...rest]
}

export type Progress = {
  label: string // "Fase 4.2 / 9" o "Tarea 3 / 7"
  done: number
  total: number
  current: ProgresoTask | null
  segments: { status: ProgresoStatus; boundary: boolean }[]
}

export const progress = (tasks: readonly ProgresoTask[]): Progress => {
  const total = tasks.length
  const done = tasks.filter(t => t.status === 'completed').length
  const current =
    tasks.find(t => t.status === 'in_progress') ?? tasks.find(t => t.status === 'pending') ?? null
  const nums = tasks.map(t => numbering(t.subject))
  const isPhased = total > 0 && nums.filter(Boolean).length * 2 >= total

  let label: string
  let segments: Progress['segments']
  if (isPhased) {
    const majors = [...new Set(nums.filter((n): n is number[] => n !== null).map(n => n[0]!))]
    const cur = current ? numbering(current.subject) : null
    const at = cur ? cur.join('.') : done === total ? String(Math.max(...majors)) : '–'
    label = `Fase ${at} / ${Math.max(...majors)}`
    segments = tasks.map((t, i) => ({
      status: t.status,
      boundary: i > 0 && nums[i]?.[0] !== undefined && nums[i]?.[0] !== nums[i - 1]?.[0],
    }))
  } else {
    const at = current ? tasks.indexOf(current) + 1 : total
    label = `Tarea ${at} / ${total}`
    segments = tasks.map(t => ({ status: t.status, boundary: false }))
  }
  return { label, done, total, current, segments }
}

// Estimación de lo que falta como rango, a partir de lo que tardaron las terminadas
export const estimate = (
  tasks: readonly ProgresoTask[],
  now: number,
): { low: number; high: number } | null => {
  const finished = tasks.filter(
    t => t.status === 'completed' && t.startedAt !== undefined && t.doneAt !== undefined,
  )
  if (finished.length === 0) return null
  const avg = finished.reduce((s, t) => s + (t.doneAt! - t.startedAt!), 0) / finished.length
  const pending = tasks.filter(t => t.status === 'pending').length
  const running = tasks.find(t => t.status === 'in_progress')
  const runningLeft = running?.startedAt !== undefined ? Math.max(avg * 0.2, avg - (now - running.startedAt)) : 0
  const left = pending * avg + runningLeft
  if (left <= 0) return null
  return { low: left * 0.7, high: left * 1.4 }
}

export const minutes = (ms: number): string => {
  const m = Math.max(0, Math.round(ms / MIN))
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

export const range = (r: { low: number; high: number }): string => {
  const lo = Math.max(1, Math.round(r.low / MIN))
  const hi = Math.max(lo + 1, Math.round(r.high / MIN))
  if (hi < 60) return `${lo}–${hi} min`
  return `${minutes(r.low)}–${minutes(r.high)}`
}

// Aplica una actualización de TaskUpdate o TodoWrite conservando los tiempos
export const setStatus = (
  task: ProgresoTask,
  status: ProgresoStatus,
  now: number,
): ProgresoTask => {
  if (task.status === status) return task
  const next: ProgresoTask = { ...task, status }
  if (status === 'in_progress' && task.startedAt === undefined) next.startedAt = now
  if (status === 'completed') {
    next.startedAt = task.startedAt ?? now
    next.doneAt = now
  }
  return next
}

export const fromTodos = (
  previous: readonly ProgresoTask[],
  todos: readonly { content: string; status: ProgresoStatus }[],
  now: number,
): ProgresoTask[] =>
  todos.map((t, i) => {
    const old = previous.find(p => p.subject === t.content) ?? {
      id: `todo-${i}`,
      subject: t.content,
      status: 'pending' as const,
    }
    return setStatus({ ...old, id: `todo-${i}`, subject: t.content }, t.status, now)
  })

// "claude-sonnet-5-5" → "Sonnet"
export const modelName = (id: string): string => {
  const k = id.toLowerCase()
  for (const n of ['fable', 'mythos', 'opus', 'sonnet', 'haiku']) {
    if (k.includes(n)) return n[0]!.toUpperCase() + n.slice(1)
  }
  return id
}

// { a1: 'claude-sonnet-5-5', a2: 'claude-sonnet-5-5', a3: 'claude-opus-5-5' } → "3 subagentes: 2 Sonnet, Opus"
export const agentsLabel = (agents: Readonly<Record<string, string>>): string => {
  const ids = Object.keys(agents)
  if (ids.length === 0) return ''
  const counts = new Map<string, number>()
  for (const id of ids) {
    const n = modelName(agents[id]!)
    counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  const parts = [...counts].map(([n, c]) => (c > 1 ? `${c} ${n}` : n))
  return `${ids.length} subagente${ids.length > 1 ? 's' : ''}: ${parts.join(', ')}`
}
