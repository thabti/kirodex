import { memo, useCallback } from 'react'
import { IconCode, IconListCheck } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'
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
    <PanelShell>
      <p className="px-3 py-3 text-xs text-muted-foreground/70">No models available</p>
    </PanelShell>
  )

  return (
    <PanelShell>
      <div className="px-3 pt-2 pb-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Models</span>
      </div>
      <ul className="max-h-[200px] overflow-y-auto pb-1">
        {models.map((m) => {
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

  return (
    <PanelShell>
      {/* Built-in agents */}
      <div className="px-3 pt-2 pb-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Agents</span>
      </div>
      <ul className="pb-1">
        {BUILT_IN_AGENTS.map((agent) => {
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

      {/* MCP servers */}
      {servers.length > 0 && (
        <>
          <div className="mx-3 border-t border-border/40" />
          <div className="px-3 pt-2 pb-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">MCP Servers</span>
          </div>
          <div className="max-h-[160px] overflow-y-auto pb-1">
            {servers.map((server) => {
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
    </PanelShell>
  )
})

// ── Shared panel shell ──────────────────────────────────────────────
function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute bottom-full left-0 right-0 z-[300] mb-2 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
      {children}
    </div>
  )
}

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
  return null
})
