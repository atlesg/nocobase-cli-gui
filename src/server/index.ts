import http from 'http'
import { createReadStream, existsSync, statSync, readFileSync, readdirSync, chmodSync } from 'fs'
import { join, extname, dirname, normalize as pnormalize, sep } from 'path'
import { fileURLToPath } from 'url'
import { randomBytes, timingSafeEqual } from 'crypto'
import { spawn, execFileSync, execFile, ChildProcessWithoutNullStreams } from 'child_process'
import { createRequire } from 'module'
import { homedir } from 'os'
import { WebSocketServer, WebSocket } from 'ws'

const isWin = process.platform === 'win32'
const DEV = !!process.env.NB_GUI_DEV
const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = existsSync(join(HERE, 'web')) ? join(HERE, 'web') : join(HERE, '..', '..', 'dist', 'web')
const PORT = Number(process.env.PORT || process.argv.find((a) => a.startsWith('--port='))?.slice(7) || 4173)
const NO_OPEN = process.argv.includes('--no-open')
const TOKEN = DEV ? 'dev' : randomBytes(24).toString('hex')
const VERSION = ((): string => {
  for (const rel of ['..', '../..']) {
    try { return JSON.parse(readFileSync(join(HERE, rel, 'package.json'), 'utf8')).version } catch { /* next */ }
  }
  return '0.0.0'
})()

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g
const strip = (s: string): string => s.replace(ANSI, '')

/** Recover the login-shell PATH so `nb` is found when launched from a launcher/Finder. */
function fixPath(): void {
  if (isWin) return
  try {
    const out = execFileSync(process.env.SHELL || '/bin/sh', ['-ilc', 'echo -n "__P__$PATH__P__"'], { timeout: 4000 }).toString()
    const m = out.match(/__P__(.*)__P__/s)
    if (m?.[1]) process.env.PATH = `${m[1]}:${process.env.PATH ?? ''}`
  } catch { /* keep current PATH */ }
}

// ---------- nb runner ----------
const TOPICS = ['env', 'app', 'db', 'plugin', 'license', 'source', 'config', 'self', 'session', 'backup', 'api']
const NOT_FOUND = /command .* not found/i

/** `env list` -> `env:list` first (always dispatches), spaced form is the fallback. */
function normalize(args: string[]): string[] {
  const [a, b, ...rest] = args
  return a && b && TOPICS.includes(a) && !b.startsWith('-') && /^[a-z]+$/.test(b) ? [`${a}:${b}`, ...rest] : args
}
function alternate(args: string[]): string[] | null {
  const n = normalize(args)
  return n[0]?.includes(':') ? [...n[0].split(':'), ...n.slice(1)] : null
}
/** On Windows nb is a .cmd run through a shell, so quote args to avoid metacharacter injection. */
const winQuote = (a: string): string => (/^[\w@:./=,+-]+$/.test(a) ? a : `"${a.replace(/"/g, '""').replace(/%/g, '%%')}"`)
function launch(args: string[], raw = false): ChildProcessWithoutNullStreams {
  const a = raw ? args : normalize(args)
  return spawn('nb', isWin ? a.map(winQuote) : a, { shell: isWin, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } })
}

interface Result { code: number; out: string; err: string; missing: boolean }
function runOnce(args: string[], raw = false): Promise<Result> {
  return new Promise((resolve) => {
    let out = '', err = ''
    const p = launch(args, raw)
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('error', (e) => resolve({ code: -1, out: '', err: e.message, missing: (e as NodeJS.ErrnoException).code === 'ENOENT' }))
    p.on('close', (code) => resolve({ code: code ?? -1, out: strip(out), err: strip(err), missing: isWin && /not recognized/i.test(err) }))
  })
}
async function run(args: string[]): Promise<Result> {
  const r = await runOnce(args)
  const alt = alternate(args)
  return r.code !== 0 && alt && NOT_FOUND.test(r.out + r.err) ? runOnce(alt, true) : r
}

// ---------- security ----------
const hostOk = (h?: string): boolean => !!h && /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(h)
function tokenOk(t: string | undefined): boolean {
  if (DEV) return true
  if (!t) return false
  const a = Buffer.from(t), b = Buffer.from(TOKEN)
  return a.length === b.length && timingSafeEqual(a, b)
}
const cookieOf = (req: http.IncomingMessage): string | undefined =>
  req.headers.cookie?.split(/;\s*/).find((c) => c.startsWith('nbgui='))?.slice(6)
const originOk = (req: http.IncomingMessage): boolean => {
  const o = req.headers.origin
  if (!o) return true // same-origin GETs / non-browser clients carry no Origin; cookie still required
  try { const h = new URL(o).host; return hostOk(h) && (DEV || h === req.headers.host) } catch { return false }
}
const authed = (req: http.IncomingMessage): boolean => hostOk(req.headers.host) && originOk(req) && tokenOk(cookieOf(req))

