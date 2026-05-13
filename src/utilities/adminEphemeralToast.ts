type AdminToastKind = 'error' | 'info' | 'success'
type AdminToastPosition = 'bottom-right' | 'top'

type AdminToastOptions = {
  position?: AdminToastPosition
}

function toastColors(kind: AdminToastKind): { background: string; color: string } {
  if (kind === 'error') return { background: '#b91c1c', color: '#fff7f7' }
  if (kind === 'info') return { background: '#15803d', color: '#f0fdf4' }
  return { background: '#15943a', color: '#f0fdf4' }
}

/**
 * Fixed status toast for Payload admin surfaces (quick actions / custom panels).
 * Supports legacy `showEphemeralAdminToast(message)` and typed status calls.
 */
export function showEphemeralAdminToast(message: string): void
export function showEphemeralAdminToast(
  kind: AdminToastKind,
  message: string,
  detail?: string,
  options?: AdminToastOptions,
): void
export function showEphemeralAdminToast(
  kindOrMessage: AdminToastKind | string,
  message?: string,
  detail?: string,
  options?: AdminToastOptions,
): void {
  if (typeof document === 'undefined') return
  const typedKind =
    kindOrMessage === 'error' || kindOrMessage === 'info' || kindOrMessage === 'success'
  const kind: AdminToastKind = typedKind ? kindOrMessage : 'success'
  const text = typedKind ? (message ?? '') : kindOrMessage
  const position = options?.position ?? 'bottom-right'
  const colors = toastColors(kind)
  const el = document.createElement('div')
  el.setAttribute('role', 'status')
  el.setAttribute('data-admin-ephemeral-toast', position)
  if (position === 'top') {
    document.querySelectorAll('[data-admin-ephemeral-toast="top"]').forEach((node) => node.remove())
  }
  Object.assign(el.style, {
    position: 'fixed',
    ...(position === 'top'
      ? {
          top: '24px',
          left: '24px',
          right: '24px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: '16px',
        }
      : {
          bottom: '20px',
          right: '20px',
        }),
    maxWidth: position === 'top' ? 'none' : 'min(360px, calc(100vw - 40px))',
    padding: position === 'top' ? '14px 16px' : '12px 14px',
    borderRadius: position === 'top' ? '12px 12px 0 0' : '8px',
    zIndex: '99999',
    fontSize: position === 'top' ? '14px' : '13px',
    lineHeight: 1.45,
    fontFamily: 'system-ui, sans-serif',
    boxShadow: position === 'top' ? '0 10px 30px rgba(0,0,0,0.28)' : '0 8px 24px rgba(0,0,0,0.18)',
    background: colors.background,
    color: colors.color,
  })

  const copy = document.createElement('div')
  Object.assign(copy.style, {
    minWidth: '0',
    overflow: 'hidden',
  })

  const title = document.createElement('div')
  Object.assign(title.style, {
    fontWeight: '700',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  })
  title.textContent = text
  copy.appendChild(title)

  if (detail) {
    const body = document.createElement('div')
    Object.assign(body.style, {
      marginTop: '4px',
      opacity: '0.9',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    })
    body.textContent = detail
    copy.appendChild(body)
  }
  el.appendChild(copy)

  if (position === 'top') {
    const close = document.createElement('button')
    close.type = 'button'
    close.setAttribute('aria-label', '关闭')
    Object.assign(close.style, {
      appearance: 'none',
      border: '0',
      background: 'transparent',
      color: 'inherit',
      cursor: 'pointer',
      fontSize: '24px',
      lineHeight: '1',
      padding: '2px 4px',
      opacity: '0.9',
    })
    close.textContent = '×'
    close.addEventListener('click', () => el.remove())
    el.appendChild(close)
  }

  document.body.appendChild(el)
  window.setTimeout(() => el.remove(), 8500)
}
