'use client'
import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import type { KeywordDrawerRef } from './keywordListDrawerRef'

type DrawerComponent = React.ComponentType<React.RefAttributes<KeywordDrawerRef>>
/** Imports a drawer only on demand and preserves the first click/mode while its chunk loads. */
export function lazyKeywordDrawer(load: () => Promise<DrawerComponent>) {
  return forwardRef<KeywordDrawerRef>(function LazyKeywordDrawer(_props, ref) {
    const [Component, setComponent] = useState<DrawerComponent | null>(null)
    const [error, setError] = useState(false)
    const [loading, setLoading] = useState(false)
    const current = useRef<KeywordDrawerRef | null>(null)
    const pending = useRef<{ mode?: string } | null>(null)
    const importing = useRef(false)
    const startLoad = useCallback(() => {
      if (importing.current) return
      importing.current = true
      setError(false)
      setLoading(true)
      void load().then(component => setComponent(() => component)).catch(() => setError(true)).finally(() => {
        importing.current = false
        setLoading(false)
      })
    }, [])
    const attach = useCallback((drawer: KeywordDrawerRef | null) => {
      current.current = drawer
      if (drawer && pending.current) {
        const { mode } = pending.current
        pending.current = null
        drawer.open(mode)
      }
    }, [])
    useImperativeHandle(ref, () => ({
      open(mode) {
        if (current.current) current.current.open(mode)
        else { pending.current = { mode }; startLoad() }
      },
      close() { pending.current = null; current.current?.close(); setError(false) },
    }), [startLoad])
    if (Component) return <Component ref={attach} />
    if (error) return <span role="alert">加载失败。<button type="button" onClick={startLoad}>重试</button></span>
    return loading ? <span role="status" aria-live="polite">正在加载…</span> : null
  })
}
