import { api } from '../api'
import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { splitArgs, useStream, newId } from '../lib'

export default function Terminal(): JSX.Element {
  const [pty, setPty] = useState<boolean | null>(null)
  useEffect(() => { api.pty.available().then(setPty) }, [])
  if (pty === null) return <></>
  return pty ? <PtyTerminal /> : <SimpleTerminal />
}

function PtyTerminal(): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches
    const term = new XTerm({
      fontSize: 12, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', cursorBlink: true,
      theme: dark ? { background: '#111111' } : { background: '#f6f6f6', foreground: '#1a1a1a', cursor: '#1a1a1a', selectionBackground: '#cfe0ff' }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host.current!)
    fit.fit()
    term.focus()
    const id = newId()
    api.pty.open(id, term.cols, term.rows)
    const off = api.pty.onData((i, d) => i === id && term.write(d))
    const sub = term.onData((d) => api.pty.write(id, d))
    const ro = new ResizeObserver(() => { fit.fit(); api.pty.resize(id, term.cols, term.rows) })
    ro.observe(host.current!)
    return () => { off(); sub.dispose(); ro.disconnect(); api.pty.kill(id); term.dispose() }
  }, [nonce])
  return (
    <>
      <div className="head">
        <h1>Terminal <span className="mute">· your login shell</span></h1>
        <button className="b" onClick={() => setNonce(nonce + 1)}>New session</button>
      </div>
      <div ref={host} style={{ flex: 1, minHeight: 0, padding: '6px 8px', background: 'var(--code)' }} />
    </>
  )
}

/** Fallback when node-pty isn't available (e.g. Linux build without native toolchain). */
function SimpleTerminal(): JSX.Element {
  const s = useStream()
  const [v, setV] = useState('')
  const hist = useRef<string[]>([])
  const pos = useRef(0)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight) }, [s.text])
  const submit = (): void => {
    const line = v.trim().replace(/^nb\s+/, '')
    if (!line || s.running) return
    hist.current.push(line); pos.current = hist.current.length
    s.append(`\n$ nb ${line}\n`); s.start(splitArgs(line)); setV('')
  }
  return (
    <>
      <div className="head">
        <h1>Terminal <span className="mute">· runs <span className="mono">nb</span> commands only</span></h1>
        <button className="b" onClick={s.clear}>Clear</button>
        {s.running && <button className="b" onClick={s.stop}>Stop</button>}
      </div>
      <div className="term" ref={box}>{s.text || 'Try: env list · plugin list · --help'}</div>
      <div className="tin">
        <span className="mono mute" style={{ paddingTop: 3 }}>nb</span>
        <input autoFocus value={v} placeholder="command" onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            else if (e.key === 'ArrowUp' && pos.current > 0) { pos.current--; setV(hist.current[pos.current]) }
            else if (e.key === 'ArrowDown' && pos.current < hist.current.length) { pos.current++; setV(hist.current[pos.current] ?? '') }
          }} />
        <button className="b pri" onClick={submit} disabled={s.running}>Run</button>
      </div>
    </>
  )
}
