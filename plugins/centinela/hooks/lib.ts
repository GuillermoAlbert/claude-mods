import type { CentinelaLimit } from '../types'

const MIN = 60_000
const HOUR = 60 * MIN

export const ttlMs = (setting: string, limits: CentinelaLimit[]): number => {
  if (setting === '1h') return HOUR
  if (setting === '5m') return 5 * MIN
  const five = limits.find(l => l.kind === 'five_hour')
  if (limits.length === 0) return 5 * MIN
  if (five && five.percentUsed >= 100) return 5 * MIN
  return HOUR
}

export const label = (kind: string): string => {
  const k = kind.toLowerCase()
  if (k === 'five_hour') return 'Sesión'
  if (k === 'seven_day') return 'Semana'
  if (k.includes('fable')) return 'Fable'
  if (k.includes('mythos')) return 'Mythos'
  if (k.includes('opus')) return 'Opus'
  if (k.includes('sonnet')) return 'Sonnet'
  if (k === 'spend_limit') return 'Gasto'
  return kind
}

// Orden: sesión, semana, el resto por nombre
export const order = (limits: CentinelaLimit[]): CentinelaLimit[] => {
  const rank = (k: string) => (k === 'five_hour' ? 0 : k === 'seven_day' ? 1 : 2)
  return [...limits].sort((a, b) => rank(a.kind) - rank(b.kind) || a.kind.localeCompare(b.kind))
}

export const bar = (pct: number, width: number): string => {
  const p = Math.max(0, Math.min(100, pct))
  const full = Math.round((p / 100) * width)
  return '▓'.repeat(full) + '░'.repeat(width - full)
}

export const levelColor = (pct: number): string =>
  pct >= 90 ? 'red' : pct >= 70 ? 'yellow' : 'green'

// "2h05", "45m", "3d 4h"
export const span = (ms: number): string => {
  const m = Math.max(0, Math.round(ms / MIN))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h${String(m % 60).padStart(2, '0')}`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

// Cuenta atrás mm:ss o h:mm:ss
export const clock = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${Math.floor(s / 60)}:${ss}`
}

export type CacheState = { color: string; text: string }

export const cacheState = (
  lastStepAt: number | null,
  now: number,
  ttl: number,
  isWorking: boolean,
): CacheState | null => {
  if (isWorking) return { color: 'green', text: 'caché activa' }
  if (lastStepAt === null) return null
  const left = ttl - (now - lastStepAt)
  if (left <= 0) return { color: 'red', text: 'caché caducada' }
  // ámbar en el último 25% (15 min con 1 h, 75 s con 5 min)
  const color = left <= ttl * 0.25 ? 'yellow' : 'green'
  return { color, text: `caché ${clock(left)}` }
}

// Umbrales cruzados que aún no se avisaron; la clave incluye el reinicio
export const newWarnings = (
  limits: CentinelaLimit[],
  warned: string[],
): { key: string; message: string }[] => {
  const out: { key: string; message: string }[] = []
  for (const l of limits) {
    for (const t of [95, 80]) {
      if (l.percentUsed < t) continue
      const key = `${l.kind}:${l.resetsAt ?? ''}:${t}`
      if (!warned.includes(key)) {
        out.push({ key, message: `${label(l.kind)} al ${Math.round(l.percentUsed)}%` })
      }
      break
    }
  }
  return out
}

// Hora local de un reinicio: "10:48" si es hoy, "vie 10:48" si es otro día
export const resetClock = (resetMs: number, nowMs: number, timeZone: string): string => {
  try {
    const fmt = (ms: number) => {
      const parts = new Intl.DateTimeFormat('es-ES', {
        timeZone,
        weekday: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date(ms))
      const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
      return { day: get('day'), weekday: get('weekday').replace('.', ''), hm: `${get('hour')}:${get('minute')}` }
    }
    const r = fmt(resetMs)
    const isToday = r.day === fmt(nowMs).day && resetMs - nowMs < 86_400_000
    return isToday ? r.hm : `${r.weekday} ${r.hm}`
  } catch {
    const d = new Date(resetMs)
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`
  }
}
