// Browser implementation of the bridge the pages use (replaces Electron's preload).
export interface RunResult { code: number; out: string; err: string; missing?: boolean }
export interface Chunk { id: string; stream: 'out' | 'err'; text: string }
export interface End { id: string; code: number; error?: string }

type Handler = (m: any) => void
const handlers = new Set<Handler>()
let ws: WebSocket | null = null
let ready: Promise<WebSocket> | null = null
const queue: string[] = []

function connect(): Promise<WebSocket> {
  if (ready && ws && ws.readyState <= 1) return ready
  ready = new Promise((resolve) => {
    const s = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)
    ws = s
    s.onopen = () => { queue.splice(0).forEach((q) => s.send(q)); resolve(s) }
    s.onmessage = (e) => { const m = JSON.parse(e.data); handlers.forEach((h) => h(m)) }
    s.onclose = () => { ws = null; ready = null }
  })
  return ready
}
function send(m: unknown): void {
  const s = JSON.stringify(m)
  connect().then((c) => c.send(s))
}
const on = <T,>(type: string, fn: (m: T) => void): (() => void) => {
  const h: Handler = (m) => m.t === type && fn(m)
  handlers.add(h); connect()
  return () => handlers.delete(h)
}
const post = async <T,>(path: string, body: unknown): Promise<T> => {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
}

export const api = {
  run: (args: string[]): Promise<RunResult> => post('/api/run', { args }),
  stream: async (id: string, args: string[]): Promise<void> => send({ t: 'stream', id, args }),
  kill: async (id: string): Promise<void> => send({ t: 'kill', id }),
  installCli: async (id: string, channel: string): Promise<void> => send({ t: 'npm', id, channel }),
  open: async (url: string): Promise<void> => void window.open(url, '_blank', 'noopener'),
  openPath: (path: string): Promise<unknown> => post('/api/openPath', { path }),
  /** Browsers can't expose real paths; ask for one. */
  pickFile: async (): Promise<string | null> => prompt('Full path to file:')?.trim() || null,
  pickDir: async (): Promise<string | null> => prompt('Full path to folder:')?.trim() || null,
  onChunk: (fn: (c: Chunk) => void) => on<Chunk>('chunk', fn),
  onEnd: (fn: (e: End) => void) => on<End>('end', fn),
  info: (): Promise<{ version: string; pty: boolean; platform: string; home: string }> => fetch('/api/info').then((r) => r.json()),
  pty: {
    available: (): Promise<boolean> => api.info().then((i) => i.pty),
    open: async (id: string, cols: number, rows: number): Promise<boolean> => (send({ t: 'pty-open', id, cols, rows }), true),
    write: async (id: string, data: string): Promise<void> => send({ t: 'pty-write', id, data }),
    resize: async (id: string, cols: number, rows: number): Promise<void> => send({ t: 'pty-resize', id, cols, rows }),
    kill: async (id: string): Promise<void> => send({ t: 'kill', id }),
    onData: (fn: (id: string, d: string) => void) => on<{ id: string; data: string }>('pty-data', (m) => fn(m.id, m.data))
  }
}
