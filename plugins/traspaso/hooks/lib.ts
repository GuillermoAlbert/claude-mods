export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export const LABELS: Record<string, string> = {
  five_hour: 'la sesión de 5 h',
  seven_day: 'el límite semanal',
  spend_limit: 'el límite de gasto',
}

export const limitLabel = (kind: string): string =>
  LABELS[kind] ?? `el límite ${kind.replace(/_/g, ' ')}`

export const handoffPrompt = (reason: string): string =>
  `[Traspaso automático: ${reason}]\n\n` +
  'Escribe un documento de traspaso para que una sesión NUEVA, que no ha visto esta conversación, ' +
  'continúe exactamente donde estamos sin repetir trabajo. En Markdown y con estas secciones:\n\n' +
  '## Objetivo\nQué se está intentando conseguir y para qué.\n\n' +
  '## Estado\nQué está hecho, qué está a medias (en qué punto exacto) y qué falta. Con rutas de archivos.\n\n' +
  '## Decisiones\nLo que se ha decidido y por qué, y lo que se descartó.\n\n' +
  '## Pendiente del usuario\nPreguntas, permisos o decisiones que se le estaban esperando, si los hay.\n\n' +
  '## Próximos pasos\nLista numerada, concreta y en orden.\n\n' +
  '## Referencia\nArchivos clave, comandos para compilar y probar, ramas, URLs y cualquier dato que no se deduzca del código.\n\n' +
  'Sé concreto y completo, sin relleno. Responde solo con el documento.'

export const resumePrompt = (path: string): string =>
  `Lee ${path} y continúa el trabajo desde "Próximos pasos". ` +
  'Antes de cambiar nada, resume en tres líneas dónde estamos y qué vas a hacer primero.'

// 2026-10-02T08:41:07.123Z → 2026-10-02_0841
export const stamp = (ms: number): string => {
  const iso = new Date(ms).toISOString()
  return `${iso.slice(0, 10)}_${iso.slice(11, 13)}${iso.slice(14, 16)}`
}

export const document = (reason: string, ms: number, body: string): string =>
  `<!-- Traspaso generado por el mod traspaso · ${new Date(ms).toISOString()} · motivo: ${reason} -->\n\n` +
  body.trim() +
  '\n'

export const ntfyUrl = (setting: string): string | null => {
  const s = setting.trim()
  if (!s) return null
  if (/^https?:\/\//.test(s)) return s
  return `https://ntfy.sh/${encodeURIComponent(s)}`
}

// Qué límites han cruzado el umbral y aún no tuvieron traspaso
export const limitTriggers = (
  limits: readonly Limit[],
  threshold: number,
  done: readonly string[],
): { key: string; reason: string }[] =>
  limits
    .filter(l => l.percentUsed >= threshold)
    .map(l => ({
      key: `limite:${l.kind}:${l.resetsAt ?? ''}`,
      reason: `${limitLabel(l.kind)} está al ${Math.round(l.percentUsed)}%`,
    }))
    .filter(t => !done.includes(t.key))
