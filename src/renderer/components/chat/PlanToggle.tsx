import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { IconChevronDown, IconCode, IconListCheck } from '@tabler/icons-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'
import { ipc } from '@/lib/ipc'
import { cn } from '@/lib/utils'

const MODE_CODE = 'kiro_default' as const
const MODE_PLAN = 'kiro_planner' as const

interface ModeEntry {
  readonly id: string
  readonly label: string
  readonly icon: typeof IconCode
}

const MODES: readonly ModeEntry[] = [
  { id: MODE_CODE, label: 'Code', icon: IconCode },
  { id: MODE_PLAN, label: 'Plan', icon: IconListCheck },
] as const

export const PlanToggle = memo(function PlanToggle() {
  const currentModeId = useSettingsStore((s) => s.currentModeId)
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

  const handleSelect = useCallback((modeId: string) => {
    if (modeId === currentModeId) {
      setIsOpen(false)
      return
    }
    useSettingsStore.setState({ currentModeId: modeId })
    const taskId = useTaskStore.getState().selectedTaskId
    if (taskId) {
      useTaskStore.getState().setTaskMode(taskId, modeId)
      ipc.setMode(taskId, modeId).catch(() => {})
      ipc.sendMessage(taskId, `/agent ${modeId}`).catch(() => {})
    }
    setIsOpen(false)
  }, [currentModeId])

  const isPlan = currentModeId === MODE_PLAN
  const current = MODES.find((m) => m.id === currentModeId) ?? MODES[0]
  const CurrentIcon = current.icon

  return (
    <div ref={ref} data-testid="plan-toggle" className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={`Current mode: ${current.label}`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={cn(
          'flex items-center gap-1 rounded-lg px-1.5 py-1 text-[14px] font-medium transition-colors',
          isPlan
            ? 'text-teal-600 dark:text-teal-400 hover:text-teal-500 dark:hover:text-teal-300'
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
          aria-label="Select mode"
          className="absolute bottom-full left-0 z-[200] mb-2 min-w-[140px] rounded-xl border border-border bg-popover py-1.5 shadow-xl"
        >
          {MODES.map((m) => {
            const isActive = m.id === currentModeId
            const Icon = m.icon
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  handleSelect(m.id)
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-accent',
                  isActive ? 'font-medium text-foreground' : 'text-muted-foreground',
                  m.id === MODE_PLAN && isActive && 'text-teal-600 dark:text-teal-400',
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                {m.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
})
