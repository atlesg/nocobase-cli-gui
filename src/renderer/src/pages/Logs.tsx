import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp, envArgs } from '../ctx'
import { useStream } from '../lib'

export default function Logs(): JSX.Element {
  const { sel } = useApp()
  const s = useStream()
  const [tail, setTail] = useState('200')
  const [q, setQ] = useState('')
  const [follow, setFollow] = useState(true)
  const [paused, setPaused] = useState(false)
  const frozen = useRef('')
  const box = useRef<HTMLDivElement>(null)

  const run = (): void => { s.clear(); if (sel) s.start(['app', 'logs', ...envArgs(sel), '--tail', tail || '200', follow ? '--follow' : '--no-follow']) }
  useEffect(() => { run(); return () => s.stop() }, [sel])

  const raw = paused ? frozen.current : s.text
  const lines = useMemo(() => {
    const all = raw.split('\n')
    return q ? all.filter((l) => l.toLowerCase().includes(q.toLowerCase())) : all
  }, [raw, q])
  useEffect(() => { if (!paused) box.current?.scrollTo(0, box.current.scrollHeight) }, [lines, paused])

  return (
    <>
      <div className="head">
        <h1>Logs <span className="mute">· {sel || 'no env'}</span></h1>
        <input placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 160 }} />
        <input value={tail} onChange={(e) => setTail(e.target.value.replace(/\D/g, ''))} style={{ width: 54 }} title="Tail lines" />
        <label><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> follow</label>
        <button className="b" onClick={() => { if (!paused) frozen.current = s.text; setPaused(!paused) }}>{paused ? 'Resume' : 'Pause'}</button>
        <button className="b" onClick={() => navigator.clipboard.writeText(lines.join('\n'))}>Copy</button>
        <button className="b" onClick={run}>{s.running ? 'Restart' : 'Reload'}</button>
      </div>
      <div className="log" ref={box} style={{ margin: 0 }}>
        {lines.map((l, i) => <div key={i} className={/error|fatal/i.test(l) ? 'e' : /warn/i.test(l) ? 'w' : ''}>{l || ' '}</div>)}
        {!s.text && !s.running && <span className="mute">No output{s.code ? ` (exit ${s.code})` : ''}</span>}
      </div>
    </>
  )
}
