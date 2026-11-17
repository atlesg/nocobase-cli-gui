import { api } from './api'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppCtx } from './ctx'
import { parseTable, useStream, Row } from './lib'
import Envs from './pages/Envs'
import Plugins from './pages/Plugins'
import Logs from './pages/Logs'
import Terminal from './pages/Terminal'
import Proxy from './pages/Proxy'
import Settings from './pages/Settings'

const PAGES = ['Environments', 'Plugins', 'Logs', 'Terminal', 'Proxy', 'Settings'] as const
type Page = (typeof PAGES)[number]

export default function App(): JSX.Element {
  const [page, setPage] = useState<Page>('Environments')
  const [envs, setEnvs] = useState<Row[]>([])
  const [current, setCurrent] = useState('')
  const [sel, setSel] = useState('')
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const t = useStream()
  const after = useRef<(() => void) | undefined>()
  const logRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    let list, status
    try {
      ;[list, status] = await Promise.all([api.run(['env', 'list']), api.run(['env', 'status', '--all'])])
    } catch (e) {
      setLoadErr(`Cannot reach the local server (${(e as Error).message}). Reopen the app from the URL printed in the terminal.`)
      setLoading(false); return
    }
    setLoadErr('')
    if (list.missing || (list.code !== 0 && /ENOENT|not found|not recognized/i.test(list.err + list.out) && !list.out.includes('Name'))) {
      setMissing(true); setEnvs([]); setLoading(false); return
    }
    setMissing(false)
    const st = new Map(parseTable(status.out).map((r) => [r['Env'], r]))
    const rows: Row[] = parseTable(list.out).map((r) => ({ ...r, Status: st.get(r['Name'])?.['Status'] ?? '-' }))
    setEnvs(rows)
    const cur = rows.find((r) => r['Current'] === '*')?.['Name'] ?? ''
    setCurrent(cur)
    setSel((s) => (rows.some((r) => r['Name'] === s) ? s : cur || rows[0]?.['Name'] || ''))
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, [t.text])
  useEffect(() => {
    if (!t.running && t.code !== null) { after.current?.(); after.current = undefined }
  }, [t.running, t.code])

  const task = useCallback((title: string, args: string[], cb?: () => void) => {
    t.clear(); setTaskTitle(`${title}`); after.current = cb
    t.append(`$ nb ${args.join(' ')}\n`)
    t.start(args)
  }, [t])

  const open = taskTitle !== ''
  return (
    <AppCtx.Provider value={{ envs, current, sel, setSel, refresh, task, loading }}>
      <div className="app">
        <aside className="side">
          <div className="brand">NocoBase CLI</div>
          <nav className="nav">
            {PAGES.map((p) => (
              <button key={p} className={p === page ? 'on' : ''} onClick={() => setPage(p)}>{p}</button>
            ))}
          </nav>
          <div className="sp" />
          {envs.length > 0 && (
            <div className="cur">
              Active env
              <select value={sel} onChange={(e) => setSel(e.target.value)}>
                {envs.map((e) => <option key={e['Name']}>{e['Name']}</option>)}
              </select>
            </div>
          )}
        </aside>
        <main className="main">
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {loadErr ? <div className="err-box">{loadErr}</div> : missing && page !== 'Settings' && page !== 'Terminal' ? (
              <div className="empty">
                <p><b>nb CLI not found.</b></p>
                <p>Install it from Settings → CLI, or run <span className="mono">npm i -g @nocobase/cli@alpha</span>.</p>
                <button className="b pri" onClick={() => setPage('Settings')}>Open Settings</button>
              </div>
            ) : page === 'Environments' ? <Envs />
              : page === 'Plugins' ? <Plugins />
              : page === 'Logs' ? <Logs />
              : page === 'Terminal' ? <Terminal />
              : page === 'Proxy' ? <Proxy />
              : <Settings onInstalled={refresh} />}
          </div>
          {open && (
            <div className="task">
              <div className="th">
                <span className={`dot ${t.running ? 'warn' : t.code === 0 ? 'ok' : 'err'}`} />
                <b>{taskTitle}{t.running ? '…' : t.code === 0 ? ' — done' : ` — exit ${t.code}`}</b>
                {t.running && <button className="b" onClick={t.stop}>Stop</button>}
                <button className="b" onClick={() => { t.stop(); setTaskTitle('') }}>Close</button>
              </div>
              <div className="log" ref={logRef}>{t.text}</div>
            </div>
          )}
        </main>
      </div>
    </AppCtx.Provider>
  )
}
