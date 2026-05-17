import { memo } from 'react'
import { ModelPickerPanel } from './ModelPickerPanel'
import { AgentPanel } from './AgentPanel'
import { BranchPanel, WorktreePanel } from './GitPanels'
import { GoalStatusOverlay } from './GoalStatusOverlay'
import { useTaskStore } from '@/stores/taskStore'
import type { SlashPanel } from '@/hooks/useSlashAction'

// Re-exports for backwards compatibility
export { PanelShell } from './PanelShell'
export { formatTokens } from './UsagePanel'

/** Dispatches to the correct panel based on the slash command */
export const SlashActionPanel = memo(function SlashActionPanel({
  panel,
  onDismiss,
}: {
  panel: SlashPanel
  onDismiss: () => void
}) {
  if (panel === 'model') return <ModelPickerPanel onDismiss={onDismiss} />
  if (panel === 'agent') return <AgentPanel onDismiss={onDismiss} />
  if (panel === 'branch') return <BranchPanel onDismiss={onDismiss} />
  if (panel === 'worktree') return <WorktreePanel onDismiss={onDismiss} />
  if (panel === 'goal-status') {
    const taskId = useTaskStore.getState().selectedTaskId
    if (taskId) return <GoalStatusOverlay taskId={taskId} onClose={onDismiss} />
  }
  return null
})
