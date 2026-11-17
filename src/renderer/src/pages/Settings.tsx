import { api } from '../api'
import { useCallback, useEffect, useState } from 'react'
import { parseTable, useStream, Row } from '../lib'

const KEYS = ['update.policy', 'default-ui-host', 'default-api-host', 'locale', 'docker.network', 'docker.container-prefix']

export default function Settings({ onInstalled }: { onInstalled: () => void }): JSX.Element {
  const [ver, setVer] = useState<string | null>(null)
  const [check, setCheck] = useState<Row[]>([])
  const [cfg, setCfg] = useState('')
  const [key, setKey] = useState(KEYS[0])
  const [val, setVal] = useState('')
  const [channel, setChannel] = useState('alpha')
  const [msg, setMsg] = useState('')
  const inst = useStream()

  const load = useCallback(async () => {
    const v = await api.run(['--version'])
    const ok = v.code === 0 && !v.missing
    setVer(ok ? v.out.trim().split(' ')[0] : null)
    if (!ok) return
    const [c, l] = await Promise.all([api.run(['self', 'check']), api.run(['config', 'list'])])
    setCheck(parseTable(c.out)); setCfg((l.out || l.err).trim())
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (!inst.running && inst.code === 0) { load(); onInstalled() } }, [inst.running, inst.code])

  const field = (n: string): string => check.find((r) => r['Field'] === n)?.['Value'] ?? '-'
  const set = async (): Promise<void> => {
    const r = await api.run(['config', 'set', key, val])
    setMsg(r.code === 0 ? 'Saved' : (r.err || r.out).trim()); load()
  }

  return (
    <>
      <div className="head"><h1>Settings</h1></div>
      <div className="body">
        <div className="sect">
          <h2>CLI</h2>
          <div className="kv" style={{ maxWidth: 380, marginBottom: 10 }}>
            <span>Installed</span><span>{ver ?? 'not found'}</span>
            <span>Latest</span><span>{field('Latest version')}</span>
            <span>Install</span><span>{field('Install method')}</span>
            <span>Auto-update</span><span>{field('Auto-update')}</span>
          </div>
          <div className="row">
            <select value={channel} onChange={(e) => setChannel(e.target.value)}><option>alpha</option><option>beta</option><option>latest</option></select>
            <button className="b pri" disabled={inst.running} onClick={() => { inst.clear(); inst.start([], { npm: channel }) }}>
              {ver ? 'Update CLI' : 'Install CLI'}
            </button>
            <span className="mute mono">npm i -g @nocobase/cli@{channel}</span>
          </div>
          {inst.text && <div className="log" style={{ marginTop: 10, maxHeight: 160, flex: 'none' }}>{inst.text}</div>}
        </div>
        {ver && (
          <>
            <div className="sect">
              <h2>Config</h2>
              <div className="row" style={{ marginBottom: 8 }}>
                <input list="keys" value={key} onChange={(e) => setKey(e.target.value)} style={{ width: 190 }} />
                <datalist id="keys">{KEYS.map((k) => <option key={k} value={k} />)}</datalist>
                <input value={val} placeholder="value" onChange={(e) => setVal(e.target.value)} style={{ width: 200 }} />
                <button className="b" disabled={!key || !val} onClick={set}>Set</button>
                <button className="b" disabled={!key} onClick={async () => { await api.run(['config', 'delete', key]); load() }}>Unset</button>
                <span className="mute">{msg}</span>
              </div>
              <pre className="mono mute" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{cfg}</pre>
            </div>
            <div className="sect">
              <h2>Session</h2>
              <p className="mute" style={{ marginTop: 0 }}>Give each terminal its own current env (shell integration for NB_SESSION_ID).</p>
              <div className="row">
                <button className="b" onClick={async () => setMsg((await api.run(['session', 'setup'])).out.trim())}>Setup</button>
                <button className="b" onClick={async () => setMsg((await api.run(['session', 'remove'])).out.trim())}>Remove</button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
