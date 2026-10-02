import type { EngineInterface, Register } from 'claude-code'

import type { Kind, Vault } from './lib'
import { emptyVault, mapText, mask, unmaskDeep } from './lib'

const STORE_KEY = 'boveda'
const MAX_ENTRIES = 50_000

// Herramientas que mandan datos fuera: no se les devuelven los datos reales
const OUTBOUND = new Set(['WebFetch', 'WebSearch'])

let vault: Vault | null = null
let hidden = 0
let isDirty = false

async function loadVault($: EngineInterface): Promise<Vault> {
  if (vault) return vault
  const saved = (await $.store.get(STORE_KEY)) as Vault | undefined
  if (saved && typeof saved.salt === 'string') {
    vault = saved
  } else {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    vault = emptyVault(Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''))
    isDirty = true
  }
  return vault
}

async function saveVault($: EngineInterface) {
  if (!vault || !isDirty) return
  if (Object.keys(vault.toFake).length > MAX_ENTRIES) {
    $.ui.toast('escudo: la tabla de datos es muy grande; se reinicia')
    vault = emptyVault(vault.salt)
  }
  await $.store.set(STORE_KEY, vault)
  isDirty = false
}

export const register: Register = (on, options) => {
  const enabled = new Set<Kind>()
  if (options.dni !== false) {
    enabled.add('dni')
    enabled.add('nie')
  }
  if (options.iban !== false) enabled.add('iban')
  if (options.telefono !== false) enabled.add('telefono')
  if (options.email !== false) enabled.add('email')
  if (options.secretos !== false) enabled.add('secreto')

  on('session.start', async ($, e, next) => {
    await loadVault($)
    await $.command.register({
      name: 'escudo',
      description: 'Cuántos datos personales ha ocultado el escudo en esta sesión',
    })
    return next(e)
  })

  on('command.run', { command: 'escudo' }, async $ => {
    const v = await loadVault($)
    const total = Object.keys(v.toFake).length
    return {
      text:
        `Escudo activo (${[...enabled].join(', ')}).\n` +
        `En esta sesión: ${hidden} datos ocultados. Datos distintos en la tabla local: ${total}.`,
    }
  })

  // Todo lo que Claude lee (tus mensajes, resultados de herramientas, avisos)
  // pasa por aquí: los datos reales se cambian por sus falsos antes de enviarse.
  on('session.append', async ($, e, next) => {
    if (e.message.role !== 'user') return next(e)
    const v = await loadVault($)
    let count = 0
    const { blocks, changed } = mapText(e.message.content, text => {
      const before = Object.keys(v.toFake).length
      const r = mask(v, text, enabled)
      count += r.count
      if (Object.keys(v.toFake).length !== before) isDirty = true
      return r.text
    })
    if (!changed) return next(e)
    hidden += count
    $.ui.status(`🛡 ${hidden} datos ocultos`)
    await saveVault($)
    return next({ ...e, message: { ...e.message, content: blocks } })
  })

  // Lo que Claude escribe con datos falsos se ejecuta con los reales
  on('tool.call', async ($, e, next) => {
    if (OUTBOUND.has(String(e.tool))) return next(e)
    const v = await loadVault($)
    if (Object.keys(v.toReal).length === 0) return next(e)
    const real = unmaskDeep(v, e)
    return next(real)
  })
}
