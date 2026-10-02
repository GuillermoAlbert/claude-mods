export type ProgresoStatus = 'pending' | 'in_progress' | 'completed'

export type ProgresoTask = {
  id: string
  subject: string
  status: ProgresoStatus
  startedAt?: number
  doneAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    progreso: {
      tasks: ProgresoTask[]
      planStartedAt: number | null
      agents: Record<string, string>
      waiting: boolean
      now: number
      hidden: boolean
    }
  }
}
