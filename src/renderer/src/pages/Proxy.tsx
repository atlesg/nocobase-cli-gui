import { api } from '../api'
import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../ctx'

type Prov = 'nginx' | 'caddy'

export default function Proxy(): JSX.Element {
  const { sel, task } = useApp()
  const [prov, setProv] = useState<Prov>('nginx')
  const [driver, setDriver] = useState('-')
  const [info, setInfo] = useState('')
  const [host, setHost] = useState('')
  const [force, setForce] = useState(false)

  const load = useCallback(async () => {
    const [c, i] = await Promise.all([api.run(['proxy', prov, 'current']), api.run(['proxy', prov, 'info'])])
    setDriver(c.code === 0 ? c.out.trim() : '-')
    setInfo(((i.out || '') + (i.err || '')).trim())
  }, [prov])
  useEffect(() => { load() }, [load])

  const run = (label: string, sub: string[], cb?: () => void): void => task(`${prov} ${label}`, ['proxy', prov, ...sub], cb)

  return (
    <>
      <div className="head">
        <h1>Reverse proxy</h1>
        <select value={prov} onChange={(e) => setProv(e.target.value as Prov)}><option>nginx</option><option>caddy</option></select>
        <button className="b" onClick={load}>Refresh</button>
      </div>
      <div className="body">
        <div className="sect">
          <h2>Runtime</h2>
          <div className="row" style={{ marginBottom: 8 }}>
            <span>Driver:</span>
            <select value={driver} onChange={(e) => run(`use ${e.target.value}`, ['use', e.target.value], load)}>
              {!['local', 'docker'].includes(driver) && <option>{driver}</option>}
              <option>local</option><option>docker</option>
            </select>
            <button className="b" onClick={() => run('status', ['status'])}>Status</button>
            <button className="b pri" onClick={() => run('start', ['start'], load)}>Start</button>
            <button className="b" onClick={() => run('reload', ['reload'])}>Reload</button>
            <button className="b" onClick={() => run('restart', ['restart'], load)}>Restart</button>
            <button className="b" onClick={() => run('stop', ['stop'], load)}>Stop</button>
          </div>
          <pre className="mono mute" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{info}</pre>
        </div>
        <div className="sect">
          <h2>Generate config for “{sel || 'no env'}”</h2>
          <div className="row">
            <input value={host} placeholder="app.example.com" onChange={(e) => setHost(e.target.value)} style={{ width: 220 }} />
            <label><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> overwrite</label>
            <button className="b pri" disabled={!sel} onClick={() => run('generate', ['generate', '-e', sel, ...(host ? ['--host', host] : []), ...(force ? ['--force'] : [])], load)}>Generate</button>
          </div>
          <p className="mute">Use a domain, a reverse proxy and HTTPS for production instead of IP:port.</p>
        </div>
      </div>
    </>
  )
}