// ---------- helpers ----------
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.json': 'application/json', '.map': 'application/json'
}
const readBody = (req: http.IncomingMessage): Promise<any> =>
  new Promise((res) => {
    let b = ''
    req.on('data', (d) => { b += d; if (b.length > 1e6) req.destroy() })
    req.on('end', () => { try { res(JSON.parse(b || '{}')) } catch { res({}) } })
  })
const json = (res: http.ServerResponse, code: number, body: unknown): void => {
  res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body))
}
const strArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

function openDetached(cmd: string, args: string[]): boolean {
  try { spawn(cmd, args, { detached: true, stdio: 'ignore', shell: isWin && cmd === 'start' }).unref(); return true } catch { return false }
}
function openPath(p: string): void {
  if (process.platform === 'darwin') openDetached('open', [p])
  else if (isWin) execFile('explorer.exe', [p], () => undefined)
  else openDetached('xdg-open', [p])
}
/** Prefer a chromium "app window" (no tabs/URL bar) so it feels like a desktop app; else default browser. */
function openApp(url: string): void {
  const tries: [string, string[]][] =
    process.platform === 'darwin'
      ? [['open', ['-na', 'Google Chrome', '--args', `--app=${url}`]], ['open', ['-na', 'Microsoft Edge', '--args', `--app=${url}`]], ['open', ['-na', 'Chromium', '--args', `--app=${url}`]]]
      : isWin
        ? [['cmd', ['/c', 'start', '', 'chrome', `--app=${url}`]], ['cmd', ['/c', 'start', '', 'msedge', `--app=${url}`]]]
        : [['google-chrome', [`--app=${url}`]], ['chromium', [`--app=${url}`]], ['microsoft-edge', [`--app=${url}`]]]
  const next = (i: number): void => {
    if (i >= tries.length) return process.platform === 'darwin' ? void openDetached('open', [url]) : isWin ? void execFile('cmd', ['/c', 'start', '', url]) : void openDetached('xdg-open', [url])
    const [c, a] = tries[i]
    execFile(c, a, (err) => err && next(i + 1))
  }
  next(0)
}

// ---------- http ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://x')
  if (!hostOk(req.headers.host)) { res.writeHead(403); return void res.end('bad host') }

  // Entry: /?t=<token> sets the session cookie, then redirects to a clean URL.
  if (url.pathname === '/' && url.searchParams.get('t')) {
    if (!tokenOk(url.searchParams.get('t') ?? undefined)) { res.writeHead(403); return void res.end('bad token') }
    res.writeHead(302, { location: '/', 'set-cookie': `nbgui=${TOKEN}; HttpOnly; SameSite=Strict; Path=/` }); return void res.end()
  }

  if (url.pathname.startsWith('/api/')) {
    if (!authed(req)) return json(res, 401, { error: 'unauthorized' })
    try {
      if (url.pathname === '/api/info') return json(res, 200, { version: VERSION, pty: !!ptyMod, platform: process.platform, home: homedir() })
      if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })
      const b = await readBody(req)
      if (url.pathname === '/api/run') return strArr(b.args) ? json(res, 200, await run(b.args)) : json(res, 400, { error: 'args' })
      if (url.pathname === '/api/openPath' && typeof b.path === 'string') { openPath(b.path); return json(res, 200, {}) }
    } catch (e) { return json(res, 500, { error: String(e) }) }
    return json(res, 404, { error: 'not found' })
  }

  // static
  let decoded: string
  try { decoded = decodeURIComponent(url.pathname) } catch { res.writeHead(400); return void res.end() }
  let rel = pnormalize(decoded).replace(/^([/\\])+/, '')
  if (rel.split(sep).includes('..')) { res.writeHead(400); return void res.end() }
  let file = join(WEB, rel || 'index.html')
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(WEB, 'index.html')
  if (!existsSync(file)) { res.writeHead(404); return void res.end('UI not built. Run: npm run build') }
  const needsAuth = file.endsWith('index.html')
  if (needsAuth && !authed(req)) { res.writeHead(401, { 'content-type': 'text/plain' }); return void res.end('Open the URL printed in the terminal (it contains the access token).') }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' })
  createReadStream(file).pipe(res)
})

// ---------- websocket: streams + pty ----------
type Pty = { onData: (cb: (d: string) => void) => void; onExit: (cb: () => void) => void; write: (d: string) => void; resize: (c: number, r: number) => void; kill: () => void }
let ptyMod: any = null
try {
  const req = createRequire(import.meta.url)
  // some package managers drop the exec bit on node-pty's helper; restore it
  try {
    const base = join(dirname(req.resolve('node-pty/package.json')), 'prebuilds')
    for (const d of readdirSync(base)) chmodSync(join(base, d, 'spawn-helper'), 0o755)
  } catch { /* no prebuilds for this platform */ }
  ptyMod = req('node-pty')
} catch { ptyMod = null }

