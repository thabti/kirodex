import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { IconCode, IconListCheck, IconRobot, IconX } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { fuzzyScore } from '@/lib/fuzzy-search'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'
import { useKiroStore } from '@/stores/kiroStore'
import { ipc } from '@/lib/ipc'
import type { SlashPanel } from '@/hooks/useSlashAction'

// ── Status dot colors ───────────────────────────────────────────────
const STATUS_DOT: Record<string, { cls: string; label: string }> = {
  running:    { cls: 'bg-emerald-400', label: 'running' },
  loading:    { cls: 'bg-amber-400 animate-pulse', label: 'loading' },
  error:      { cls: 'bg-red-400', label: 'error' },
  'needs-auth': { cls: 'bg-red-400', label: 'needs auth' },
}

// ── Built-in agents ─────────────────────────────────────────────────
const BUILT_IN_AGENTS = [
  { id: 'kiro_default', name: 'Default', description: 'Code, edit, and execute', icon: IconCode, color: 'text-blue-400' },
  { id: 'kiro_planner', name: 'Planner', description: 'Plan before coding', icon: IconListCheck, color: 'text-teal-400' },
] as const

// ── Model picker panel ──────────────────────────────────────────────
const ModelPickerPanel = memo(function ModelPickerPanel({ onDismiss }: { onDismiss: () => void }) {
  const models = useSettingsStore((s) => s.availableModels)
  const currentId = useSettingsStore((s) => s.currentModelId)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return models
    return models
      .map((m) => {
        const nameScore = fuzzyScore(query, m.name)
        const idScore = fuzzyScore(query, m.modelId)
        const best = nameScore !== null && idScore !== null ? Math.min(nameScore, idScore) : nameScore ?? idScore
        return { model: m, score: best }
      })
      .filter((r): r is { model: typeof models[number]; score: number } => r.score !== null)
      .sort((a, b) => a.score - b.score)
      .map((r) => r.model)
  }, [models, query])

  const handleSelect = (modelId: string) => {
    const { activeWorkspace, setProjectPref } = useSettingsStore.getState()
    if (activeWorkspace) {
      setProjectPref(activeWorkspace, { modelId })
    } else {
      useSettingsStore.setState({ currentModelId: modelId })
    }
    onDismiss()
  }

  if (models.length === 0) return (
    <PanelShell onDismiss={onDismiss}>
      <p className="px-3 py-3 text-xs text-muted-foreground/70">No models available</p>
    </PanelShell>
  )

  return (
    <PanelShell onDismiss={onDismiss}>
      <div className="px-3 pt-2 pb-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Models</span>
      </div>
      {models.length > 5 && (
        <div className="px-3 pb-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models…"
            autoFocus
            className="w-full rounded-md border border-border/40 bg-background/50 px-2 py-1 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-border/80"
          />
        </div>
      )}
      <ul className="max-h-[200px] overflow-y-auto pb-1">
        {filtered.map((m) => {
          const isActive = m.modelId === currentId
          return (
            <li
              key={m.modelId}
              role="option"
              aria-selected={isActive}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(m.modelId) }}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[12px] transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <span className={cn('size-1.5 shrink-0 rounded-full', isActive ? 'bg-primary' : 'bg-transparent')} />
              <span className={cn('flex-1 truncate', isActive && 'font-medium')}>{m.name}</span>
              {isActive && <span className="text-[10px] text-primary/60">active</span>}
            </li>
          )
        })}
      </ul>
    </PanelShell>
  )
})

