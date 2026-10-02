import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import {
  document,
  handoffPrompt,
  limitTriggers,
  ntfyUrl,
  resumePrompt,
  stamp,
} from './lib'

const hechos = atom({ plugin: 'traspaso', key: 'hechos' } as const, [])
const ultimo = atom({ plugin: 'traspaso', key: 'ultimo' } as const, null)

type Settings = { folder: string; ntfy: string | null }

let settings: Settings = { folder: '.claude/traspasos', ntfy: null }
let isBusy = false
let isRunning = false
let pending: { key: string; reason: string } | null = null
let idleTimer: Timer | null = null

async function push($: EngineInterface, message: string) {
  if (!settings.ntfy) return
  try {
    await $.http.fetch(settings.ntfy, {
      method: 'POST',
      body: message,
      headers: { Title: 'Claude Code', Tags: 'robot' },
    })
  } catch {
    $.ui.log('traspaso: no se pudo enviar el aviso a ntfy', { to: 'debug' })
  }
}

// Escribe el traspaso con una pregunta sobre la propia conversación (lee la caché)
async function handoff($: EngineInterface, key: string, reason: string): Promise<string> {
  if (isRunning) return 'Ya hay un traspaso en marcha.'
  isRunning = true
  try {
    $.ui.status('traspaso: escribiendo el documento…')
    let reply = await $.model.fork({ prompt: handoffPrompt(reason) })
    if (!reply.isAnswered && reply.reason === 'nothing-to-fork') {
      // Sesión recién reanudada: no hay petición previa que reutilizar, así que
      // se le pasa la conversación como texto a un modelo aparte.
      const messages = await $.session.messages()
      const transcript = messages
        .map(m => {
          const tools = m.toolUses.map(u => `[${u.tool}]`).join(' ')
          return `### ${m.role === 'user' ? 'Usuario' : 'Claude'}\n${m.text}${tools ? `\n${tools}` : ''}`
        })
        .join('\n\n')
        .slice(-120_000)
      if (transcript.trim()) {
        reply = await $.model.complete({
          model: 'sonnet',
          prompt: `Conversación hasta ahora:\n\n${transcript}\n\n---\n\n${handoffPrompt(reason)}`,
          maxTokens: 8000,
        })
      }
    }
    if (!reply.isAnswered) {
      $.ui.toast(`traspaso: no se pudo generar (${reply.reason})`)
      return `No se pudo generar el traspaso (${reply.reason}).`
    }
    const t = await $.clock.now()
    const file = `${settings.folder}/traspaso_${stamp(t)}.md`
    const latest = `${settings.folder}/ULTIMO.md`
    const text = document(reason, t, reply.text)
    await $.fs.write(file, text)
    await $.fs.write(latest, text)
    await update($, hechos, list => [...list, key].slice(-100))
    await update($, ultimo, () => file)

    const resume = resumePrompt(latest)
    try {
      await $.ui.copy({ text: resume })
    } catch {
      // sin portapapeles: el aviso de abajo lleva el prompt igualmente
    }
    try {
      await $.session.append({
        message: {
          type: 'system',
          content: [
            {
              type: 'text',
              text:
                `Traspaso guardado (${reason}): ${file}\n` +
                `Para seguir en una sesión nueva, pega:\n${resume}`,
            },
          ],
        },
      })
    } catch {
      // si no se puede añadir el aviso, quedan el toast y el archivo
    }
    $.ui.toast(`traspaso guardado en ${latest} · prompt copiado`)
    await push($, `Traspaso guardado (${reason}). Para seguir: ${resume}`)
    return `Traspaso guardado en ${file} (copia en ${latest}).\n\nPara seguir en una sesión nueva:\n${resume}`
  } finally {
    $.ui.status(undefined)
    isRunning = false
  }
}

async function maybeHandoff($: EngineInterface, key: string, reason: string) {
  if ((await read($, hechos)).includes(key)) return
  if (isBusy) {
    pending = { key, reason }
    return
  }
  await handoff($, key, reason)
}

function cancelIdle() {
  idleTimer?.cancel()
  idleTimer = null
}

function armIdle($: EngineInterface, minutes: number) {
  cancelIdle()
  if (minutes <= 0) return
  const armedAt = Date.now()
  idleTimer = $.clock.after(minutes * 60_000, () => {
    idleTimer = null
    void maybeHandoff(
      $,
      `inactivo:${armedAt}`,
      `llevas ${minutes} min sin responder y la caché está a punto de caducar`,
    )
  })
}

export const register: Register = (on, options) => {
  const ctxThreshold = Number(options.umbralContexto ?? 85)
  const quotaThreshold = Number(options.umbralCuota ?? 95)
  const idleMinutes = Number(options.minutosInactivo ?? 50)
  settings = {
    folder: String(options.carpeta ?? '.claude/traspasos').replace(/\/+$/, ''),
    ntfy: ntfyUrl(String(options.ntfy ?? '')),
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'traspaso',
      description: 'Escribe ahora el documento de traspaso y el prompt para seguir en otra sesión',
    })
    return next(e)
  })

  on('command.run', { command: 'traspaso' }, async $ => {
    const t = await $.clock.now()
    const text = await handoff($, `manual:${t}`, 'pedido a mano')
    return { text }
  })

  // Turno en marcha: no se interrumpe; lo pendiente se hace al terminar
  on('turn.start', async ($, e, next) => {
    isBusy = true
    cancelIdle()
    return next(e)
  })
  on('prompt.submit', async ($, e, next) => {
    cancelIdle()
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) {
      isBusy = false
      if (pending) {
        const p = pending
        pending = null
        await maybeHandoff($, p.key, p.reason)
      } else {
        armIdle($, idleMinutes)
      }
    }
    return done
  })

  // Claude espera un permiso o una respuesta: aviso al móvil y cuenta atrás
  on('classic.Notification', async ($, e, next) => {
    await push($, e.message)
    armIdle($, idleMinutes)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const done = await read($, hechos)
    const pct = e.context.percent
    if (pct !== undefined && pct >= ctxThreshold) {
      await maybeHandoff($, 'contexto', `el contexto está al ${pct}%`)
    } else if (pct !== undefined && pct < ctxThreshold - 20 && done.includes('contexto')) {
      // tras compactar o /clear se puede volver a avisar
      await update($, hechos, list => list.filter(k => k !== 'contexto'))
    }
    for (const t of limitTriggers(e.rateLimits, quotaThreshold, done)) {
      await maybeHandoff($, t.key, t.reason)
    }
    return next(e)
  })
}
