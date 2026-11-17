import { createContext, useContext } from 'react'
import type { Row } from './lib'

export interface Ctx {
  envs: Row[]
  current: string
  sel: string
  setSel: (n: string) => void
  refresh: () => Promise<void>
  /** Run a command in the bottom task panel. */
  task: (title: string, args: string[], after?: () => void) => void
  loading: boolean
}
export const AppCtx = createContext<Ctx>(null as unknown as Ctx)
export const useApp = (): Ctx => useContext(AppCtx)

export const envArgs = (env: string): string[] => (env ? ['-e', env, '-y'] : [])
export const statusDot = (s: string): string => (/run|ok|up/i.test(s) ? 'ok' : /stop|exit|down|not/i.test(s) ? 'err' : 'warn')
