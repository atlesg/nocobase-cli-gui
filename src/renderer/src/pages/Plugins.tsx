import { api } from '../api'
import { useCallback, useEffect, useState } from 'react'
import { useApp, envArgs } from '../ctx'
import { parsePlugins, Plugin } from '../lib'

export default function Plugins(): JSX.Element {
  const { sel, task } = useApp()
  const [list, setList] = useState<Plugin[]>([])
  const [q, setQ] = useState('')
  const [f, setF] = useState<'all' | 'on' | 'off'>('all')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (!sel) return
    setBusy(true); setErr('')
    const r = await api.run(['plugin', 'list', ...envArgs(sel)])
    const p = parsePlugins(r.out)
    if (p) setList(p); else { setList([]); setErr((r.err || r.out).trim() || 'Could not read plugin list') }
    setBusy(false)
  }, [sel])
  useEffect(() => { load() }, [load])

  const shown = list.filter((p) =>
    (f === 'all' || (f === 'on') === p.enabled) &&
    `${p.displayName} ${p.packageName}`.toLowerCase().includes(q.toLowerCase()))

  const toggle = (p: Plugin): void =>
    task(`${p.enabled ? 'Disable' : 'Enable'} ${p.displayName}`, ['plugin', p.enabled ? 'disable' : 'enable', ...envArgs(sel), p.packageName], load)

  return (
    <>
      <div className="head">
        <h1>Plugins <span className="mute">· {sel || 'no env'} · {list.filter((p) => p.enabled).length}/{list.length} enabled</span></h1>
        <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 180 }} />
        <select value={f} onChange={(e) => setF(e.target.value as 'all')}>
          <option value="all">All</option><option value="on">Enabled</option><option value="off">Disabled</option>
        </select>
        <button className="b" onClick={load} disabled={busy}>{busy ? 'Loading…' : 'Refresh'}</button>
      </div>
      <div className="body">
        {err && <div className="err-box mono">{err}</div>}
        {!err && (
          <table>
            <thead><tr><th style={{ width: 50 }}>On</th><th>Plugin</th><th>Description</th></tr></thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.packageName}>
                  <td><button className={`sw ${p.enabled ? 'on' : ''}`} onClick={() => toggle(p)} title={p.enabled ? 'Disable' : 'Enable'} /></td>
                  <td><div>{p.displayName}</div><div className="mono mute">{p.packageName}</div></td>
                  <td className="mute">{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
