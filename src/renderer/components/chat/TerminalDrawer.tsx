import { memo, useEffect, useRef, useCallback, useState } from 'react'
import { IconLayoutColumns, IconPlus, IconTrash, IconTerminal2 } from '@tabler/icons-react'
import { Terminal, type ITheme } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ipc } from '@/lib/ipc'
import { useResizeHandle } from '@/hooks/useResizeHandle'
import 'xterm/css/xterm.css'

interface TerminalDrawerProps {
  cwd: string
}

interface TermInstance {
  id: string
  term: Terminal
  fit: FitAddon
  containerRef: React.MutableRefObject<HTMLDivElement | null>
  groupId: string
  /** rAF handle for batched writes */
  rafId: number | null
  writeQueue: string[]
}

let termCounter = 0
function nextId() { return `pty-${++termCounter}` }

function terminalTheme(): ITheme {
  const isDark = document.documentElement.classList.contains('dark')
  const body = getComputedStyle(document.body)
  const bg = body.backgroundColor || (isDark ? 'rgb(14,18,24)' : 'rgb(255,255,255)')
  const fg = body.color || (isDark ? 'rgb(237,241,247)' : 'rgb(28,33,41)')
  if (isDark) {
    return {
      background: bg, foreground: fg,
      cursor: 'rgb(180,203,255)', selectionBackground: 'rgba(180,203,255,0.25)',
      black: 'rgb(24,30,38)', red: 'rgb(255,122,142)', green: 'rgb(134,231,149)',
      yellow: 'rgb(244,205,114)', blue: 'rgb(137,190,255)', magenta: 'rgb(208,176,255)',
      cyan: 'rgb(124,232,237)', white: 'rgb(210,218,230)',
      brightBlack: 'rgb(110,120,136)', brightRed: 'rgb(255,168,180)', brightGreen: 'rgb(176,245,186)',
      brightYellow: 'rgb(255,224,149)', brightBlue: 'rgb(174,210,255)', brightMagenta: 'rgb(229,203,255)',
      brightCyan: 'rgb(167,244,247)', brightWhite: 'rgb(244,247,252)',
    }
  }
  return {
    background: bg, foreground: fg,
    cursor: 'rgb(38,56,78)', selectionBackground: 'rgba(37,63,99,0.2)',
    black: 'rgb(44,53,66)', red: 'rgb(191,70,87)', green: 'rgb(60,126,86)',
    yellow: 'rgb(146,112,35)', blue: 'rgb(72,102,163)', magenta: 'rgb(132,86,149)',
    cyan: 'rgb(53,127,141)', white: 'rgb(210,215,223)',
    brightBlack: 'rgb(112,123,140)', brightRed: 'rgb(212,95,112)', brightGreen: 'rgb(85,148,111)',
    brightYellow: 'rgb(173,133,45)', brightBlue: 'rgb(91,124,194)', brightMagenta: 'rgb(153,107,172)',
    brightCyan: 'rgb(70,149,164)', brightWhite: 'rgb(236,240,246)',
  }
}

