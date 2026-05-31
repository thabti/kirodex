/**
 * Command Palette — enhanced with contextual commands, keyboard shortcut hints,
 * frecency tracking, and unified slash command surface.
 *
 * A Cmd+K / Ctrl+K overlay for quick navigation and actions:
 * - Search threads by name
 * - Switch between projects
 * - Run git actions (commit, push, pull, stash)
 * - Toggle panels (diff, terminal, debug)
 * - Switch modes and models
 * - Open settings
 * - Create new threads
 */
import { memo, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  IconSearch, IconMessage, IconFolder, IconSettings,
  IconPlus, IconHistory, IconTerminal2, IconCode,
  IconPlayerPause, IconPlayerStop, IconGitCommit, IconArrowUp,
  IconArrowDown, IconRefresh, IconArchive, IconCopy, IconBrain,
  IconLayoutColumns, IconKeyboard, IconChartBar, IconSlash,
} from '@tabler/icons-react'
import { useTaskStore } from '@/stores/taskStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useDiffStore } from '@/stores/diffStore'
import { ipc } from '@/lib/ipc'
import { cn } from '@/lib/utils'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

interface CommandItem {
  id: string
  label: string
  description?: string
  shortcut?: string
  icon: React.ReactNode
  action: () => void
  category: 'thread' | 'project' | 'action' | 'git' | 'panel' | 'recent-thread' | 'recent-command'
}

// Section label shown above a contiguous run of items with the same key.
// Only used when the palette has no query (cold-open seed view).
type SectionKey = 'recent-threads' | 'recent-commands' | null
const sectionLabelFor = (cat: CommandItem['category']): SectionKey => {
  if (cat === 'recent-thread') return 'recent-threads'
  if (cat === 'recent-command') return 'recent-commands'
  return null
}
const sectionTitle: Record<Exclude<SectionKey, null>, string> = {
  'recent-threads': 'Recent threads',
  'recent-commands': 'Recent commands',
}

// ── Frecency tracking ────────────────────────────────────────────

const FRECENCY_KEY = 'kirodex:command-frecency'
const MAX_FRECENCY_ENTRIES = 50

interface FrecencyEntry {
  id: string
  count: number
  lastUsed: number
}

