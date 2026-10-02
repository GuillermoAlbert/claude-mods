import { describe, expect, mock, test } from 'claude-code/testing'

import type { Kind } from '../hooks/lib'
import { emptyVault, isDni, isIbanEs, isNie, mask, unmask, unmaskDeep } from '../hooks/lib'

const ALL = new Set<Kind>(['dni', 'nie', 'iban', 'telefono', 'email', 'secreto'])

// Datos de prueba válidos (inventados)
const DNI = '12345678Z'
const NIE = 'X1234567L'
const IBAN = 'ES91 2100 0418 4502 0005 1332'
const TEL = '+34 612 345 678'
const MAIL = 'ana.garcia@empresa.es'
const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789'

const ROW = `Cliente: ${DNI} / ${NIE}, cuenta ${IBAN}, tel ${TEL}, ${MAIL}, clave ${KEY}`

describe('lib', () => {
  test('los datos de prueba son válidos', () => {
    expect(isDni(DNI)).toBe(true)
    expect(isNie(NIE)).toBe(true)
    expect(isIbanEs(IBAN)).toBe(true)
    expect(isDni('12345678A')).toBe(false)
  })

  test('cambia cada dato por un falso válido y con el mismo formato', () => {
    const v = emptyVault('sal')
    const { text, count } = mask(v, ROW, ALL)
    expect(count).toBe(6)
    for (const real of [DNI, NIE, IBAN, TEL, MAIL, KEY]) expect(text).not.toContain(real)

    const fakeDni = v.toFake[DNI]!
    const fakeIban = v.toFake[IBAN]!
    expect(isDni(fakeDni)).toBe(true)
    expect(isNie(v.toFake[NIE]!)).toBe(true)
    expect(isIbanEs(fakeIban)).toBe(true)
    expect(fakeIban.slice(0, 4)).toBe('ES' + fakeIban.slice(2, 4)) // formato ES..
    expect(fakeIban.replace(/\s/g, '').slice(4, 8)).toBe('2100') // mismo banco
    expect(fakeIban.split(' ').map(p => p.length)).toEqual([4, 4, 4, 4, 4, 4])
    expect(v.toFake[TEL]).toMatch(/^\+34 6\d{2} \d{3} \d{3}$/)
    expect(v.toFake[MAIL]).toMatch(/^persona\.[a-z0-9]{6}@empresa\.es$/)
    expect(v.toFake[KEY]!.startsWith('sk-ant-')).toBe(true)
    expect(v.toFake[KEY]!.length).toBe(KEY.length)
  })

  test('es consistente y reversible', () => {
    const v = emptyVault('sal')
    const a = mask(v, ROW, ALL).text
    const b = mask(v, `otra vez ${DNI}`, ALL).text
    expect(b).toBe(`otra vez ${v.toFake[DNI]}`)
    expect(unmask(v, a)).toBe(ROW)
    // un falso que vuelve a pasar no se vuelve a cambiar
    expect(mask(v, a, ALL).text).toBe(a)
    // el IBAN falso escrito sin espacios también se restaura
    const compactFake = v.toFake[IBAN]!.replace(/\s/g, '')
    expect(unmask(v, compactFake)).toBe(IBAN.replace(/\s/g, ''))
  })

  test('no toca lo que no es un dato', () => {
    const v = emptyVault('sal')
    const text = 'timeout=30000, versión 2.1.287, DNI mal 12345678A, id 123456789'
    expect(mask(v, text, ALL)).toEqual({ text, count: 0 })
  })

  test('respeta las categorías desactivadas', () => {
    const v = emptyVault('sal')
    const r = mask(v, `${DNI} ${TEL}`, new Set<Kind>(['dni']))
    expect(r.text).toContain(TEL)
    expect(r.text).not.toContain(DNI)
  })

  test('desenmascara la entrada entera de una herramienta', () => {
    const v = emptyVault('sal')
    mask(v, ROW, ALL)
    const input = { tool: 'Edit', old_string: `dni: ${v.toFake[DNI]}`, nested: [v.toFake[MAIL]] }
    expect(unmaskDeep(v, input)).toEqual({ tool: 'Edit', old_string: `dni: ${DNI}`, nested: [MAIL] })
  })
})

describe('mod', () => {
  test('lo que Claude escribe con falsos se ejecuta con los reales', async ($, on) => {
    mock.store(on, {
      boveda: { salt: 's', toFake: { [DNI]: '87654321X' }, toReal: { '87654321X': DNI } },
    })
    let ran = ''
    on('tool.call', { tool: 'Bash' }, (_$, e) => {
      ran = e.command
      return { result: { stdout: '', stderr: '', interrupted: false } } as never
    })
    await $.tool.call({ tool: 'Bash', command: 'grep 87654321X clientes.csv' })
    expect(ran).toBe(`grep ${DNI} clientes.csv`)
  })

  test('no devuelve datos reales a las búsquedas web', async ($, on) => {
    mock.store(on, {
      boveda: { salt: 's', toFake: { [DNI]: '87654321X' }, toReal: { '87654321X': DNI } },
    })
    let url = ''
    on('tool.call', { tool: 'WebFetch' }, (_$, e) => {
      url = e.url
      return { result: {} } as never
    })
    await $.tool.call({ tool: 'WebFetch', url: 'https://x.test/?q=87654321X', prompt: '' })
    expect(url).toBe('https://x.test/?q=87654321X')
  })
})
