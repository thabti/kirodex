import '@fontsource-variable/dm-sans'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import '../tailwind.css'

// Apply persisted theme immediately to prevent flash
import { readPersistedTheme, applyTheme } from './lib/theme'
import { invokeCommand } from './lib/web-rpc'
applyTheme(readPersistedTheme())

function showError(err: unknown) {
  console.error('[Kirodex crash]', err)
}

// Errors that are transient (HMR, StrictMode) and should auto-recover, not crash
const RECOVERABLE_ERRORS = [
  'hook.getSnapshot',       // Zustand/React store not yet initialized during HMR
  'hook?.getSnapshot',      // same, alternate message
  'useSyncExternalStore',   // same root cause
]

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; showRecovery: boolean }
> {
  state: { error: Error | null; showRecovery: boolean } = { error: null, showRecovery: false }
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  static getDerivedStateFromError(error: Error) { return { error } }

  componentDidCatch(error: Error) {
    const msg = error.message ?? ''
    // Auto-recover from transient HMR/store-init errors
    if (RECOVERABLE_ERRORS.some((r) => msg.includes(r))) {
      console.warn('[ErrorBoundary] Recoverable error, retrying:', msg)
      this.retryTimer = setTimeout(() => this.setState({ error: null }), 100)
      return
    }
    showError(error)
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer)
  }

  private handleResetAppData = async () => {
    try {
      await invokeCommand('reset_app_data')
      window.location.reload()
    } catch (err) {
      console.error('[ErrorBoundary] Reset failed:', err)
      // Last resort: reload anyway
      window.location.reload()
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100vh', gap: '16px', padding: '24px', textAlign: 'center',
        fontFamily: "'DM Sans Variable', system-ui, sans-serif",
        color: '#e0e0e0', background: '#0D0D0D',
      }}>
        <div style={{ fontSize: '32px', marginBottom: '4px' }}>⚠️</div>
        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Kirodex failed to start</h2>
        <p style={{ fontSize: '13px', color: '#888', maxWidth: '360px', margin: 0, lineHeight: 1.5 }}>
          This usually happens when app data gets corrupted. You can reset it to start fresh, or try reloading.
        </p>
        <p style={{ fontSize: '11px', color: '#555', maxWidth: '400px', margin: 0, fontFamily: 'monospace', wordBreak: 'break-all' }}>
          {this.state.error.message}
        </p>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
              border: '1px solid #333', background: 'transparent', color: '#ccc', cursor: 'pointer',
            }}
          >
            Reload
          </button>
          {!this.state.showRecovery ? (
            <button
              onClick={() => this.setState({ showRecovery: true })}
              style={{
                padding: '8px 16px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                border: '1px solid #dc2626', background: 'transparent', color: '#ef4444', cursor: 'pointer',
              }}
            >
              Reset app data
            </button>
          ) : (
            <button
              onClick={this.handleResetAppData}
              style={{
                padding: '8px 16px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer',
              }}
            >
              Confirm reset — delete all history
            </button>
          )}
        </div>
      </div>
    )
  }
}

// Errors that are safe to ignore — they don't indicate a real crash
const IGNORED_ERRORS = [
  'ResizeObserver loop',           // benign: layout shift during observation
  'ResizeObserver loop completed', // same, different wording across browsers
  'listeners[eventId]',            // Tauri listener cleanup race during HMR/StrictMode
  'unregisterListener',            // same — stale listener map after hot reload
  'hook.getSnapshot',              // Zustand store not ready during HMR
  'hook?.getSnapshot',             // same
]

window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason instanceof Error ? e.reason.message : String(e.reason ?? '')
  if (IGNORED_ERRORS.some((i) => msg.includes(i))) return
  showError(e.reason)
})
window.addEventListener('error', (e) => {
  const msg = e.message ?? (e.error instanceof Error ? e.error.message : '')
  if (IGNORED_ERRORS.some((i) => msg.includes(i))) return
  showError(e.error ?? e.message)
})

// ⌘R / Ctrl+R to reload
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
    e.preventDefault()
    window.location.reload()
  }
})

// Install JS debug interceptors (console, errors, fetch/XHR) before React renders
import { installJsInterceptors } from './lib/jsInterceptors'
installJsInterceptors()

// Safety net: persist thread history before the window closes.
// We eagerly import the store module so the reference is available synchronously
// in the beforeunload handler (dynamic import() would be async and never complete).
let _persistHistory: (() => void) | null = null
import('./stores/taskStore').then((m) => {
  _persistHistory = () => m.useTaskStore.getState().persistHistory()
})
window.addEventListener('beforeunload', () => {
  try { _persistHistory?.() } catch { /* ignore */ }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

// React mounted — cancel the crash-fallback timer and remove both overlays
if ((window as unknown as Record<string, unknown>).__crashTimer) {
  clearTimeout((window as unknown as Record<string, unknown>).__crashTimer as number)
}
document.getElementById('crash-fallback')?.remove()

const splash = document.getElementById('splash')
if (splash) {
  splash.style.opacity = '0'
  const handleRemove = () => splash.remove()
  splash.addEventListener('transitionend', handleRemove, { once: true })
  setTimeout(handleRemove, 500)
}
