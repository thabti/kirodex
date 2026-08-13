type Listener<T = unknown> = (payload: T) => void
type UnsubscribeFn = () => void

interface RpcResponse {
  type: 'response'
  id: string
  ok: boolean
  result?: unknown
  error?: { code?: string; message?: string }
}

interface RpcEvent {
  type: 'event'
  event: string
  payload: unknown
}

type ServerMessage = RpcResponse | RpcEvent

const REQUEST_TIMEOUT_MS = 30_000
const RECONNECT_DELAYS = [250, 500, 1_000, 2_000, 5_000]

export const isTauriRuntime = (): boolean =>
  typeof window !== 'undefined' && Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)

const getDefaultWebSocketUrl = (): URL =>
  new URL(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/rpc`)

const isLoopbackHostname = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'

const isAllowedExplicitRpcUrl = (url: URL): boolean => {
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return false
  if (url.hostname === window.location.hostname) return true
  return isLoopbackHostname(url.hostname) && isLoopbackHostname(window.location.hostname)
}

const getWebSocketUrl = (): string => {
  const params = new URLSearchParams(window.location.search)
  const explicit = params.get('kirodexRpc')
  const token = params.get('token')
  let url = getDefaultWebSocketUrl()
  if (explicit) {
    try {
      const candidate = new URL(explicit)
      if (isAllowedExplicitRpcUrl(candidate)) {
        url = candidate
      }
    } catch {
      url = getDefaultWebSocketUrl()
    }
  }
  if (token && !url.searchParams.has('token')) {
    url.searchParams.set('token', token)
  }
  return url.toString()
}

class WebRpcClient {
  private socket: WebSocket | null = null
  private connectPromise: Promise<void> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private requestSeq = 0
  private readonly listeners = new Map<string, Set<Listener>>()
  private readonly pending = new Map<string, {
    resolve: (value: unknown) => void
    reject: (reason?: unknown) => void
    timer: ReturnType<typeof setTimeout>
  }>()

  invoke<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    return this.ensureConnected().then(() => new Promise<T>((resolve, reject) => {
      const socket = this.socket
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket transport is not connected'))
        return
      }

      const id = `${Date.now()}-${++this.requestSeq}`
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Request timed out: ${method}`))
      }, REQUEST_TIMEOUT_MS)

      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      socket.send(JSON.stringify({ type: 'request', id, method, params: params ?? {} }))
    }))
  }

  listen<T>(event: string, cb: Listener<T>): UnsubscribeFn {
    const listeners = this.listeners.get(event) ?? new Set<Listener>()
    listeners.add(cb as Listener)
    this.listeners.set(event, listeners)
    void this.ensureConnected()
    return () => {
      const current = this.listeners.get(event)
      if (!current) return
      current.delete(cb as Listener)
      if (current.size === 0) this.listeners.delete(event)
    }
  }

  private ensureConnected(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve()
    if (this.connectPromise) return this.connectPromise

    this.connectPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(getWebSocketUrl())
      this.socket = socket

      socket.onopen = () => {
        this.reconnectAttempt = 0
        this.connectPromise = null
        resolve()
      }

      socket.onmessage = (event) => {
        this.handleMessage(event.data)
      }

      socket.onerror = () => {
        if (this.connectPromise) {
          this.connectPromise = null
          reject(new Error('WebSocket connection failed'))
        }
      }

      socket.onclose = () => {
        if (this.socket === socket) this.socket = null
        if (this.connectPromise) {
          this.connectPromise = null
          reject(new Error('WebSocket connection closed'))
        }
        this.rejectPending(new Error('WebSocket connection closed'))
        if (this.listeners.size > 0) this.scheduleReconnect()
      }
    })

    return this.connectPromise
  }

  private handleMessage(raw: string): void {
    let message: ServerMessage
    try {
      message = JSON.parse(raw) as ServerMessage
    } catch {
      return
    }

    if (message.type === 'response') {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      clearTimeout(pending.timer)
      if (message.ok) {
        pending.resolve(message.result)
      } else {
        pending.reject(new Error(message.error?.message ?? 'RPC request failed'))
      }
      return
    }

    if (message.type === 'event') {
      this.listeners.get(message.event)?.forEach((listener) => {
        try {
          listener(message.payload)
        } catch (err) {
          console.error('[web-rpc] listener failed:', err)
        }
      })
    }
  }

  private rejectPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pending.delete(id)
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)]
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.ensureConnected().catch(() => {
        if (this.listeners.size > 0) this.scheduleReconnect()
      })
    }, delay)
  }
}

const webRpcClient = new WebRpcClient()

export const webInvoke = <T>(method: string, params?: Record<string, unknown>): Promise<T> =>
  webRpcClient.invoke<T>(method, params)

export const webListen = <T>(event: string, cb: Listener<T>): UnsubscribeFn =>
  webRpcClient.listen<T>(event, cb)

export const invokeCommand = async <T>(method: string, params?: Record<string, unknown>): Promise<T> => {
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<T>(method, params)
  }
  return webInvoke<T>(method, params)
}

export const getRuntimeVersion = async (): Promise<string> => {
  if (isTauriRuntime()) {
    const { getVersion } = await import('@tauri-apps/api/app')
    return getVersion()
  }
  const info = await webInvoke<{ version: string }>('web_runtime_info')
  return info.version
}

export const listenEvent = <T>(event: string, cb: Listener<T>): UnsubscribeFn => {
  if (!isTauriRuntime()) {
    return webListen<T>(event, cb)
  }

  let unlisten: (() => void) | null = null
  let cleaned = false

  const ready = import('@tauri-apps/api/event')
    .then(({ listen }) => listen<T>(event, (e) => { if (!cleaned) cb(e.payload) }))

  ready.then((fn) => {
    if (cleaned) {
      setTimeout(() => { try { fn() } catch { /* stale listener */ } }, 0)
    } else {
      unlisten = fn
    }
  }).catch(() => {})

  return () => {
    if (cleaned) return
    cleaned = true
    if (unlisten) {
      const fn = unlisten
      unlisten = null
      setTimeout(() => { try { fn() } catch { /* already removed */ } }, 0)
    }
  }
}
