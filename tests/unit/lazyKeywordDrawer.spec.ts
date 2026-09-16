import React, { createRef, forwardRef, useImperativeHandle } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { lazyKeywordDrawer } from '@/components/LazyKeywordDrawer'
import type { KeywordDrawerRef } from '@/components/keywordListDrawerRef'
afterEach(cleanup)
it('loads only on click, preserves the initial mode, and reuses the mounted drawer', async () => {
  const open = vi.fn()
  const close = vi.fn()
  const Drawer = forwardRef<KeywordDrawerRef>(function Drawer(_props, ref) { useImperativeHandle(ref, () => ({ open, close })); return null })
  const load = vi.fn(async () => Drawer)
  const Lazy = lazyKeywordDrawer(load)
  const ref = createRef<KeywordDrawerRef>()
  render(React.createElement(Lazy, { ref }))
  expect(load).not.toHaveBeenCalled()
  await act(async () => ref.current!.open('comparison_decision'))
  await waitFor(() => expect(open).toHaveBeenCalledWith('comparison_decision'))
  act(() => ref.current!.close())
  act(() => ref.current!.open('high_commission_affiliate'))
  expect(close).toHaveBeenCalledTimes(1)
  expect(open).toHaveBeenLastCalledWith('high_commission_affiliate')
  expect(load).toHaveBeenCalledTimes(1)
})
it('reports a failed chunk and retries the original action', async () => {
  const open = vi.fn()
  const Drawer = forwardRef<KeywordDrawerRef>(function Drawer(_props, ref) { useImperativeHandle(ref, () => ({ open, close: vi.fn() })); return null })
  const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(Drawer)
  const Lazy = lazyKeywordDrawer(load)
  const ref = createRef<KeywordDrawerRef>()
  render(React.createElement(Lazy, { ref }))
  await act(async () => ref.current!.open('high_commission_affiliate'))
  expect(screen.getByRole('alert')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  await waitFor(() => expect(open).toHaveBeenCalledWith('high_commission_affiliate'))
  expect(load).toHaveBeenCalledTimes(2)
})