function loadFrecency(): FrecencyEntry[] {
  try {
    const raw = localStorage.getItem(FRECENCY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveFrecency(entries: FrecencyEntry[]) {
  try {
    localStorage.setItem(FRECENCY_KEY, JSON.stringify(entries.slice(0, MAX_FRECENCY_ENTRIES)))
  } catch { /* quota exceeded or private mode */ }
}

function recordUsage(id: string) {
  const entries = loadFrecency()
  const existing = entries.find((e) => e.id === id)
  if (existing) {
    existing.count += 1
    existing.lastUsed = Date.now()
  } else {
    entries.push({ id, count: 1, lastUsed: Date.now() })
  }
  // Sort by frecency score (count * recency decay)
  entries.sort((a, b) => frecencyScore(b) - frecencyScore(a))
  saveFrecency(entries)
}

function frecencyScore(entry: FrecencyEntry): number {
  const hoursSinceUse = (Date.now() - entry.lastUsed) / (1000 * 60 * 60)
  const decay = Math.max(0.1, 1 - hoursSinceUse / 168) // decay over 1 week
  return entry.count * decay
}

function getFrecencyOrder(): Map<string, number> {
  const entries = loadFrecency()
  const map = new Map<string, number>()
  entries.forEach((e, idx) => map.set(e.id, idx))
  return map
}

// ── Recent slash command ring ────────────────────────────────────

const RECENT_SLASH_KEY = 'kirodex:recent-slash-commands'
const MAX_RECENT_SLASH = 5

function loadRecentSlashCommands(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SLASH_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string').slice(0, MAX_RECENT_SLASH) : []
  } catch { return [] }
}

/**
 * Push a slash command onto the recent ring. Exported so chat input and slash
 * handlers can record usage; safe no-op if storage is unavailable.
 */
export function recordRecentSlashCommand(command: string) {
  if (!command.startsWith('/')) return
  try {
    const current = loadRecentSlashCommands().filter((c) => c !== command)
    current.unshift(command)
    localStorage.setItem(RECENT_SLASH_KEY, JSON.stringify(current.slice(0, MAX_RECENT_SLASH)))
  } catch { /* storage unavailable */ }
}

// ── Component ────────────────────────────────────────────────────

export const CommandPalette = memo(function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const tasks = useTaskStore((s) => s.tasks)
  const archivedMeta = useTaskStore((s) => s.archivedMeta)
  const projects = useTaskStore((s) => s.projects)
  const projectNames = useTaskStore((s) => s.projectNames)
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
  const setSelectedTask = useTaskStore((s) => s.setSelectedTask)
  const setView = useTaskStore((s) => s.setView)
  const setPendingWorkspace = useTaskStore((s) => s.setPendingWorkspace)
  const setSettingsOpen = useTaskStore((s) => s.setSettingsOpen)
  const hydrateArchivedTask = useTaskStore((s) => s.hydrateArchivedTask)

  const diffOpen = useDiffStore((s) => s.isOpen)
  const setDiffOpen = useDiffStore((s) => s.setOpen)

  // Build command items
  const items = useMemo((): CommandItem[] => {
    const result: CommandItem[] = []
    const lowerQuery = query.toLowerCase()
    const frecencyOrder = getFrecencyOrder()
    const isColdOpen = lowerQuery.length === 0

    // ── Cold-open seed: Recent threads + Recent slash commands ───
    if (isColdOpen) {
      // Recent threads — top 5 from live tasks sorted by last activity desc.
      // lastActivityAt is derived from the last message timestamp, falling
      // back to createdAt for never-replied threads. See projectMeta() in
      // taskStore for the same derivation used by archived threads.
      const recentThreads = Object.values(tasks)
        .map((t) => ({
          task: t,
          lastActivityAt: t.messages.length > 0 ? t.messages[t.messages.length - 1].timestamp : t.createdAt,
        }))
        .sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1))
        .slice(0, 5)

      for (const { task } of recentThreads) {
        result.push({
          id: `recent-thread:${task.id}`,
          label: task.name,
          description: task.workspace.split('/').pop(),
          icon: <IconMessage className="size-3.5" />,
          action: () => { setSelectedTask(task.id); setView('chat'); onClose() },
          category: 'recent-thread',
        })
      }

      // Recent slash commands — last 5 from the in-memory/localStorage ring.
      const recentSlash = loadRecentSlashCommands()
      for (const cmd of recentSlash) {
        result.push({
          id: `recent-command:${cmd}`,
          label: cmd,
          description: 'Slash command',
          icon: <IconSlash className="size-3.5" />,
          action: () => {
            window.dispatchEvent(new CustomEvent('kirodex:prefill-chat-input', { detail: cmd }))
            onClose()
          },
          category: 'recent-command',
        })
      }
    }

    // ── Contextual commands (shown first when relevant) ──────────
    const currentTask = selectedTaskId ? tasks[selectedTaskId] : null
    if (currentTask) {
      if (currentTask.status === 'running') {
        const pauseItem: CommandItem = {
          id: 'action:pause-task',
          label: 'Pause Agent',
          description: 'Pause the running agent',
          shortcut: 'Esc',
          icon: <IconPlayerPause className="size-3.5" />,
          action: () => { void ipc.pauseTask(currentTask.id); onClose() },
          category: 'action',
        }
        const cancelItem: CommandItem = {
          id: 'action:cancel-task',
          label: 'Cancel Agent',
          description: 'Stop and cancel the running agent',
          icon: <IconPlayerStop className="size-3.5" />,
          action: () => { void ipc.cancelTask(currentTask.id); onClose() },
          category: 'action',
        }
        if (!lowerQuery || pauseItem.label.toLowerCase().includes(lowerQuery)) result.push(pauseItem)
        if (!lowerQuery || cancelItem.label.toLowerCase().includes(lowerQuery)) result.push(cancelItem)
      }
    }

    // On cold open we surface ONLY the seeded recent sections + contextual
    // commands. The full catalog (panels, git, actions, all threads, all
    // projects) is revealed once the user starts typing a query.
    if (isColdOpen) {
      return result.slice(0, 60)
    }

    // ── Panel toggle commands ────────────────────────────────────
    const panelCommands: CommandItem[] = [
      {
        id: 'panel:toggle-diff',
        label: 'Toggle Diff Panel',
        description: diffOpen ? 'Close diff panel' : 'Open diff panel',
        shortcut: '⌘D',
        icon: <IconCode className="size-3.5" />,
        action: () => { setDiffOpen(!diffOpen); onClose() },
        category: 'panel',
      },
      {
        id: 'panel:toggle-terminal',
        label: 'Toggle Terminal',
        description: 'Show or hide the terminal drawer',
        shortcut: '⌘J',
        icon: <IconTerminal2 className="size-3.5" />,
        action: () => {
          // Dispatch keyboard event to trigger the existing terminal toggle
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', metaKey: true }))
          onClose()
        },
        category: 'panel',
      },
      {
        id: 'panel:toggle-split',
        label: 'Toggle Side-by-Side',
        shortcut: '⌘\\',
        icon: <IconLayoutColumns className="size-3.5" />,
        action: () => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', metaKey: true }))
          onClose()
        },
        category: 'panel',
      },
    ]

    for (const cmd of panelCommands) {
      if (!lowerQuery || cmd.label.toLowerCase().includes(lowerQuery)) result.push(cmd)
    }

    // ── Git commands ─────────────────────────────────────────────
    const gitCommands: CommandItem[] = [
      {
        id: 'git:commit',
        label: 'Git: Commit',
        description: 'Open commit dialog',
        icon: <IconGitCommit className="size-3.5" />,
        action: () => {
          // Emit event to open commit dialog
          window.dispatchEvent(new CustomEvent('kirodex:open-commit-dialog'))
          onClose()
        },
        category: 'git',
      },
      {
        id: 'git:push',
        label: 'Git: Push',
        description: 'Push current branch to remote',
        icon: <IconArrowUp className="size-3.5" />,
        action: () => {
          window.dispatchEvent(new CustomEvent('kirodex:git-push'))
          onClose()
        },
        category: 'git',
      },
      {
        id: 'git:pull',
        label: 'Git: Pull',
        description: 'Pull latest from remote',
        icon: <IconArrowDown className="size-3.5" />,
        action: () => {
          window.dispatchEvent(new CustomEvent('kirodex:git-pull'))
          onClose()
        },
        category: 'git',
      },
      {
        id: 'git:fetch',
        label: 'Git: Fetch',
        description: 'Fetch remote refs',
        icon: <IconRefresh className="size-3.5" />,
        action: () => {
          window.dispatchEvent(new CustomEvent('kirodex:git-fetch'))
          onClose()
        },
        category: 'git',
      },
      {
        id: 'git:stash',
        label: 'Git: Stash Changes',
        description: 'Stash uncommitted changes',
        icon: <IconArchive className="size-3.5" />,
        action: () => {
          window.dispatchEvent(new CustomEvent('kirodex:git-stash'))
          onClose()
        },
        category: 'git',
      },
      {
        id: 'git:history',
        label: 'Git: Show History',
        description: 'View commit history',
        icon: <IconHistory className="size-3.5" />,
        action: () => {
          window.dispatchEvent(new CustomEvent('kirodex:show-git-history'))
          onClose()
        },
        category: 'git',
      },
    ]

    for (const cmd of gitCommands) {
      if (!lowerQuery || cmd.label.toLowerCase().includes(lowerQuery)) result.push(cmd)
    }

    // ── Action commands ──────────────────────────────────────────
    const actions: CommandItem[] = [
      {
        id: 'action:new-thread',
        label: 'New Thread',
        description: 'Start a new conversation',
        shortcut: '⌘N',
        icon: <IconPlus className="size-3.5" />,
        action: () => {
          const ws = useSettingsStore.getState().activeWorkspace
          if (ws) setPendingWorkspace(ws)
          setView('chat')
          onClose()
        },
        category: 'action',
      },
      {
        id: 'action:settings',
        label: 'Open Settings',
        shortcut: '⌘,',
        icon: <IconSettings className="size-3.5" />,
        action: () => { setSettingsOpen(true); onClose() },
        category: 'action',
      },
      {
        id: 'action:dashboard',
        label: 'Analytics Dashboard',
        description: 'View usage analytics',
        icon: <IconChartBar className="size-3.5" />,
        action: () => { setView('dashboard'); onClose() },
        category: 'action',
      },
      {
        id: 'action:model-picker',
        label: 'Switch Model',
        description: 'Change the AI model',
        icon: <IconBrain className="size-3.5" />,
        action: () => {
          window.dispatchEvent(new CustomEvent('kirodex:open-model-picker'))
          onClose()
        },
        category: 'action',
      },
      {
        id: 'action:shortcuts',
        label: 'Keyboard Shortcuts',
        description: 'View all keyboard shortcuts',
        icon: <IconKeyboard className="size-3.5" />,
        action: () => {
          window.dispatchEvent(new CustomEvent('kirodex:show-shortcuts'))
          onClose()
        },
        category: 'action',
      },
      {
        id: 'action:fork-thread',
        label: 'Fork Thread',
        description: 'Fork current thread into a new conversation',
        icon: <IconCopy className="size-3.5" />,
        action: () => {
          window.dispatchEvent(new CustomEvent('kirodex:fork-thread'))
          onClose()
        },
        category: 'action',
      },
    ]

    for (const action of actions) {
      if (!lowerQuery || action.label.toLowerCase().includes(lowerQuery)) result.push(action)
    }

    // ── Thread items (live tasks) ────────────────────────────────
    for (const task of Object.values(tasks)) {
      if (lowerQuery && !task.name.toLowerCase().includes(lowerQuery)) continue
      result.push({
        id: `thread:${task.id}`,
        label: task.name,
        description: task.workspace.split('/').pop(),
        icon: <IconMessage className="size-3.5" />,
        action: () => { setSelectedTask(task.id); setView('chat'); onClose() },
        category: 'thread',
      })
    }

    // ── Archived threads ─────────────────────────────────────────
    for (const meta of Object.values(archivedMeta)) {
      if (lowerQuery && !meta.name.toLowerCase().includes(lowerQuery)) continue
      result.push({
        id: `archived:${meta.id}`,
        label: meta.name,
        description: `${meta.workspace.split('/').pop()} · archived`,
        icon: <IconHistory className="size-3.5 text-muted-foreground/50" />,
        action: () => {
          void hydrateArchivedTask(meta.id).then((ok) => {
            if (ok) { setSelectedTask(meta.id); setView('chat') }
          })
          onClose()
        },
        category: 'thread',
      })
    }

    // ── Project items ────────────────────────────────────────────
    for (const ws of projects) {
      const name = projectNames[ws] ?? ws.split('/').pop() ?? ws
      if (lowerQuery && !name.toLowerCase().includes(lowerQuery)) continue
      result.push({
        id: `project:${ws}`,
        label: name,
        description: ws,
        icon: <IconFolder className="size-3.5" />,
        action: () => { setPendingWorkspace(ws); setView('chat'); onClose() },
        category: 'project',
      })
    }

    // Frecency tie-break: bubble recently-used catalog items toward the top
    // of the filtered list so habitual commands land first.
    result.sort((a, b) => {
      const aIdx = frecencyOrder.get(a.id) ?? 999
      const bIdx = frecencyOrder.get(b.id) ?? 999
      return aIdx - bIdx
    })

    return result.slice(0, 60)
  }, [query, tasks, archivedMeta, projects, projectNames, selectedTaskId, diffOpen,
      setSelectedTask, setView, setPendingWorkspace, setSettingsOpen, setDiffOpen,
      hydrateArchivedTask, onClose])

  // Reset selection when query changes
  useEffect(() => { setSelectedIndex(0) }, [query])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Scroll selected item into view. We query by data-cmd-item rather than
  // by raw child index because section headers are also rendered as direct
  // children, which would otherwise shift the indices.
  useEffect(() => {
    if (!listRef.current) return
    const nodes = listRef.current.querySelectorAll<HTMLElement>('[data-cmd-item]')
    nodes[selectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, items.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[selectedIndex]
      if (item) {
        recordUsage(item.id)
        item.action()
      }
    }
  }, [items, selectedIndex, onClose])

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-[500] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-[15%] z-[501] w-full max-w-[520px] -translate-x-1/2 rounded-xl border border-border bg-popover shadow-2xl" onKeyDown={handleKeyDown}>
        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <IconSearch className="size-4 shrink-0 text-muted-foreground/50" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search threads, projects, or actions…"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground/40"
          />
          <kbd className="shrink-0 rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[400px] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-[13px] text-muted-foreground/50">
              No results found
            </div>
          )}
          {items.map((item, idx) => {
            const prevSection = idx === 0 ? null : sectionLabelFor(items[idx - 1].category)
            const thisSection = sectionLabelFor(item.category)
            const showHeader = thisSection !== null && thisSection !== prevSection
            const isSelected = idx === selectedIndex
            return (
              <div key={item.id}>
                {showHeader && (
                  <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                    {sectionTitle[thisSection]}
                  </div>
                )}
                <button
                  data-cmd-item
                  type="button"
                  onClick={() => { recordUsage(item.id); item.action() }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left outline-none transition-colors',
                    'focus-visible:ring-2 focus-visible:ring-ring/60',
                    isSelected
                      ? 'bg-foreground text-background ring-2 ring-ring/60'
                      : 'text-foreground/80 hover:bg-accent/50',
                  )}
                >
                  <span className={cn('shrink-0', isSelected ? 'text-background/80' : 'text-muted-foreground')}>
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{item.label}</span>
                  {item.description && (
                    <span className={cn('shrink-0 max-w-[140px] truncate text-[11px]', isSelected ? 'text-background/60' : 'text-muted-foreground/50')}>
                      {item.description}
                    </span>
                  )}
                  {item.shortcut && (
                    <kbd className={cn(
                      'ml-1 shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px]',
                      isSelected
                        ? 'border-background/30 bg-background/15 text-background/80'
                        : 'border-border/40 bg-muted/20 text-muted-foreground/60',
                    )}>
                      {item.shortcut}
                    </kbd>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer hint — always visible. Right-flush kbd caps. */}
        <div className="flex items-center justify-end gap-2 border-t border-border/40 px-4 py-2 text-[12px] text-muted-foreground/60">
          <kbd className="rounded border border-border/40 bg-muted/20 px-1.5 py-0.5 font-mono text-[10px]">↑↓</kbd>
          <span>navigate</span>
          <span className="opacity-50">·</span>
          <kbd className="rounded border border-border/40 bg-muted/20 px-1.5 py-0.5 font-mono text-[10px]">↵</kbd>
          <span>select</span>
          <span className="opacity-50">·</span>
          <kbd className="rounded border border-border/40 bg-muted/20 px-1.5 py-0.5 font-mono text-[10px]">esc</kbd>
          <span>close</span>
          <span className="opacity-50">·</span>
          <span className="tabular-nums">
            {items.length} {items.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      </div>
    </>
  )
})
