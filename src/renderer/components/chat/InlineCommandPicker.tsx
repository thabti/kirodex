import { memo, useEffect, useMemo, useRef } from 'react'
import { IconCheck, IconCode, IconListCheck, IconRobot } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { fuzzyScore } from '@/lib/fuzzy-search'
import { getModelIcon } from '@/lib/model-icons'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'
import { useKiroStore } from '@/stores/kiroStore'
import { usePanelResolvedTaskId } from './PanelContext'

export type InlineCommandKind = 'model' | 'agent'

interface InlinePickerItem {
  id: string
  label: string
  hint?: string
  iconNode: React.ReactNode
}

const BUILT_IN_AGENTS = [
  { id: 'kiro_default', name: 'Default', description: 'Code, edit, and execute', icon: IconCode },
  { id: 'kiro_planner', name: 'Planner', description: 'Plan before coding', icon: IconListCheck },
] as const

const formatAgentName = (name: string): string =>
  name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

interface InlineCommandPickerProps {
  kind: InlineCommandKind
  query: string
  activeIndex: number
  /** Reports the visible item count back so parent keyboard handler can clamp. */
  onItemsChange: (count: number) => void
  onCommit: (id: string) => void
  onDismiss: () => void
}

export const InlineCommandPicker = memo(function InlineCommandPicker({
  kind, query, activeIndex, onItemsChange, onCommit, onDismiss,
}: InlineCommandPickerProps) {
  const listRef = useRef<HTMLUListElement>(null)
  const resolvedTaskId = usePanelResolvedTaskId()

  // Model state
  const models = useSettingsStore((s) => s.availableModels)
  const globalModelId = useSettingsStore((s) => s.currentModelId)
  const taskModelId = useTaskStore((s) => resolvedTaskId ? s.taskModels[resolvedTaskId] ?? null : null)
  const currentModelId = taskModelId ?? globalModelId

  // Agent state
  const globalModeId = useSettingsStore((s) => s.currentModeId)
  const taskModeId = useTaskStore((s) => resolvedTaskId ? s.taskModes[resolvedTaskId] ?? null : null)
  const currentModeId = taskModeId ?? globalModeId
  const kiroAgents = useKiroStore((s) => s.config.agents)

  const items = useMemo<InlinePickerItem[]>(() => {
    if (kind === 'model') {
      const base = models.map<InlinePickerItem>((m) => ({
        id: m.modelId,
        label: m.name,
        hint: m.description ?? undefined,
        iconNode: <span className="shrink-0">{getModelIcon(m.modelId || m.name, { size: 14 })}</span>,
      }))
      if (!query.trim()) return base
      return base
        .map((it) => {
          const labelScore = fuzzyScore(query, it.label)
          const idScore = fuzzyScore(query, it.id)
          const best = labelScore !== null && idScore !== null
            ? Math.min(labelScore, idScore)
            : labelScore ?? idScore
          return { it, score: best }
        })
        .filter((r): r is { it: InlinePickerItem; score: number } => r.score !== null)
        .sort((a, b) => a.score - b.score)
        .map((r) => r.it)
    }

    // agent kind
    const builtIn = BUILT_IN_AGENTS.map<InlinePickerItem>((a) => {
      const Icon = a.icon
      return {
        id: a.id,
        label: a.name,
        hint: a.description,
        iconNode: <Icon className="size-3.5 shrink-0 text-muted-foreground" />,
      }
    })
    const kiro = kiroAgents.map<InlinePickerItem>((a) => ({
      id: a.name,
      label: formatAgentName(a.name),
      hint: a.description?.slice(0, 60),
      iconNode: <IconRobot className="size-3.5 shrink-0 text-muted-foreground" />,
    }))
    const merged = [...builtIn, ...kiro]
    if (!query.trim()) return merged
    return merged
      .map((it) => {
        const labelScore = fuzzyScore(query, it.label)
        const idScore = fuzzyScore(query, it.id)
        const hintScore = it.hint ? fuzzyScore(query, it.hint) : null
        const candidates = [labelScore, idScore, hintScore !== null ? hintScore + 50 : null]
          .filter((v): v is number => v !== null)
        const best = candidates.length > 0 ? Math.min(...candidates) : null
        return { it, score: best }
      })
      .filter((r): r is { it: InlinePickerItem; score: number } => r.score !== null)
      .sort((a, b) => a.score - b.score)
      .map((r) => r.it)
  }, [kind, query, models, kiroAgents])

  // Report visible item count to parent so it can clamp activeIndex.
  useEffect(() => { onItemsChange(items.length) }, [items.length, onItemsChange])

  // Scroll active row into view
  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  // Bridge keyboard commit (Enter) from the parent textarea to a concrete id
  useEffect(() => {
    const handler = (e: Event) => {
      const idx = (e as CustomEvent<{ index: number }>).detail?.index ?? 0
      const target = items[idx % Math.max(items.length, 1)]
      if (target) onCommit(target.id)
    }
    document.addEventListener('inline-command-commit', handler)
    return () => document.removeEventListener('inline-command-commit', handler)
  }, [items, onCommit])

  const title = kind === 'model' ? 'Switch model' : 'Switch agent'
  const currentId = kind === 'model' ? currentModelId : currentModeId

  if (items.length === 0) {
    return (
      <div
        className="absolute bottom-full left-0 right-0 z-[300] mb-2 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl ring-1 ring-black/5 dark:ring-white/5 floating-panel"
        role="listbox"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-3 py-2.5 text-[12px]">
          <span className="font-mono text-muted-foreground">/{kind} {query}</span>
          <span className="text-muted-foreground/70">No matches</span>
        </div>
        <div className="border-t border-border/40 px-3 py-1.5 text-[10px] text-muted-foreground/70">
          esc to cancel
        </div>
      </div>
    )
  }

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-[300] mb-2 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl ring-1 ring-black/5 dark:ring-white/5 floating-panel"
      role="listbox"
      aria-label={title}
    >
      <div className="flex items-center justify-between px-3 pt-2 pb-1.5">
        <span className="font-mono text-[11px] text-muted-foreground">
          /{kind}{query ? ` ${query}` : ''}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          {kind === 'model' ? 'Models' : 'Agents'}
        </span>
      </div>
      <ul ref={listRef} className="max-h-72 overflow-y-auto py-1">
        {items.map((it, i) => {
          const isActive = i === activeIndex
          const isCurrent = it.id === currentId
          return (
            <li
              key={it.id}
              role="option"
              aria-selected={isActive}
              onMouseDown={(e) => { e.preventDefault(); onCommit(it.id) }}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[12px] transition-colors',
                isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              {it.iconNode}
              <span className={cn('truncate', (isActive || isCurrent) && 'font-medium text-foreground')}>{it.label}</span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {it.hint && (
                  <span className="hidden max-w-[180px] truncate text-[10px] text-muted-foreground/80 sm:inline">{it.hint}</span>
                )}
                <span className="rounded-md border border-border/40 px-1.5 py-px font-mono text-[10px] text-muted-foreground/80">
                  {kind === 'model' ? 'model' : 'agent'}
                </span>
                {isCurrent && <IconCheck className="size-3.5 text-primary" aria-label="current" />}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="flex items-center justify-between border-t border-border/40 px-3 py-1.5 text-[10px] text-muted-foreground/70">
        <span>↑↓ navigate · ↵ commit · esc cancel</span>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onDismiss(); useTaskStore.getState().setSettingsOpen(true) }}
          className="rounded-md px-1.5 py-0.5 font-mono text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Open full picker · ⌘,
        </button>
      </div>
    </div>
  )
})
