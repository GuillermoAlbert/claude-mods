export type CentinelaLimit = { kind: string; percentUsed: number; resetsAt?: string }

export type CentinelaSnapshot = {
  limits: CentinelaLimit[]
  contextPercent: number | null
}

declare module 'claude-code' {
  interface PluginState {
    centinela: {
      snap: CentinelaSnapshot | null
      lastStepAt: number | null
      now: number
      warned: string[]
      hidden: boolean
    }
  }
}
