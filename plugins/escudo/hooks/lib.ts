// Seudonimización local y reversible: cada dato real se cambia por uno falso,
// válido y siempre el mismo; la tabla vive solo en esta máquina.

export type Kind = 'dni' | 'nie' | 'iban' | 'telefono' | 'email' | 'secreto'

export type Vault = {
  salt: string
  toFake: Record<string, string> // real → falso
  toReal: Record<string, string> // falso → real (también en forma compacta)
}

export const emptyVault = (salt: string): Vault => ({ salt, toFake: {}, toReal: {} })

// ---------- aleatoriedad determinista ----------

const fnv = (s: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const rng = (seed: string) => {
  let a = fnv(seed)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const digits = (r: () => number, n: number): string =>
  Array.from({ length: n }, () => Math.floor(r() * 10)).join('')

const fromSet = (r: () => number, set: string, n: number): string =>
  Array.from({ length: n }, () => set[Math.floor(r() * set.length)]).join('')

// Copia el formato (espacios, guiones, puntos) del original sobre el valor nuevo
const reshape = (original: string, compactNew: string): string => {
  let i = 0
  let out = ''
  for (const ch of original) {
    if (/[A-Za-z0-9]/.test(ch)) out += compactNew[i++] ?? ''
    else out += ch
  }
  return out + compactNew.slice(i)
}

export const compact = (s: string): string => s.replace(/[^A-Za-z0-9@._+-]/g, '').replace(/[-]/g, '')

// ---------- validación ----------

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE'
export const dniLetter = (n: number): string => DNI_LETTERS[n % 23]!

export const isDni = (s: string): boolean => {
  const m = /^(\d{8})([A-Z])$/i.exec(s.replace(/[\s.-]/g, ''))
  return !!m && dniLetter(Number(m[1])) === m[2]!.toUpperCase()
}

export const isNie = (s: string): boolean => {
  const m = /^([XYZ])(\d{7})([A-Z])$/i.exec(s.replace(/[\s.-]/g, ''))
  if (!m) return false
  const n = Number('XYZ'.indexOf(m[1]!.toUpperCase()) + m[2]!)
  return dniLetter(n) === m[3]!.toUpperCase()
}

const mod97 = (numeric: string): number => {
  let r = 0
  for (const ch of numeric) r = (r * 10 + Number(ch)) % 97
  return r
}

const ibanNumeric = (bban: string, country: string, check: string): string =>
  (bban + country + check)
    .toUpperCase()
    .split('')
    .map(c => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c))
    .join('')

export const isIbanEs = (s: string): boolean => {
  const c = s.replace(/[\s-]/g, '').toUpperCase()
  if (!/^ES\d{22}$/.test(c)) return false
  return mod97(ibanNumeric(c.slice(4), 'ES', c.slice(2, 4))) === 1
}

const cccDigit = (ten: string): number => {
  const w = [1, 2, 4, 8, 5, 10, 9, 7, 3, 6]
  const sum = ten.split('').reduce((s, d, i) => s + Number(d) * w[i]!, 0)
  const d = 11 - (sum % 11)
  return d === 11 ? 0 : d === 10 ? 1 : d
}

const ibanEsFrom = (bank: string, branch: string, account: string): string => {
  const dc = `${cccDigit('00' + bank + branch)}${cccDigit(account)}`
  const bban = bank + branch + dc + account
  const check = String(98 - mod97(ibanNumeric(bban, 'ES', '00'))).padStart(2, '0')
  return `ES${check}${bban}`
}

// ---------- detección ----------

const SECRET = [
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/,
  /gh[pousr]_[A-Za-z0-9]{36,}/,
  /github_pat_[A-Za-z0-9_]{50,}/,
  /AKIA[0-9A-Z]{16}/,
  /xox[abposr]-[A-Za-z0-9-]{10,}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /glpat-[A-Za-z0-9_-]{20,}/,
]

const PATTERN = new RegExp(
  [
    `(?<iban>\\bES\\d{2}(?:[ -]?\\d{4}){5}\\b)`,
    `(?<nie>\\b[XYZxyz][-. ]?\\d{7}[-. ]?[A-Za-z]\\b)`,
    `(?<dni>\\b\\d{8}[- ]?[A-Za-z]\\b)`,
    `(?<email>\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b)`,
    `(?<telefono>(?<![\\w+])(?:(?:\\+|00)34[ -]?)?[6789]\\d{2}(?:[ -]?\\d){6}(?![\\w]))`,
    `(?<secreto>${SECRET.map(r => r.source).join('|')})`,
  ].join('|'),
  'g',
)

// ---------- falsos ----------

const fakeFor = (kind: Kind, real: string, r: () => number): string => {
  switch (kind) {
    case 'dni': {
      const n = digits(r, 8)
      return reshape(real, n + dniLetter(Number(n)))
    }
    case 'nie': {
      const p = 'XYZ'[Math.floor(r() * 3)]!
      const n = digits(r, 7)
      return reshape(real, p + n + dniLetter(Number('XYZ'.indexOf(p) + n)))
    }
    case 'iban': {
      const c = real.replace(/[\s-]/g, '')
      return reshape(real, ibanEsFrom(c.slice(4, 8), digits(r, 4), digits(r, 10)))
    }
    case 'telefono': {
      const all = real.replace(/\D/g, '')
      const national = all.slice(-9)
      const keep = /^[67]/.test(national) ? 1 : 3 // móvil: 6/7; fijo: prefijo provincial
      const newDigits = all.slice(0, all.length - 9) + national.slice(0, keep) + digits(r, 9 - keep)
      let i = 0
      return real.replace(/\d/g, () => newDigits[i++]!)
    }
    case 'email': {
      const at = real.lastIndexOf('@')
      return `persona.${fromSet(r, 'abcdefghijkmnpqrstuvwxyz23456789', 6)}${real.slice(at)}`
    }
    case 'secreto': {
      const m = /^(sk-ant-|sk-proj-|sk-|gh[pousr]_|github_pat_|AKIA|xox[abposr]-|AIza|glpat-)/.exec(real)
      const prefix = m?.[1] ?? ''
      const rest = real.slice(prefix.length)
      const set = /^AKIA/.test(prefix)
        ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      return prefix + rest.replace(/[A-Za-z0-9]/g, () => fromSet(r, set, 1))
    }
  }
}

const isValid = (kind: Kind, s: string): boolean =>
  kind === 'dni' ? isDni(s) : kind === 'nie' ? isNie(s) : kind === 'iban' ? isIbanEs(s) : true

const remember = (v: Vault, real: string, fake: string) => {
  v.toFake[real] = fake
  v.toReal[fake] = real
  const cr = compact(real)
  const cf = compact(fake)
  if (cf !== fake && cr !== cf && !(cf in v.toReal)) v.toReal[cf] = cr
}

export const fakeOf = (v: Vault, kind: Kind, real: string): string => {
  const known = v.toFake[real]
  if (known) return known
  for (let attempt = 0; ; attempt++) {
    const fake = fakeFor(kind, real, rng(`${v.salt}|${kind}|${compact(real)}|${attempt}`))
    const clash = fake === real || fake in v.toReal || fake in v.toFake
    if (!clash || attempt > 20) {
      remember(v, real, fake)
      return fake
    }
  }
}

// Cambia los datos reales del texto por sus falsos. Devuelve cuántos cambió.
export const mask = (
  v: Vault,
  text: string,
  enabled: ReadonlySet<Kind>,
): { text: string; count: number } => {
  let count = 0
  const out = text.replace(PATTERN, (match, ...args) => {
    const groups = args[args.length - 1] as Record<string, string | undefined>
    const kind = (Object.keys(groups) as Kind[]).find(k => groups[k] !== undefined)
    if (!kind || !enabled.has(kind)) return match
    if (match in v.toReal) return match // ya es un falso
    if (!isValid(kind, match)) return match
    count++
    return fakeOf(v, kind, match)
  })
  return { text: out, count }
}

// Cambia los falsos que escribe Claude por los datos reales (antes de ejecutar)
export const unmask = (v: Vault, text: string): string => {
  const fakes = Object.keys(v.toReal)
  if (fakes.length === 0 || text.length === 0) return text
  const re = new RegExp(
    fakes
      .sort((a, b) => b.length - a.length)
      .map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|'),
    'g',
  )
  return text.replace(re, f => v.toReal[f] ?? f)
}

// Recorre la entrada de una herramienta y desenmascara todos sus textos
export const unmaskDeep = <T>(v: Vault, value: T): T => {
  if (typeof value === 'string') return unmask(v, value) as T
  if (Array.isArray(value)) return value.map(x => unmaskDeep(v, x)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(value)) out[k] = unmaskDeep(v, x)
    return out as T
  }
  return value
}

export type Block = { type: string; [field: string]: unknown }

export const mapText = (
  blocks: readonly Block[],
  fn: (text: string) => string,
): { blocks: Block[]; changed: boolean } => {
  let changed = false
  const apply = (t: string) => {
    const o = fn(t)
    if (o !== t) changed = true
    return o
  }
  const out = blocks.map(b => {
    if (b.type === 'text' && typeof b.text === 'string') return { ...b, text: apply(b.text) }
    if (b.type === 'tool_result') {
      if (typeof b.content === 'string') return { ...b, content: apply(b.content) }
      if (Array.isArray(b.content)) {
        return {
          ...b,
          content: (b.content as Block[]).map(c =>
            c.type === 'text' && typeof c.text === 'string' ? { ...c, text: apply(c.text) } : c,
          ),
        }
      }
    }
    return b
  })
  return { blocks: out, changed }
}
