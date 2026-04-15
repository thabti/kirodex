import { useJsDebugStore } from '@/stores/jsDebugStore'
import { useTaskStore } from '@/stores/taskStore'
import type { JsDebugCategory, JsDebugEntry } from '@/types'

type ConsoleMethod = 'log' | 'warn' | 'error'

const CONSOLE_METHODS: ConsoleMethod[] = ['log', 'warn', 'error']

const CATEGORY_MAP: Record<ConsoleMethod, JsDebugCategory> = {
  log: 'log',
  warn: 'warn',
  error: 'error',
}

const IS_ERROR_MAP: Record<ConsoleMethod, boolean> = {
  log: false,
  warn: false,
  error: true,
}

const formatArgs = (args: unknown[]): string => {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return `${a.name}: ${a.message}`
      try { return JSON.stringify(a) } catch { return String(a) }
    })
    .join(' ')
}

const formatDetail = (args: unknown[]): string => {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack ?? `${a.name}: ${a.message}`
      if (typeof a === 'string') return a
      try { return JSON.stringify(a, null, 2) } catch { return String(a) }
    })
    .join('\n')
}

const addEntry = (entry: Omit<JsDebugEntry, 'id' | 'timestamp' | 'taskId'>): void => {
  const taskId = useTaskStore.getState().selectedTaskId ?? null
  useJsDebugStore.getState().addEntry({
    ...entry,
    id: 0,
    timestamp: new Date().toISOString(),
    taskId,
  } as JsDebugEntry)
}

/** Install all JS interceptors. Returns a cleanup function that restores originals. */
export const installJsInterceptors = (): (() => void) => {
  const cleanups: Array<() => void> = []

  // ── Console interceptors ────────────────────────────────────────
  const originals: Record<ConsoleMethod, (...args: unknown[]) => void> = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  }

  for (const method of CONSOLE_METHODS) {
    const original = originals[method]
    console[method] = (...args: unknown[]) => {
      original.apply(console, args)
      addEntry({
        category: CATEGORY_MAP[method],
        message: formatArgs(args),
        detail: formatDetail(args),
        isError: IS_ERROR_MAP[method],
      })
    }
    cleanups.push(() => { console[method] = original })
  }

  // ── Error event listeners ───────────────────────────────────────
  const handleError = (e: ErrorEvent): void => {
    addEntry({
      category: 'exception',
      message: e.message || 'Unknown error',
      detail: e.error?.stack ?? `${e.filename}:${e.lineno}:${e.colno}`,
      isError: true,
    })
  }

  const handleRejection = (e: PromiseRejectionEvent): void => {
    const err = e.reason
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? 'Unhandled rejection')
    const detail = err instanceof Error ? (err.stack ?? message) : message
    addEntry({
      category: 'exception',
      message,
      detail,
      isError: true,
    })
  }

  window.addEventListener('error', handleError)
  window.addEventListener('unhandledrejection', handleRejection)
  cleanups.push(() => {
    window.removeEventListener('error', handleError)
    window.removeEventListener('unhandledrejection', handleRejection)
  })

  // ── Fetch interceptor ──────────────────────────────────────────
  const originalFetch = window.fetch
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? 'GET'
    const start = performance.now()
    try {
      const response = await originalFetch(input, init)
      const duration = Math.round(performance.now() - start)
      const isError = response.status >= 400
      addEntry({
        category: 'network',
        message: `${method} ${url} → ${response.status}`,
        detail: `${method} ${url}\nStatus: ${response.status} ${response.statusText}\nDuration: ${duration}ms`,
        isError,
        url,
        method: method.toUpperCase(),
        status: response.status,
        duration,
      })
      return response
    } catch (err) {
      const duration = Math.round(performance.now() - start)
      const message = err instanceof Error ? err.message : String(err)
      addEntry({
        category: 'network',
        message: `${method} ${url} → FAILED: ${message}`,
        detail: `${method} ${url}\nError: ${message}\nDuration: ${duration}ms`,
        isError: true,
        url,
        method: method.toUpperCase(),
        duration,
      })
      throw err
    }
  }
  cleanups.push(() => { window.fetch = originalFetch })

  // ── XHR interceptor ────────────────────────────────────────────
  const XHR = XMLHttpRequest.prototype
  const originalOpen = XHR.open
  const originalSend = XHR.send

  XHR.open = function (method: string, url: string | URL, ...rest: unknown[]) {
    (this as XMLHttpRequest & { _jsDebug: { method: string; url: string } })._jsDebug = {
      method: method.toUpperCase(),
      url: String(url),
    }
    return (originalOpen as Function).call(this, method, url, ...rest)
  }

  XHR.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const meta = (this as XMLHttpRequest & { _jsDebug?: { method: string; url: string } })._jsDebug
    if (!meta) return originalSend.call(this, body)
    const start = performance.now()
    this.addEventListener('loadend', () => {
      const duration = Math.round(performance.now() - start)
      const isError = this.status === 0 || this.status >= 400
      addEntry({
        category: 'network',
        message: `${meta.method} ${meta.url} → ${this.status || 'FAILED'}`,
        detail: `${meta.method} ${meta.url}\nStatus: ${this.status} ${this.statusText}\nDuration: ${duration}ms`,
        isError,
        url: meta.url,
        method: meta.method,
        status: this.status,
        duration,
      })
    })
    return originalSend.call(this, body)
  }
  cleanups.push(() => {
    XHR.open = originalOpen
    XHR.send = originalSend
  })

  // ── Rust log listener (tauri-plugin-log) ───────────────────────
  import('@tauri-apps/plugin-log').then(({ attachLogger }) => {
    attachLogger(({ level, message }) => {
      addEntry({
        category: 'rust',
        message,
        detail: message,
        isError: level >= 5,
      })
    }).then((detach) => {
      cleanups.push(detach)
    }).catch(() => {})
  }).catch(() => {})

  return () => { cleanups.forEach((fn) => fn()) }
}
