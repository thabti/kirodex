import { memo } from 'react'
import { ModelPickerPanel } from './ModelPickerPanel'
import { AgentPanel } from './AgentPanel'
import { BranchPanel, WorktreePanel } from './GitPanels'
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
  return null
})
