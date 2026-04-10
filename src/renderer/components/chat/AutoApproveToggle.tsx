import { memo, useCallback } from 'react'
import { IconShieldCheck, IconShieldOff } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settingsStore'

export const selectAutoApprove = (s: ReturnType<typeof useSettingsStore.getState>) => {
  const ws = s.activeWorkspace
  const projectPref = ws ? s.settings.projectPrefs?.[ws]?.autoApprove : undefined
  return projectPref !== undefined ? projectPref : (s.settings.autoApprove ?? false)
}

export const AutoApproveToggle = memo(function AutoApproveToggle() {
  const active = useSettingsStore(selectAutoApprove)

  const toggle = useCallback(() => {
    const { settings, activeWorkspace, setProjectPref, saveSettings } = useSettingsStore.getState()
    const current = activeWorkspace
      ? (settings.projectPrefs?.[activeWorkspace]?.autoApprove ?? settings.autoApprove ?? false)
      : (settings.autoApprove ?? false)
    if (activeWorkspace) {
      setProjectPref(activeWorkspace, { autoApprove: !current })
    } else {
      saveSettings({ ...settings, autoApprove: !current })
    }
  }, [])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggle}
          data-testid="auto-approve-toggle"
          className={cn(
            'flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-medium transition-colors',
            active
              ? 'text-foreground/70 hover:text-foreground'
              : 'text-muted-foreground/50 hover:text-muted-foreground/70',
          )}
        >
          {active ? <IconShieldCheck className="size-3.5" /> : <IconShieldOff className="size-3.5" />}
          <span>{active ? 'Full access' : 'Ask'}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{active ? 'Auto-approve all tools \u2014 click to require confirmation' : 'Ask before running tools \u2014 click to auto-approve'}</TooltipContent>
    </Tooltip>
  )
})
