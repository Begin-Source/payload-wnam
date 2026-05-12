/** Imperative open/close for keyword list drawers (toolbar triggers). */
export type KeywordDrawerRef = {
  open: (mode?: string) => void
  close: () => void
}