export const TerminalDrawer = memo(function TerminalDrawer({ cwd }: TerminalDrawerProps) {
  const [instances, setInstances] = useState<TermInstance[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [height, setHeight] = useState(280)
  const readyPtys = useRef<Set<string>>(new Set())
  const instancesRef = useRef<TermInstance[]>([])
  instancesRef.current = instances

  const spawnTerminal = useCallback(async (groupId: string): Promise<TermInstance> => {
    const id = nextId()
    const term = new Terminal({
      fontFamily: '"SF Mono", SFMono-Regular, ui-monospace, Menlo, Consolas, monospace',
      fontSize: 12.5,
      lineHeight: 1.25,
      letterSpacing: 0,
      cursorBlink: true,
      scrollback: 5_000,
      allowTransparency: false,
      theme: terminalTheme(),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    const containerRef: React.MutableRefObject<HTMLDivElement | null> = { current: null }
    const instance: TermInstance = { id, term, fit, containerRef, groupId, rafId: null, writeQueue: [] }

    setInstances((prev) => [...prev, instance])
    setActiveId(id)
    term.onData((data) => { void ipc.ptyWrite(id, data) })

    await ipc.ptyCreate(id, cwd)
    readyPtys.current.add(id)
    if (containerRef.current && term.element) {
      fit.fit()
      void ipc.ptyResize(id, term.cols, term.rows)
    }
    return instance
  }, [cwd])

  // Initial terminal
  useEffect(() => {
    void spawnTerminal('g1')
    return () => {
      instancesRef.current.forEach((inst) => {
        if (inst.rafId !== null) cancelAnimationFrame(inst.rafId)
        void ipc.ptyKill(inst.id)
        inst.term.dispose()
      })
      readyPtys.current.clear()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // PTY data — batched via rAF per instance
  useEffect(() => {
    const unsub = ipc.onPtyData(({ id, data }) => {
      const inst = instancesRef.current.find((i) => i.id === id)
      if (!inst) return
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
      instancesRef.current.find((i) => i.id === id)?.term.write('\r\n[Process exited]\r\n')
    })
    return () => { unsub(); unsubExit() }
  }, [])

  // Mount terminals into DOM
  useEffect(() => {
    instances.forEach((inst) => {
      if (inst.containerRef.current && !inst.term.element) {
        inst.term.open(inst.containerRef.current)
        inst.fit.fit()
        if (readyPtys.current.has(inst.id)) {
          void ipc.ptyResize(inst.id, inst.term.cols, inst.term.rows)
        }
      }
    })
  }, [instances])

  // ResizeObserver for visible terminals in active group
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

  // MutationObserver: live theme updates on dark/light toggle
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const theme = terminalTheme()
      instancesRef.current.forEach((inst) => {
        inst.term.options.theme = theme
        inst.term.refresh(0, inst.term.rows - 1)
      })
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
    return () => observer.disconnect()
  }, [])

  const handleDragStart = useResizeHandle({
    axis: 'vertical', size: height, onResize: setHeight, min: 120, max: 600, reverse: true,
  })

  const handleClose = useCallback((id: string) => {
    const inst = instancesRef.current.find((i) => i.id === id)
    if (inst) {
      if (inst.rafId !== null) cancelAnimationFrame(inst.rafId)
      void ipc.ptyKill(id)
      inst.term.dispose()
      readyPtys.current.delete(id)
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

  const handleSplit = useCallback(() => {
    const active = instancesRef.current.find((i) => i.id === activeId)
    void spawnTerminal(active?.groupId ?? `g${nextId()}`)
  }, [activeId, spawnTerminal])

  const active = instances.find((i) => i.id === activeId)
  const activeGroupId = active?.groupId ?? null
  const visibleInstances = activeGroupId ? instances.filter((i) => i.groupId === activeGroupId) : []
  const tabs = Array.from(new Map(instances.map((i) => [i.groupId, i])).values())
  const hasMultipleTabs = tabs.length > 1

  return (
    <aside
      data-testid="terminal-drawer"
      className="thread-terminal-drawer relative flex min-w-0 shrink-0 flex-col overflow-hidden border-t border-border/50 bg-background"
      style={{ height }}
    >
      <div
        className="absolute inset-x-0 top-0 z-20 h-1.5 cursor-row-resize hover:bg-primary/20 active:bg-primary/30 transition-colors"
        onMouseDown={handleDragStart}
      />

      {!hasMultipleTabs && (
        <div className="pointer-events-none absolute right-2 top-2 z-20">
          <div className="pointer-events-auto inline-flex items-center overflow-hidden rounded-md border border-border/80 bg-background/70">
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="Split Terminal" data-testid="terminal-split-button" onClick={handleSplit}
                  className="p-1 text-foreground/90 transition-colors hover:bg-accent">
                  <IconLayoutColumns className="size-3.25" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Split terminal</TooltipContent>
            </Tooltip>
            <div className="h-4 w-px bg-border/80" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="New Terminal" data-testid="terminal-new-button" onClick={handleNew}
                  className="p-1 text-foreground/90 transition-colors hover:bg-accent">
                  <IconPlus className="size-3.25" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">New terminal</TooltipContent>
            </Tooltip>
            <div className="h-4 w-px bg-border/80" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="Close Terminal" data-testid="terminal-close-button"
                  onClick={() => activeId && handleClose(activeId)}
                  className="p-1 text-foreground/90 transition-colors hover:bg-accent">
                  <IconTrash className="size-3.25" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close terminal</TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      <div className="min-h-0 w-full flex-1">
        <div className={`flex h-full min-h-0 ${hasMultipleTabs ? 'gap-0' : ''}`}>
          <div className="min-w-0 flex-1">
            <div
              className="grid h-full w-full min-w-0 overflow-hidden gap-1 p-1"
              style={{ gridTemplateColumns: `repeat(${Math.max(1, visibleInstances.length)}, minmax(0, 1fr))` }}
            >
              {instances.map((inst) => (
                <div
                  key={inst.id}
                  className="min-h-0 min-w-0"
                  style={{ display: inst.groupId === activeGroupId ? undefined : 'none' }}
                  onMouseDown={() => { if (inst.id !== activeId) setActiveId(inst.id) }}
                >
                  <div
                    ref={(el) => { inst.containerRef.current = el }}
                    className="h-full w-full overflow-hidden rounded-md"
                  />
                </div>
              ))}
            </div>
          </div>

          {hasMultipleTabs && (
            <aside className="flex w-36 min-w-36 flex-col border-l border-border/70 bg-muted/10">
              <div className="flex h-[22px] items-stretch justify-end border-b border-border/70">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="Split Terminal" onClick={handleSplit}
                      className="inline-flex h-full items-center px-1 text-foreground/90 transition-colors hover:bg-accent/70">
                      <IconLayoutColumns className="size-3.25" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Split terminal</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="New Terminal" onClick={handleNew}
                      className="inline-flex h-full items-center border-l border-border/70 px-1 text-foreground/90 transition-colors hover:bg-accent/70">
                      <IconPlus className="size-3.25" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">New terminal</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="Close Terminal"
                      onClick={() => activeId && handleClose(activeId)}
                      className="inline-flex h-full items-center border-l border-border/70 px-1 text-foreground/90 transition-colors hover:bg-accent/70">
                      <IconTrash className="size-3.25" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Close terminal</TooltipContent>
                </Tooltip>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
                {tabs.map((tab, idx) => {
                  const groupInstances = instances.filter((i) => i.groupId === tab.groupId)
                  const isActive = tab.groupId === activeGroupId
                  const label = groupInstances.length > 1 ? `Split ${idx + 1}` : `Terminal ${idx + 1}`
                  return (
                    <button key={tab.groupId} type="button" onClick={() => setActiveId(tab.id)}
                      className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-[11px] ${
                        isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                      }`}
                    >
                      <IconTerminal2 className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{label}</span>
                    </button>
                  )
                })}
              </div>
            </aside>
          )}
        </div>
      </div>
    </aside>
  )
})