// ── Agent / MCP server list panel ───────────────────────────────────
const AgentListPanel = memo(function AgentListPanel({ onDismiss }: { onDismiss: () => void }) {
  const servers = useSettingsStore((s) => s.liveMcpServers)
  const currentModeId = useSettingsStore((s) => s.currentModeId)
  const kiroAgents = useKiroStore((s) => s.config.agents)
  const [query, setQuery] = useState('')

  const handleSelectAgent = useCallback((agentId: string) => {
    useSettingsStore.setState({ currentModeId: agentId })
    const taskId = useTaskStore.getState().selectedTaskId
    if (taskId) {
      useTaskStore.getState().setTaskMode(taskId, agentId)
      ipc.setMode(taskId, agentId).catch(() => {})
      ipc.sendMessage(taskId, `/agent ${agentId}`).catch(() => {})
    }
    onDismiss()
  }, [onDismiss])

  const formatName = (name: string): string =>
    name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  const q = query.trim()
  const totalItems = BUILT_IN_AGENTS.length + kiroAgents.length + servers.length
  const hasSearch = totalItems > 5

  const filteredBuiltIn = useMemo(() => {
    if (!q) return [...BUILT_IN_AGENTS]
    return BUILT_IN_AGENTS
      .map((a) => {
        const nameScore = fuzzyScore(q, a.name)
        const descScore = fuzzyScore(q, a.description)
        const best = nameScore !== null && descScore !== null ? Math.min(nameScore, descScore + 50) : nameScore ?? (descScore !== null ? descScore + 50 : null)
        return { agent: a, score: best }
      })
      .filter((r): r is { agent: typeof BUILT_IN_AGENTS[number]; score: number } => r.score !== null)
      .sort((a, b) => a.score - b.score)
      .map((r) => r.agent)
  }, [q])

  const filteredKiro = useMemo(() => {
    if (!q) return kiroAgents
    return kiroAgents
      .map((a) => {
        const nameScore = fuzzyScore(q, a.name)
        const descScore = fuzzyScore(q, a.description)
        const best = nameScore !== null && descScore !== null ? Math.min(nameScore, descScore + 50) : nameScore ?? (descScore !== null ? descScore + 50 : null)
        return { agent: a, score: best }
      })
      .filter((r): r is { agent: typeof kiroAgents[number]; score: number } => r.score !== null)
      .sort((a, b) => a.score - b.score)
      .map((r) => r.agent)
  }, [q, kiroAgents])

  const filteredServers = useMemo(() => {
    if (!q) return servers
    return servers
      .map((s) => ({ server: s, score: fuzzyScore(q, s.name) }))
      .filter((r): r is { server: typeof servers[number]; score: number } => r.score !== null)
      .sort((a, b) => a.score - b.score)
      .map((r) => r.server)
  }, [q, servers])

  return (
    <PanelShell onDismiss={onDismiss}>
      {/* Search input */}
      {hasSearch && (
        <div className="px-3 pb-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents & servers…"
            autoFocus
            className="w-full rounded-md border border-border/40 bg-background/50 px-2 py-1 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-border/80"
          />
        </div>
      )}

      {/* Built-in agents */}
      {filteredBuiltIn.length > 0 && (
        <>
          <div className="px-3 pt-2 pb-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Agents</span>
          </div>
          <ul className="pb-1">
            {filteredBuiltIn.map((agent) => {
              const isActive = currentModeId === agent.id
              const Icon = agent.icon
              return (
                <li
                  key={agent.id}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={(e) => { e.preventDefault(); handleSelectAgent(agent.id) }}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[12px] transition-colors',
                    isActive ? 'text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  <Icon className={cn('size-3.5 shrink-0', isActive ? agent.color : 'text-muted-foreground/60')} />
                  <span className={cn('flex-1', isActive && 'font-medium')}>{agent.name}</span>
                  <span className="text-[10px] text-muted-foreground/50">{agent.description}</span>
                  {isActive && <span className="text-[10px] text-primary/60">active</span>}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {/* .kiro agents */}
      {filteredKiro.length > 0 && (
        <>
          <div className="mx-3 border-t border-border/40" />
          <div className="px-3 pt-2 pb-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">.kiro Agents</span>
          </div>
          <ul className="max-h-[160px] overflow-y-auto pb-1">
            {filteredKiro.map((agent) => {
              const isActive = currentModeId === agent.name
              return (
                <li
                  key={`${agent.source}-${agent.name}`}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={(e) => { e.preventDefault(); handleSelectAgent(agent.name) }}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[12px] transition-colors',
                    isActive ? 'text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  <IconRobot className={cn('size-3.5 shrink-0', isActive ? 'text-violet-400' : 'text-muted-foreground/60')} />
                  <span className={cn('flex-1 truncate', isActive && 'font-medium')}>{formatName(agent.name)}</span>
                  <span className="text-[10px] text-muted-foreground/50 truncate max-w-[120px]">{agent.description.slice(0, 60)}</span>
                  {isActive && <span className="shrink-0 text-[10px] text-primary/60">active</span>}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {/* MCP servers */}
      {filteredServers.length > 0 && (
        <>
          <div className="mx-3 border-t border-border/40" />
          <div className="px-3 pt-2 pb-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">MCP Servers</span>
          </div>
          <div className="max-h-[160px] overflow-y-auto pb-1">
            {filteredServers.map((server) => {
              const dot = STATUS_DOT[server.status] ?? STATUS_DOT.loading
              return (
                <div
                  key={server.name}
                  className="flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-muted-foreground"
                >
                  <span className={cn('size-1.5 shrink-0 rounded-full', dot.cls)} />
                  <span className="flex-1 truncate text-foreground/90">{server.name}</span>
                  <span className="text-[10px] text-muted-foreground/50">{dot.label}</span>
                  <span className="text-[10px] text-muted-foreground/40">
                    {server.toolCount > 0 ? `${server.toolCount} tools` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Empty state when search has no results */}
      {filteredBuiltIn.length === 0 && filteredKiro.length === 0 && filteredServers.length === 0 && q && (
        <p className="px-3 py-3 text-xs text-muted-foreground/70">No matches for "{q}"</p>
      )}
    </PanelShell>
  )
})

// ── Shared panel shell ──────────────────────────────────────────────
function PanelShell({ children, onDismiss }: { children: React.ReactNode; onDismiss?: () => void }) {
  return (
    <div className="absolute bottom-full left-0 right-0 z-[300] mb-2 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
      {onDismiss && (
        <div className="flex items-center justify-end px-2 pt-1.5">
          <button
            type="button"
            aria-label="Close panel"
            tabIndex={0}
            onMouseDown={(e) => { e.preventDefault(); onDismiss() }}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
          >
            <IconX className="size-3.5" />
          </button>
        </div>
      )}
      {children}
    </div>
  )
}

// ── Usage panel ─────────────────────────────────────────────────
const formatTokens = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const UsagePanel = memo(function UsagePanel({ onDismiss }: { onDismiss: () => void }) {
  const tasks = useTaskStore((s) => s.tasks)
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
  const currentModel = useSettingsStore((s) => s.currentModelId)
  const entries = useMemo(() => {
    return Object.values(tasks)
      .filter((t) => t.contextUsage && t.contextUsage.size > 0)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [tasks])
  const totalUsed = useMemo(() => entries.reduce((sum, t) => sum + (t.contextUsage?.used ?? 0), 0), [entries])
  const totalSize = useMemo(() => entries.reduce((sum, t) => sum + (t.contextUsage?.size ?? 0), 0), [entries])
  return (
    <PanelShell onDismiss={onDismiss}>
      <div className="px-3 pt-2 pb-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Token Usage</span>
      </div>
      {/* Summary */}
      <div className="mx-3 mb-1 rounded-lg bg-muted/30 px-3 py-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] text-muted-foreground">Total context used</span>
          <span className="text-[13px] font-medium text-foreground">{formatTokens(totalUsed)} / {formatTokens(totalSize)}</span>
        </div>
        {totalSize > 0 && (
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
            <div
              className={cn('h-full rounded-full transition-all', totalUsed / totalSize > 0.85 ? 'bg-red-400' : totalUsed / totalSize > 0.6 ? 'bg-amber-400' : 'bg-blue-400')}
              style={{ width: `${Math.min((totalUsed / totalSize) * 100, 100)}%` }}
            />
          </div>
        )}
        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground/50">
          <span>{entries.length} task{entries.length !== 1 ? 's' : ''} with usage</span>
          <span>{currentModel ?? 'unknown model'}</span>
        </div>
      </div>
      {/* Per-task breakdown */}
      {entries.length > 0 && (
        <ul className="max-h-[180px] overflow-y-auto pb-1">
          {entries.map((task) => {
            const cu = task.contextUsage!
            const pct = cu.size > 0 ? (cu.used / cu.size) * 100 : 0
            const isSelected = task.id === selectedTaskId
            return (
              <li key={task.id} className={cn('flex items-center gap-2 px-3 py-1.5 text-[12px]', isSelected ? 'text-foreground' : 'text-muted-foreground')}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('size-1.5 shrink-0 rounded-full', isSelected ? 'bg-primary' : 'bg-transparent')} />
                    <span className="truncate">{task.name || task.id.slice(0, 8)}</span>
                  </div>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground/50">{pct.toFixed(0)}%</span>
                <span className="shrink-0 text-[11px]">{formatTokens(cu.used)}</span>
              </li>
            )
          })}
        </ul>
      )}
      {entries.length === 0 && (
        <p className="px-3 py-3 text-xs text-muted-foreground/70">No usage data yet</p>
      )}
    </PanelShell>
  )
})

// ── Exported dispatcher ─────────────────────────────────────────────
export const SlashActionPanel = memo(function SlashActionPanel({
  panel,
  onDismiss,
}: {
  panel: SlashPanel
  onDismiss: () => void
}) {
  if (panel === 'model') return <ModelPickerPanel onDismiss={onDismiss} />
  if (panel === 'agent') return <AgentListPanel onDismiss={onDismiss} />
  if (panel === 'usage') return <UsagePanel onDismiss={onDismiss} />
  return null
})
