/**
 * Fixed bottom-right status toast for Payload admin surfaces (quick actions).
 * Matches the behavior previously inlined in CollectionQuickActions.
 */
export function showEphemeralAdminToast(
  kind: 'error' | 'success',
  message: string,
  detail?: string,
): void {
  if (typeof document === 'undefined') return
  const el = document.createElement('div')
  el.setAttribute('role', 'status')
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    maxWidth: 'min(360px, calc(100vw - 40px))',
    padding: '12px 14px',
    borderRadius: '8px',
    zIndex: '99999',
    fontSize: '13px',
    lineHeight: 1.45,
    fontFamily: 'system-ui, sans-serif',
    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
    background: kind === 'error' ? '#b91c1c' : '#166534',
    color: '#fafafa',
    whiteSpace: 'pre-wrap',
  })
  el.textContent = detail ? `${message}\n${detail}` : message
  document.body.appendChild(el)
  window.setTimeout(() => el.remove(), 8500)
}
