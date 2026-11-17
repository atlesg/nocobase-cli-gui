import { api } from '../api'
import { useEffect, useState } from 'react'
import { useApp, envArgs, statusDot } from '../ctx'
import { tryJson, parseTable, useStream, Row } from '../lib'

interface Info { app?: Record<string, any>; db?: Record<string, any>; api?: Record<string, any>; kind?: string }

export default function Envs(): JSX.Element {
  const { envs, current, sel, setSel, refresh, task, loading } = useApp()
  const [info, setInfo] = useState<Info | null>(null)
  const [dbRow, setDbRow] = useState<Row | null>(null)
  const [adding, setAdding] = useState(false)
  const [upgrade, setUpgrade] = useState(false)
  const [remove, setRemove] = useState(false)

  const load = async (): Promise<void> => {
    if (!sel) return
    const [i, d] = await Promise.all([api.run(['env', 'info', sel, '--json']), api.run(['db', 'ps'])])
    setInfo(tryJson<Info>(i.out))
    setDbRow(parseTable(d.out).find((r) => r['Env'] === sel) ?? null)
  }
  useEffect(() => { setInfo(null); load() }, [sel])

  const done = (): void => { refresh(); load() }
  const e = envArgs(sel)
  const st = envs.find((x) => x['Name'] === sel)?.['Status'] ?? ''
  const running = /run/i.test(st)
  const a = info?.app ?? {}

  return (
    <>
      <div className="head">
        <h1>Environments</h1>
        <button className="b" onClick={() => refresh()} disabled={loading}>Refresh</button>
        <button className="b pri" onClick={() => setAdding(true)}>New env</button>
      </div>
      <div className="body">
        <div className="split">
          <div>
            {envs.length === 0 ? (
              <div className="empty">{loading ? 'Loading…' : 'No environments yet. Create one with “New env”.'}</div>
            ) : (
              <table>
                <thead><tr><th>Name</th><th>Kind</th><th>Status</th><th>Runtime</th><th>API</th></tr></thead>
                <tbody>
                  {envs.map((r) => (
                    <tr key={r['Name']} className={r['Name'] === sel ? 'sel' : ''} onClick={() => setSel(r['Name'])}>
                      <td>{r['Name']}{r['Name'] === current && <span className="mute"> · current</span>}</td>
                      <td>{r['Kind']}</td>
                      <td><span className={`dot ${statusDot(r['Status'])}`} />{r['Status']}</td>
                      <td>{r['Runtime']}</td>
                      <td className="mono mute">{r['API Base URL']}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="detail">
            {!sel ? <span className="mute">Select an env</span> : (
              <>
                <h2>{sel}</h2>
                <div className="grid">
                  {running
                    ? <>
                        <button className="b" onClick={() => task(`Stop ${sel}`, ['app', 'stop', ...e], done)}>Stop</button>
                        <button className="b" onClick={() => task(`Restart ${sel}`, ['app', 'restart', ...e], done)}>Restart</button>
                      </>
                    : <button className="b pri" onClick={() => task(`Start ${sel}`, ['app', 'start', ...e], done)}>Start</button>}
                  <button className="b" onClick={() => setUpgrade(true)}>Upgrade</button>
                  {a.url && <button className="b" onClick={() => api.open(a.url)}>Open app</button>}
                  {sel !== current && <button className="b" onClick={() => task(`Use ${sel}`, ['env', 'use', sel], done)}>Set current</button>}
                  {a.appPath && <button className="b" onClick={() => api.openPath(a.appPath)}>Open folder</button>}
                  <button className="b dng" onClick={() => setRemove(true)}>Remove</button>
                </div>

                <h3>App</h3>
                <div className="kv">
                  <span>URL</span><span>{a.url ?? '-'}</span>
                  <span>Source</span><span>{a.source ?? '-'} {a.downloadVersion ?? ''}</span>
                  <span>Port</span><span>{a.appPort ?? '-'}</span>
                  <span>Path</span><span className="mono">{a.appPath ?? '-'}</span>
                  <span>Storage</span><span className="mono">{a.storagePath ?? '-'}</span>
                </div>

                <h3>Database</h3>
                <div className="kv">
                  <span>Dialect</span><span>{info?.db?.dbDialect ?? '-'}{info?.db?.builtinDb ? ' · built-in' : ''}</span>
                  <span>Host</span><span>{info?.db?.dbHost ?? '-'}:{info?.db?.dbPort ?? ''}</span>
                  <span>Name</span><span>{info?.db?.dbDatabase ?? '-'}</span>
                  <span>Status</span><span>{dbRow?.['Status'] ?? info?.db?.databaseStatus ?? '-'}</span>
                </div>
                <div className="grid" style={{ marginTop: 8 }}>
                  <button className="b" onClick={() => task(`DB check ${sel}`, ['db', 'check', '-e', sel])}>Check</button>
                  {info?.db?.builtinDb && <>
                    <button className="b" onClick={() => task(`DB start ${sel}`, ['db', 'start', '-e', sel], done)}>Start</button>
                    <button className="b" onClick={() => task(`DB stop ${sel}`, ['db', 'stop', '-e', sel], done)}>Stop</button>
                  </>}
                </div>

                <h3>Backup</h3>
                <div className="grid">
                  <button className="b" onClick={async () => {
                    const d = await api.pickDir()
                    if (d) task(`Backup ${sel}`, ['backup', 'create', '-e', sel, '-y', '-o', d])
                  }}>Create…</button>
                  <button className="b dng" onClick={async () => {
                    const f = await api.pickFile()
                    if (f && confirm(`Restore ${f} into “${sel}”? This overwrites application data.`))
                      task(`Restore ${sel}`, ['backup', 'restore', '-e', sel, '-y', '-f', f, '--force'], done)
                  }}>Restore…</button>
                </div>

                <h3>License</h3>
                <div className="grid">
                  <button className="b" onClick={() => task(`License status`, ['license', 'status', '-e', sel, '-y'])}>Status</button>
                  <button className="b" onClick={() => task(`Instance ID`, ['license', 'id', '-e', sel, '-y'])}>Instance ID</button>
                  <button className="b" onClick={async () => {
                    const f = await api.pickFile()
                    if (f) task('Activate license', ['license', 'activate', '-e', sel, '-y', '--key-file', f])
                  }}>Activate…</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {adding && <NewEnv onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh() }} />}
      {upgrade && <Upgrade env={sel} onClose={() => setUpgrade(false)} onRun={(v) => {
        setUpgrade(false)
        task(`Upgrade ${sel}`, ['app', 'upgrade', ...e, '--force', ...(v ? ['--version', v] : [])], done)
      }} />}
      {remove && (
        <Confirm title={`Remove “${sel}”`} onClose={() => setRemove(false)} extra="Also delete app files and storage data (--purge)"
          onOk={(purge) => { setRemove(false); task(`Remove ${sel}`, ['env', 'remove', sel, '--force', ...(purge ? ['--purge'] : [])], done) }} />
      )}
    </>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }): JSX.Element {
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal"><h2>{title}</h2>{children}</div>
    </div>
  )
}

function Upgrade({ env, onClose, onRun }: { env: string; onClose: () => void; onRun: (v: string) => void }): JSX.Element {
  const [v, setV] = useState('')
  return (
    <Modal title={`Upgrade ${env}`} onClose={onClose}>
      <div className="form"><span>Version</span><input value={v} placeholder="saved version (e.g. latest, beta)" onChange={(x) => setV(x.target.value)} /></div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="b" onClick={onClose}>Cancel</button>
        <button className="b pri" onClick={() => onRun(v.trim())}>Upgrade</button>
      </div>
    </Modal>
  )
}

function Confirm({ title, extra, onClose, onOk }: { title: string; extra: string; onClose: () => void; onOk: (flag: boolean) => void }): JSX.Element {
  const [f, setF] = useState(false)
  return (
    <Modal title={title} onClose={onClose}>
      <p className="mute" style={{ marginTop: 0 }}>The runtime for this env will be stopped first.</p>
      <label style={{ display: 'flex', gap: 6, marginBottom: 14 }}><input type="checkbox" checked={f} onChange={(e) => setF(e.target.checked)} />{extra}</label>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="b" onClick={onClose}>Cancel</button>
        <button className="b dng" onClick={() => onOk(f)}>Remove</button>
      </div>
    </Modal>
  )
}

function NewEnv({ onClose, onDone }: { onClose: () => void; onDone: () => void }): JSX.Element {
  const [name, setName] = useState('')
  const [source, setSource] = useState('docker')
  const [version, setVersion] = useState('latest')
  const [port, setPort] = useState('')
  const [builtin, setBuiltin] = useState(true)
  const s = useStream()
  const url = s.text.match(/https?:\/\/[^\s)]+/)?.[0]
  const started = s.running || s.code !== null

  const quick = (): void =>
    s.start(['init', '--yes', '-e', name.trim(), '--setup-mode', 'install-new', '-s', source, '-v', version.trim() || 'latest',
      ...(port ? ['--app-port', port] : []), ...(builtin ? ['--builtin-db'] : [])])

  return (
    <Modal title="New environment" onClose={() => { s.stop(); onClose() }}>
      {!started ? (
        <>
          <div className="form">
            <span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="app1" autoFocus />
            <span>Source</span>
            <select value={source} onChange={(e) => setSource(e.target.value)}><option>docker</option><option>npm</option><option>git</option></select>
            <span>Version</span><input value={version} onChange={(e) => setVersion(e.target.value)} />
            <span>App port</span><input value={port} onChange={(e) => setPort(e.target.value)} placeholder="auto" />
            <span>Database</span>
            <label><input type="checkbox" checked={builtin} onChange={(e) => setBuiltin(e.target.checked)} /> built-in (Docker)</label>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className="b" onClick={() => s.start(['init', '--ui'])} title="Guided setup in your browser">Browser wizard</button>
            <span className="row">
              <button className="b" onClick={onClose}>Cancel</button>
              <button className="b pri" disabled={!/^[\w-]+$/.test(name.trim())} onClick={quick}>Install</button>
            </span>
          </div>
        </>
      ) : (
        <>
          {url && s.running && <p>Wizard: <a href="#" onClick={(e) => { e.preventDefault(); api.open(url) }}>{url}</a></p>}
          <div className="log" style={{ height: 220, flex: 'none' }}>{s.text}</div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            {s.running ? <button className="b" onClick={s.stop}>Stop</button>
              : <button className="b pri" onClick={onDone}>{s.code === 0 ? 'Done' : 'Close'}</button>}
          </div>
        </>
      )}
    </Modal>
  )
}
