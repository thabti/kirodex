import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { IconChevronDown, IconHandStop, IconMessageQuestion } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { ipc } from '@/lib/ipc'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'

export const selectAutoApprove = (s: ReturnType<typeof useSettingsStore.getState>) => {
  const ws = s.activeWorkspace
  const projectPref = ws ? s.settings.projectPrefs?.[ws]?.autoApprove : undefined
  return projectPref !== undefined ? projectPref : (s.settings.autoApprove ?? false)
}

interface PermissionEntry {
  readonly id: 'auto-approve' | 'ask-first'
  readonly label: string
  readonly description: string
  readonly icon: typeof IconHandStop
}

const PERMISSIONS: readonly PermissionEntry[] = [
  { id: 'ask-first', label: 'Ask first', description: 'Confirm before running tools', icon: IconMessageQuestion },
  { id: 'auto-approve', label: 'Auto-approve', description: 'Run all tools without asking', icon: IconHandStop },
] as const

export const AutoApproveToggle = memo(function AutoApproveToggle() {
  const isAutoApprove = useSettingsStore(selectAutoApprove)
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleSelect = useCallback((permissionId: string) => {
    const next = permissionId === 'auto-approve'
    const { settings, activeWorkspace, setProjectPref, saveSettings } = useSettingsStore.getState()
    const current = activeWorkspace
      ? (settings.projectPrefs?.[activeWorkspace]?.autoApprove ?? settings.autoApprove ?? false)
      : (settings.autoApprove ?? false)
    if (next === current) {
      setIsOpen(false)
      return
    }
    if (activeWorkspace) {
      setProjectPref(activeWorkspace, { autoApprove: next })
    } else {
      saveSettings({ ...settings, autoApprove: next })
    }
    const { selectedTaskId, tasks } = useTaskStore.getState()
    if (selectedTaskId) {
      const task = tasks[selectedTaskId]
      const isLive = task && (task.status === 'running' || task.status === 'pending_permission' || task.status === 'paused')
      if (isLive) {
        ipc.setAutoApprove(selectedTaskId, next).catch(() => {})
      }
    }
    setIsOpen(false)
  }, [])

  const currentId = isAutoApprove ? 'auto-approve' : 'ask-first'
  const current = PERMISSIONS.find((p) => p.id === currentId) ?? PERMISSIONS[0]
  const CurrentIcon = current.icon

  return (
    <div ref={ref} data-testid="auto-approve-toggle" className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={`Permissions: ${current.label}`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={cn(
          'flex items-center gap-1 rounded-lg px-1.5 py-1 text-[14px] font-medium transition-colors',
          isAutoApprove
            ? 'text-amber-600 dark:text-amber-400 hover:text-amber-500 dark:hover:text-amber-300'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <CurrentIcon className="size-3.5" aria-hidden />
        <span className="hidden @[480px]/toolbar:inline">{current.label}</span>
        <IconChevronDown className="hidden size-3 shrink-0 opacity-50 @[480px]/toolbar:block" aria-hidden />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Select permissions"
          className="absolute bottom-full left-0 z-[200] mb-2 rounded-lg border border-border bg-popover py-1 shadow-xl"
        >
          {PERMISSIONS.map((p) => {
            const isActive = p.id === currentId
            const Icon = p.icon
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  handleSelect(p.id)
                }}
                className={cn(
                  'flex w-full items-center gap-1.5 whitespace-nowrap px-2.5 py-1 text-xs transition-colors hover:bg-accent',
                  isActive ? 'font-medium text-foreground' : 'text-muted-foreground',
                  p.id === 'auto-approve' && isActive && 'text-amber-600 dark:text-amber-400',
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span>{p.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
})