const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, sock, head) => {
  if (!req.url?.startsWith('/ws') || !authed(req)) { sock.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return void sock.destroy() }
  wss.handleUpgrade(req, sock, head, (ws) => wss.emit('connection', ws))
})

wss.on('connection', (ws: WebSocket) => {
  const procs = new Map<string, { kill: () => void }>()
  const send = (m: unknown): void => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)) }

  const stream = (id: string, args: string[]): void => {
    const alt = alternate(args)
    const go = (a: string[], raw: boolean, canRetry: boolean): void => {
      const p = launch(a, raw)
      procs.set(id, { kill: () => (isWin && p.pid ? spawn('taskkill', ['/pid', String(p.pid), '/T', '/F']) : p.kill('SIGTERM')) })
      let sawOutput = false, early = ''
      const chunk = (s: 'out' | 'err') => (d: Buffer): void => {
        const text = strip(d.toString())
        if (canRetry && !sawOutput && NOT_FOUND.test(early + text)) { early += text; return }
        sawOutput = true; send({ t: 'chunk', id, stream: s, text })
      }
      p.stdout.on('data', chunk('out')); p.stderr.on('data', chunk('err'))
      p.on('error', (e) => send({ t: 'end', id, code: -1, error: e.message }))
      p.on('close', (code) => {
        if (canRetry && code !== 0 && NOT_FOUND.test(early) && alt) return go(alt, true, false)
        if (early && !sawOutput) send({ t: 'chunk', id, stream: 'err', text: early })
        procs.delete(id); send({ t: 'end', id, code: code ?? -1 })
      })
    }
    go(args, false, !!alt)
  }

  ws.on('message', (raw) => {
    let m: any
    try { m = JSON.parse(raw.toString()) } catch { return }
    switch (m.t) {
      case 'stream':
        if (strArr(m.args) && typeof m.id === 'string') {
          stream(m.id, m.args)
        }
        break
      case 'npm':
        if (typeof m.id === 'string' && /^[\w.-]+$/.test(m.channel)) {
          const p = spawn('npm', ['install', '-g', `@nocobase/cli@${m.channel}`], { shell: isWin }) as ChildProcessWithoutNullStreams
          procs.set(m.id, { kill: () => p.kill() })
          p.stdout.on('data', (d) => send({ t: 'chunk', id: m.id, stream: 'out', text: strip(d.toString()) }))
          p.stderr.on('data', (d) => send({ t: 'chunk', id: m.id, stream: 'err', text: strip(d.toString()) }))
          p.on('error', (e) => send({ t: 'end', id: m.id, code: -1, error: e.message }))
          p.on('close', (c) => { procs.delete(m.id); send({ t: 'end', id: m.id, code: c ?? -1 }) })
        }
        break
      case 'kill': procs.get(m.id)?.kill(); procs.delete(m.id); break
      case 'pty-open': {
        if (!ptyMod) return send({ t: 'pty-exit', id: m.id })
        const sh = isWin ? process.env.COMSPEC || 'powershell.exe' : process.env.SHELL || '/bin/sh'
        const p: Pty = ptyMod.spawn(sh, isWin ? [] : ['-l'], { name: 'xterm-256color', cols: m.cols || 80, rows: m.rows || 24, cwd: homedir(), env: process.env })
        procs.set(m.id, { kill: () => p.kill() })
        ptys.set(m.id, p)
        p.onData((d) => send({ t: 'pty-data', id: m.id, data: d }))
        p.onExit(() => { ptys.delete(m.id); procs.delete(m.id); send({ t: 'pty-exit', id: m.id }) })
        break
      }
      case 'pty-write': ptys.get(m.id)?.write(String(m.data)); break
      case 'pty-resize': ptys.get(m.id)?.resize(Number(m.cols), Number(m.rows)); break
    }
  })
  const ptys = new Map<string, Pty>()
  ws.on('close', () => procs.forEach((p) => p.kill()))
})

process.on('uncaughtException', (e) => console.error('uncaught:', e))
process.on('unhandledRejection', (e) => console.error('unhandled:', e))

// ---------- start ----------
fixPath()
function listen(port: number, tries = 20): void {
  server.once('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE' && tries > 0 && !process.env.PORT && !DEV) listen(port + 1, tries - 1)
    else { console.error(e.message); process.exit(1) }
  })
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/?t=${TOKEN}`
    console.log(`\n  NocoBase CLI GUI  v${VERSION}\n  ${url}\n  (Ctrl+C to stop)\n`)
    if (!NO_OPEN && !DEV) openApp(url)
  })
}
listen(PORT)
