import '@fontsource-variable/dm-sans'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import '../tailwind.css'

// Apply persisted theme immediately to prevent flash
import { readPersistedTheme, applyTheme } from './lib/theme'
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
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }
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

  render() { return this.state.error ? null : this.props.children }
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

// Fade out and remove splash screen after React mounts
const splash = document.getElementById('splash')
if (splash) {
  splash.style.opacity = '0'
  const handleRemove = () => splash.remove()
  splash.addEventListener('transitionend', handleRemove, { once: true })
  // If already invisible (transition already done), remove immediately
  setTimeout(handleRemove, 500)
}

