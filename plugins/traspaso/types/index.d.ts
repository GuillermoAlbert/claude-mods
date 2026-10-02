export type TraspasoKey = string

declare module 'claude-code' {
  interface PluginState {
    traspaso: {
      hechos: TraspasoKey[]
      ultimo: string | null
    }
  }
}
