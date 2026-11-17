import { api } from './api'
import { useEffect, useRef, useState, useCallback } from 'react'

export interface Row { [k: string]: string }

/** Parse oclif-style tables: header line, dashed separator, then rows. */
export function parseTable(text: string): Row[] {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''))
  const sep = lines.findIndex((l) => /^-{2,}(\s+-{2,})*\s*$/.test(l.trim()) && l.includes('-'))
  if (sep < 1) return []
  const starts: number[] = []
  const re = /-+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(lines[sep]))) starts.push(m.index)
  const cut = (l: string, i: number): string =>
    l.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : undefined).trim()
  const head = starts.map((_, i) => cut(lines[sep - 1], i))
  const rows: Row[] = []
  for (const l of lines.slice(sep + 1)) {
    if (!l.trim()) continue
    const r: Row = {}
    head.forEach((h, i) => (r[h] = cut(l, i)))
    rows.push(r)
  }
  return rows
}

export interface Plugin { displayName: string; packageName: string; enabled: boolean; description?: string }

export function parsePlugins(text: string): Plugin[] | null {
  const m = text.match(/--- BEGIN_PLUGIN_LIST_JSON ---\s*([\s\S]*?)\s*--- END_PLUGIN_LIST_JSON ---/)
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
}

export function tryJson<T = any>(text: string): T | null {
  const i = text.indexOf('{')
  if (i < 0) return null
  try { return JSON.parse(text.slice(i)) } catch { return null }
}

/** Split a command line honoring simple quotes. */
export function splitArgs(s: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

let seq = 0
export const newId = (): string => `s${Date.now()}_${seq++}`

/** Stream a command; accumulates text, exposes running state. */
export function useStream(): {
  text: string; running: boolean; code: number | null
  start: (args: string[], opts?: { npm?: string }) => void
  stop: () => void; clear: () => void; append: (t: string) => void
} {
  const [text, setText] = useState('')
  const [running, setRunning] = useState(false)
  const [code, setCode] = useState<number | null>(null)
  const idRef = useRef<string | null>(null)
  useEffect(() => {
    const a = api.onChunk((c) => c.id === idRef.current && setText((t) => (t + c.text).slice(-400_000)))
    const b = api.onEnd((e) => {
      if (e.id !== idRef.current) return
      if (e.error) setText((t) => t + `\n${e.error}\n`)
      setRunning(false); setCode(e.code); idRef.current = null
    })
    return () => { a(); b(); if (idRef.current) api.kill(idRef.current) }
  }, [])
  const start = useCallback((args: string[], opts?: { npm?: string }) => {
    if (idRef.current) api.kill(idRef.current)
    const id = newId()
    idRef.current = id
    setRunning(true); setCode(null)
    if (opts?.npm) api.installCli(id, opts.npm)
    else api.stream(id, args)
  }, [])
  const stop = useCallback(() => { if (idRef.current) api.kill(idRef.current) }, [])
  const clear = useCallback(() => setText(''), [])
  const append = useCallback((t: string) => setText((x) => x + t), [])
  return { text, running, code, start, stop, clear, append }
}
