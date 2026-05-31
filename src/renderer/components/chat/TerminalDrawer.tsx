import { memo, useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react'
import {
  IconLayoutColumns,
  IconPlus,
  IconX,
  IconTerminal2,
  IconClearAll,
} from '@tabler/icons-react'
import type { ITheme } from 'ghostty-web'
import type { Terminal, FitAddon } from 'ghostty-web'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ipc } from '@/lib/ipc'
import { useResizeHandle } from '@/hooks/useResizeHandle'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MIN_DRAWER_HEIGHT = 180
const MAX_DRAWER_HEIGHT = 600
const DEFAULT_DRAWER_HEIGHT = 280
const MAX_TERMINALS_PER_GROUP = 4
const DEFAULT_SCROLLBACK_LINES = 2_000
const MIN_SCROLLBACK_LINES = 200
const MAX_SCROLLBACK_LINES = 20_000
const IDLE_CHECK_INTERVAL_MS = 60_000
const TERMINAL_FONT_FAMILY =
  '"SF Mono", SFMono-Regular, ui-monospace, Menlo, Consolas, monospace'
const TERMINAL_FONT_SIZE = 12.5

const clampScrollback = (raw: number | undefined): number => {
  if (!raw || !Number.isFinite(raw)) return DEFAULT_SCROLLBACK_LINES
  return Math.max(MIN_SCROLLBACK_LINES, Math.min(MAX_SCROLLBACK_LINES, Math.floor(raw)))
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TerminalDrawerProps {
  readonly cwd: string
  /**
   * Identifier used to look up `pendingTerminalRequests` in the task store.
   * Pass the task id for task panels, or `'__workspace__'` for the
   * pending-chat workspace drawer. Optional for callers that don't need
   * "Open in Terminal" integration.
   */
  readonly slotId?: string
  readonly onClose?: () => void
}

interface TermInstance {
  readonly id: string
  readonly term: Terminal
  readonly fit: FitAddon
  readonly containerRef: React.MutableRefObject<HTMLDivElement | null>
  readonly groupId: string
  rafId: number | null
  writeQueue: string[]
  hasActivity: boolean
  /** Wall-clock timestamp of the most recent PTY data or focus event. */
  lastActivityAt: number
}

/* ------------------------------------------------------------------ */
/*  ID generator                                                       */
/* ------------------------------------------------------------------ */

let termCounter = 0
const nextId = (): string => `pty-${++termCounter}`

/* ------------------------------------------------------------------ */
/*  Theme                                                              */
/* ------------------------------------------------------------------ */

const buildTerminalTheme = (): ITheme => {
  const isDark = document.documentElement.classList.contains('dark')
  const body = getComputedStyle(document.body)
  const bg =
    body.backgroundColor || (isDark ? 'rgb(14,18,24)' : 'rgb(255,255,255)')
  const fg =
    body.color || (isDark ? 'rgb(237,241,247)' : 'rgb(28,33,41)')
  if (isDark) {
    return {
      background: bg,
      foreground: fg,
      cursor: 'rgb(180,203,255)',
      selectionBackground: 'rgba(180,203,255,0.25)',
      black: 'rgb(24,30,38)',
      red: 'rgb(255,122,142)',
      green: 'rgb(134,231,149)',
      yellow: 'rgb(244,205,114)',
      blue: 'rgb(137,190,255)',
      magenta: 'rgb(208,176,255)',
      cyan: 'rgb(124,232,237)',
      white: 'rgb(210,218,230)',
      brightBlack: 'rgb(110,120,136)',
      brightRed: 'rgb(255,168,180)',
      brightGreen: 'rgb(176,245,186)',
      brightYellow: 'rgb(255,224,149)',
      brightBlue: 'rgb(174,210,255)',
      brightMagenta: 'rgb(229,203,255)',
      brightCyan: 'rgb(167,244,247)',
      brightWhite: 'rgb(244,247,252)',
    }
  }
  return {
    background: bg,
    foreground: fg,
    cursor: 'rgb(38,56,78)',
    selectionBackground: 'rgba(37,63,99,0.2)',
    black: 'rgb(44,53,66)',
    red: 'rgb(191,70,87)',
    green: 'rgb(60,126,86)',
    yellow: 'rgb(146,112,35)',
    blue: 'rgb(72,102,163)',
    magenta: 'rgb(132,86,149)',
    cyan: 'rgb(53,127,141)',
    white: 'rgb(210,215,223)',
    brightBlack: 'rgb(112,123,140)',
    brightRed: 'rgb(212,95,112)',
    brightGreen: 'rgb(85,148,111)',
    brightYellow: 'rgb(173,133,45)',
    brightBlue: 'rgb(91,124,194)',
    brightMagenta: 'rgb(153,107,172)',
    brightCyan: 'rgb(70,149,164)',
    brightWhite: 'rgb(236,240,246)',
  }
}

/* ------------------------------------------------------------------ */
/*  WASM init (lazy — only loads when terminal is first opened)        */
/* ------------------------------------------------------------------ */

let ghosttyPromise: Promise<InstanceType<Awaited<ReturnType<typeof loadGhostty>>['Ghostty']>> | null = null

/** Lazy-load ghostty-web + WASM on first terminal open. */
const loadGhostty = () => import('ghostty-web')

const getGhostty = (): NonNullable<typeof ghosttyPromise> => {
  if (!ghosttyPromise) {
    ghosttyPromise = (async () => {
      const { Ghostty } = await loadGhostty()
      const res = await fetch('/ghostty-vt.wasm')
      if (!res.ok) throw new Error(`Failed to fetch WASM: ${res.status}`)
      const buf = await res.arrayBuffer()
      if (buf.byteLength === 0) throw new Error('WASM file is empty')
      const mod = await WebAssembly.compile(buf)
      const instance = await WebAssembly.instantiate(mod, {
        env: {
          log: (ptr: number, len: number) => {
            const mem = (instance.exports as { memory: WebAssembly.Memory }).memory
            const bytes = new Uint8Array(mem.buffer, ptr, len)
            console.log('[ghostty-vt]', new TextDecoder().decode(bytes))
          },
        },
      })
      return new Ghostty(instance as unknown as WebAssembly.Instance)
    })()
  }
  return ghosttyPromise
}

/**
 * Pre-warm the ghostty-web JS chunk + WASM compilation during idle time.
 * Call this once after the app's main UI has mounted (e.g. in App.tsx via
 * `requestIdleCallback`). Subsequent calls are no-ops since `getGhostty()`
 * caches the promise at module scope.
 *
 * This removes ~100-200ms from the first terminal open because the WASM
 * fetch + compile has already completed by the time the user clicks.
 */
export function warmTerminalRuntime(): void {
  const schedule = typeof requestIdleCallback === 'function'
    ? requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 200)

  schedule(() => {
    // Kick off the lazy load + compile. We intentionally swallow errors here
    // because the real error handling happens in `spawnTerminal` when the
    // user actually opens the drawer.
    getGhostty().catch(() => {})
  })
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const TerminalDrawer = memo(function TerminalDrawer({
  cwd,
  slotId,
  onClose,
}: TerminalDrawerProps) {
  const [instances, setInstances] = useState<TermInstance[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [height, setHeight] = useState(DEFAULT_DRAWER_HEIGHT)
  const readyPtys = useRef<Set<string>>(new Set())
  const instancesRef = useRef<TermInstance[]>([])
  const instanceMap = useRef<Map<string, TermInstance>>(new Map())
  /** Highest pending-terminal request id this drawer has handled. */
  const lastHandledRequestId = useRef<number>(0)
  instancesRef.current = instances

  const scrollbackLines = useSettingsStore((s) => clampScrollback(s.settings.terminalScrollback))
  const idleCloseMins = useSettingsStore((s) => {
    const v = s.settings.terminalAutoCloseIdleMins
    return typeof v === 'number' && v > 0 ? Math.floor(v) : null
  })

  /** Pending "Open in Terminal" request for this drawer's slot, if any. */
  const pendingRequest = useTaskStore((s) =>
    slotId ? s.pendingTerminalRequests[slotId] ?? null : null,
  )

  /* ---- Spawn a new terminal ---- */
  const spawnTerminal = useCallback(
    async (groupId: string, overrideCwd?: string): Promise<TermInstance> => {
      const [ghostty, { Terminal, FitAddon }] = await Promise.all([
        getGhostty(),
        loadGhostty(),
      ])
      const id = nextId()
      const term = new Terminal({
        ghostty,
        fontFamily: TERMINAL_FONT_FAMILY,
        fontSize: TERMINAL_FONT_SIZE,
        cursorBlink: true,
        scrollback: scrollbackLines,
        theme: buildTerminalTheme(),
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      const containerRef: React.MutableRefObject<HTMLDivElement | null> = {
        current: null,
      }
      const instance: TermInstance = {
        id,
        term,
        fit,
        containerRef,
        groupId,
        rafId: null,
        writeQueue: [],
        hasActivity: false,
        lastActivityAt: Date.now(),
      }
      instanceMap.current.set(id, instance)
      setInstances((prev) => [...prev, instance])
      setActiveId(id)
      term.onData((data) => {
        void ipc.ptyWrite(id, data)
      })
      await ipc.ptyCreate(id, overrideCwd ?? cwd)
      readyPtys.current.add(id)
      if (containerRef.current && term.element) {
        fit.fit()
        void ipc.ptyResize(id, term.cols, term.rows)
      }
      return instance
    },
    [cwd, scrollbackLines],
  )

  /* ---- Initial terminal ---- */
  // We honor any pending "Open in Terminal" request that was sitting in the
  // store at mount time so the drawer opens directly at the requested folder
  // (instead of opening at the workspace and then bouncing to the new tab).
  // Read once via getState() to avoid re-running on subsequent requests.
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const initial = slotId
        ? useTaskStore.getState().pendingTerminalRequests[slotId] ?? null
        : null
      const initialCwd = initial?.cwd ?? cwd
      // Mark as handled before awaiting so the request-watcher effect (which
      // sees the same pending request via subscription) doesn't double-spawn.
      if (initial) lastHandledRequestId.current = initial.requestId
      const inst = await spawnTerminal('g1', initialCwd)
      if (initial && slotId) {
        useTaskStore.getState().consumeTerminalRequest(slotId, initial.requestId)
      }
      if (cancelled) {
        // StrictMode remount: clean up the terminal we just created
        if (inst.rafId !== null) cancelAnimationFrame(inst.rafId)
        void ipc.ptyKill(inst.id)
        inst.term.dispose()
        readyPtys.current.delete(inst.id)
        instanceMap.current.delete(inst.id)
        setInstances((prev) => prev.filter((i) => i.id !== inst.id))
      }
    }
    init().catch((err) => console.error('[TerminalDrawer] init failed:', err))
    return () => {
      cancelled = true
      instancesRef.current.forEach((inst) => {
        if (inst.rafId !== null) cancelAnimationFrame(inst.rafId)
        void ipc.ptyKill(inst.id)
        inst.term.dispose()
      })
      readyPtys.current.clear()
      instanceMap.current.clear()
      setInstances([])
      setActiveId(null)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- "Open in Terminal" requests after mount ---- */
  // Once the drawer is up, every new request from the file tree spawns a
  // new tab at the requested folder. The initial-mount effect handles the
  // very first request (so we don't end up with a stale workspace tab plus
  // the requested folder tab).
  useEffect(() => {
    if (!slotId || !pendingRequest) return
    if (pendingRequest.requestId <= lastHandledRequestId.current) return
    lastHandledRequestId.current = pendingRequest.requestId
    void spawnTerminal(`g${nextId()}`, pendingRequest.cwd)
      .catch((err) => console.error('[TerminalDrawer] spawn failed:', err))
      .finally(() => {
        useTaskStore.getState().consumeTerminalRequest(slotId, pendingRequest.requestId)
      })
  }, [slotId, pendingRequest, spawnTerminal])

  /* ---- PTY data — batched via rAF ---- */
  useEffect(() => {
    let activityDirty = false
    let activityRaf: number | null = null
    const flushActivity = () => {
      activityRaf = null
      if (activityDirty) {
        activityDirty = false
        setInstances((prev) => [...prev])
      }
    }
    const unsub = ipc.onPtyData(({ id, data }) => {
      const inst = instanceMap.current.get(id)
      if (!inst) return
      inst.lastActivityAt = Date.now()
      if (id !== activeId && !inst.hasActivity) {
        inst.hasActivity = true
        activityDirty = true
        if (activityRaf === null) {
          activityRaf = requestAnimationFrame(flushActivity)
        }
      }
      inst.writeQueue.push(data)
      if (inst.rafId === null) {
        inst.rafId = requestAnimationFrame(() => {
          inst.rafId = null
          if (inst.writeQueue.length === 0) return
          const chunk = inst.writeQueue.join('')
          inst.writeQueue.length = 0
          inst.term.write(chunk)
        })
      }
    })
    const unsubExit = ipc.onPtyExit(({ id }) => {
      instanceMap.current.get(id)
        ?.term.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n')
    })
    return () => {
      unsub()
      unsubExit()
      if (activityRaf !== null) cancelAnimationFrame(activityRaf)
    }
  }, [activeId])

  /* ---- Mount terminals into DOM ---- */
  // useLayoutEffect ensures the terminal canvas is attached to the DOM
  // *before* the browser paints, eliminating the one-frame empty-drawer flash.
  useLayoutEffect(() => {
    instances.forEach((inst) => {
      if (inst.containerRef.current && !inst.term.element) {
        inst.term.open(inst.containerRef.current)
        // fit() needs the element to have layout dimensions, which are
        // available synchronously in useLayoutEffect since the DOM is
        // committed. We still defer resize IPC to avoid blocking paint.
        inst.fit.fit()
        if (readyPtys.current.has(inst.id)) {
          void ipc.ptyResize(inst.id, inst.term.cols, inst.term.rows)
        }
      }
    })
  }, [instances])

  /* ---- ResizeObserver for visible terminals ---- */
  useEffect(() => {
    const active = instances.find((i) => i.id === activeId)
    if (!active) return
    const visible = instances.filter((i) => i.groupId === active.groupId)
    const observers: ResizeObserver[] = []
    visible.forEach((inst) => {
      if (!inst.containerRef.current) return
      const ro = new ResizeObserver(() => {
        if (!readyPtys.current.has(inst.id)) return
        inst.fit.fit()
        void ipc.ptyResize(inst.id, inst.term.cols, inst.term.rows)
      })
      ro.observe(inst.containerRef.current)
      observers.push(ro)
    })
    return () => observers.forEach((ro) => ro.disconnect())
  }, [activeId, instances])

  /* ---- Live theme updates ---- */
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const theme = buildTerminalTheme()
      instancesRef.current.forEach((inst) => {
        inst.term.options.theme = theme
      })
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
    return () => observer.disconnect()
  }, [])

  /* ---- Resize handle ---- */
  const handleDragStart = useResizeHandle({
    axis: 'vertical',
    size: height,
    onResize: setHeight,
    min: MIN_DRAWER_HEIGHT,
    max: MAX_DRAWER_HEIGHT,
    reverse: true,
  })

  /* ---- Actions ---- */
  const handleClose = useCallback((id: string) => {
    const inst = instanceMap.current.get(id)
    if (inst) {
      if (inst.rafId !== null) cancelAnimationFrame(inst.rafId)
      void ipc.ptyKill(id)
      inst.term.dispose()
      readyPtys.current.delete(id)
      instanceMap.current.delete(id)
    }
    setInstances((prev) => {
      const next = prev.filter((i) => i.id !== id)
      setActiveId((cur) => {
        if (cur !== id) return cur
        const sameGroup = next.filter((i) => i.groupId === inst?.groupId)
        return (sameGroup[0] ?? next[next.length - 1])?.id ?? null
      })
      return next
    })
  }, [])

  const handleNew = useCallback(() => {
    void spawnTerminal(`g${nextId()}`)
  }, [spawnTerminal])

  /* ---- Idle background-tab auto-close ---- */
  useEffect(() => {
    if (idleCloseMins === null) return
    const idleMs = idleCloseMins * 60_000
    const tick = () => {
      const now = Date.now()
      const all = instancesRef.current
      // Never close the last terminal in the drawer; users would lose the
      // open shell entirely. Only sweep tabs that aren't the active one and
      // aren't the only member of their group (so split panes stay paired).
      if (all.length <= 1) return
      const stale = all.filter((inst) =>
        inst.id !== activeId &&
        now - inst.lastActivityAt >= idleMs,
      )
      for (const inst of stale) handleClose(inst.id)
    }
    const id = window.setInterval(tick, IDLE_CHECK_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [idleCloseMins, activeId, handleClose])

  const handleSplit = useCallback(() => {
    const active = instancesRef.current.find((i) => i.id === activeId)
    const groupId = active?.groupId ?? `g${nextId()}`
    const groupCount = instancesRef.current.filter(
      (i) => i.groupId === groupId,
    ).length
    if (groupCount >= MAX_TERMINALS_PER_GROUP) return
    void spawnTerminal(groupId)
  }, [activeId, spawnTerminal])

  const handleClear = useCallback(() => {
    const inst = instancesRef.current.find((i) => i.id === activeId)
    if (!inst) return
    inst.term.clear()
  }, [activeId])

  const handleSelectTab = useCallback((tabId: string) => {
    setActiveId(tabId)
    // Clear activity indicator when switching to a tab
    const inst = instancesRef.current.find((i) => i.id === tabId)
    if (inst) {
      inst.hasActivity = false
      inst.lastActivityAt = Date.now()
      setInstances((prev) => [...prev])
      // Refit after the tab becomes visible
      requestAnimationFrame(() => {
        const group = instancesRef.current.filter(
          (i) => i.groupId === inst.groupId,
        )
        group.forEach((g) => {
          g.fit.fit()
          if (readyPtys.current.has(g.id)) {
            void ipc.ptyResize(g.id, g.term.cols, g.term.rows)
          }
        })
      })
    }
  }, [])

  /* ---- Derived state ---- */
  const active = instances.find((i) => i.id === activeId)
  const activeGroupId = active?.groupId ?? null
  const visibleInstances = activeGroupId
    ? instances.filter((i) => i.groupId === activeGroupId)
    : []
  const tabs = Array.from(
    new Map(instances.map((i) => [i.groupId, i])).values(),
  )

  return (
    <aside
      data-testid="terminal-drawer"
      className="relative flex min-w-0 shrink-0 flex-col overflow-hidden border-t border-border/50 bg-background"
      style={{ height }}
    >
      {/* Resize handle */}
      <div
          className="absolute inset-x-0 top-0 z-20 h-1 cursor-row-resize transition-colors hover:bg-primary/20 active:bg-primary/30"
          onMouseDown={handleDragStart}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize terminal"
        />

      {/* Header bar */}
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/40 bg-muted/30 px-1.5">
        {/* Tab strip */}
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto" role="tablist">
          {tabs.map((tab, idx) => {
            const groupInstances = instances.filter(
              (i) => i.groupId === tab.groupId,
            )
            const isActive = tab.groupId === activeGroupId
            const isSplit = groupInstances.length > 1
            const label = isSplit
              ? `Split ${idx + 1}`
              : tabs.length === 1
                ? 'Terminal'
                : `Terminal ${idx + 1}`
            const hasActivity = groupInstances.some((i) => i.hasActivity)
            return (
              <button
                key={tab.groupId}
                type="button"
                onClick={() => handleSelectTab(tab.id)}
                className={`group/tab relative flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
                aria-label={label}
                aria-selected={isActive}
                role="tab"
              >
                {isSplit
                  ? <IconLayoutColumns className="size-3 shrink-0" aria-hidden />
                  : <IconTerminal2 className="size-3 shrink-0" aria-hidden />
                }
                <span className="truncate">{label}</span>
                {hasActivity && !isActive && (
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-green-400"
                    aria-label="Has new output"
                  />
                )}
                {tabs.length > 1 && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleClose(tab.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation()
                        handleClose(tab.id)
                      }
                    }}
                    className="ml-0.5 rounded p-0.5 text-muted-foreground/40 opacity-0 transition-all group-hover/tab:opacity-100 hover:bg-accent-foreground/10 hover:text-foreground"
                    aria-label={`Close ${label}`}
                  >
                    <IconX className="size-2.5" aria-hidden />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Action buttons */}
        <div className="flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Clear terminal"
                  data-testid="terminal-clear-button"
                  onClick={handleClear}
                  className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                >
                  <IconClearAll className="size-3.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Clear</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Split terminal"
                  data-testid="terminal-split-button"
                  onClick={handleSplit}
                  className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                >
                  <IconLayoutColumns className="size-3.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Split</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="New terminal"
                  data-testid="terminal-new-button"
                  onClick={handleNew}
                  className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                >
                  <IconPlus className="size-3.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">New</TooltipContent>
            </Tooltip>
            {onClose && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Close terminal panel"
                    data-testid="terminal-close-panel-button"
                    onClick={onClose}
                    className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <IconX className="size-3.5" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Close panel</TooltipContent>
              </Tooltip>
            )}
        </div>
      </div>

      {/* Terminal viewport */}
      <div className="min-h-0 w-full flex-1">
          <div className="flex h-full w-full min-w-0 overflow-hidden p-0.5">
            {instances.map((inst) => {
              const isVisible = inst.groupId === activeGroupId
              const isActiveInst = inst.id === activeId
              const visibleIdx = visibleInstances.indexOf(inst)
              const showDivider = isVisible && visibleIdx > 0
              return (
                <div
                  key={inst.id}
                  className={isVisible ? 'flex min-h-0 min-w-0 flex-1' : 'hidden'}
                >
                  {showDivider && (
                    <div className="w-px shrink-0 bg-border/60" />
                  )}
                  <div
                    className={`min-h-0 min-w-0 flex-1 ${
                      isActiveInst && visibleInstances.length > 1
                        ? 'ring-1 ring-primary/20 ring-inset rounded-sm'
                        : ''
                    }`}
                    onMouseDown={() => {
                      if (inst.id !== activeId) handleSelectTab(inst.id)
                    }}
                  >
                    <div
                      ref={(el) => {
                        inst.containerRef.current = el
                      }}
                      className="h-full w-full overflow-hidden"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
    </aside>
  )
})
