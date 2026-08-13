import { memo, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { IconBrain, IconCheck, IconChevronDown, IconLoader2 } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePanelResolvedTaskId } from './PanelContext'
import { useTaskStore } from '@/stores/taskStore'
import { cn } from '@/lib/utils'
import {
  applyReasoningEffort,
  REASONING_EFFORT_DESCRIPTIONS,
  REASONING_EFFORT_LABELS,
  REASONING_EFFORTS,
} from '@/lib/reasoning-effort'
import type { ReasoningEffort } from '@/types'

export const ReasoningEffortPicker = memo(function ReasoningEffortPicker({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}) {
  const taskId = usePanelResolvedTaskId()
  const currentEffort = useTaskStore((state) => (
    taskId ? state.taskEfforts[taskId] ?? state.tasks[taskId]?.reasoningEffort : undefined
  ))
  const taskStatus = useTaskStore((state) => (
    taskId ? state.tasks[taskId]?.status : undefined
  ))
  const [pendingEffort, setPendingEffort] = useState<ReasoningEffort | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listboxId = useId()
  const isBusy = taskStatus === 'running' || taskStatus === 'pending_permission'
  const isDisabled = !taskId || isBusy || pendingEffort !== null
  const label = currentEffort ? REASONING_EFFORT_LABELS[currentEffort] : 'Effort'

  const disabledReason = pendingEffort
    ? `Applying ${REASONING_EFFORT_LABELS[pendingEffort]} effort…`
    : !taskId
      ? 'Start a conversation to set reasoning effort'
      : 'Pause or wait for the current response to finish'
  const tooltipText = isDisabled
    ? disabledReason
    : currentEffort
      ? `${label}: ${REASONING_EFFORT_DESCRIPTIONS[currentEffort]}`
      : 'Choose how deeply Kiro reasons for this thread'

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: MouseEvent): void => {
      if (!pickerRef.current?.contains(event.target as Node)) onOpenChange(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen, onOpenChange])

  useEffect(() => {
    if (!isOpen) return
    const selectedIndex = currentEffort
      ? REASONING_EFFORTS.indexOf(currentEffort)
      : 0
    const frameId = requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus())
    return () => cancelAnimationFrame(frameId)
  }, [currentEffort, isOpen])

  const handleToggle = (): void => {
    if (isDisabled) return
    setError(null)
    onOpenChange(!isOpen)
  }

  const handleClose = (): void => {
    onOpenChange(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const currentIndex = optionRefs.current.findIndex((option) => option === document.activeElement)
    let nextIndex: number | null = null
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % REASONING_EFFORTS.length
    if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + REASONING_EFFORTS.length) % REASONING_EFFORTS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = REASONING_EFFORTS.length - 1
    if (event.key === 'Escape') {
      event.preventDefault()
      handleClose()
      return
    }
    if (nextIndex === null) return
    event.preventDefault()
    optionRefs.current[nextIndex]?.focus()
  }

  const handleSelect = async (effort: ReasoningEffort): Promise<void> => {
    if (!taskId || isBusy || pendingEffort) return
    setPendingEffort(effort)
    setError(null)
    try {
      await applyReasoningEffort(taskId, effort)
      onOpenChange(false)
      requestAnimationFrame(() => triggerRef.current?.focus())
    } catch (selectionError: unknown) {
      setError(selectionError instanceof Error
        ? selectionError.message
        : 'Could not update effort. Try again.')
    } finally {
      setPendingEffort(null)
    }
  }

  return (
    <div
      ref={pickerRef}
      className="relative"
      data-slot="reasoning-effort-picker"
      data-testid="reasoning-effort-picker"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            onClick={handleToggle}
            aria-label={isDisabled ? disabledReason : `Reasoning effort: ${label}`}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-controls={isOpen ? listboxId : undefined}
            aria-disabled={isDisabled}
            className={cn(
              'flex min-h-7 items-center gap-1 rounded-lg px-1.5 py-1 text-[12px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              isDisabled
                ? 'cursor-not-allowed text-muted-foreground/45'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            {pendingEffort
              ? <IconLoader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
              : <IconBrain className="size-3.5 shrink-0" aria-hidden />}
            <span className="hidden @[560px]/toolbar:inline">
              {pendingEffort ? 'Applying…' : label}
            </span>
            <IconChevronDown className="hidden size-3 opacity-50 @[560px]/toolbar:block" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 text-[11px]">
          {tooltipText}
        </TooltipContent>
      </Tooltip>

      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Reasoning effort"
          aria-busy={pendingEffort !== null}
          onKeyDown={handleListKeyDown}
          className="absolute bottom-full left-0 z-[200] mb-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover py-1.5 shadow-xl"
        >
          <div className="flex flex-col gap-0.5 border-b border-border/60 px-3 pb-2 pt-1">
            <p className="text-xs font-medium text-foreground">Reasoning effort</p>
            <p className="text-[11px] leading-4 text-muted-foreground">
              Changes apply to your next message. Higher levels can take longer.
            </p>
          </div>
          {REASONING_EFFORTS.map((effort, index) => {
            const isCurrent = currentEffort === effort
            const isPending = pendingEffort === effort
            return (
              <button
                ref={(element) => { optionRefs.current[index] = element }}
                key={effort}
                type="button"
                role="option"
                aria-selected={isCurrent}
                aria-label={`${REASONING_EFFORT_LABELS[effort]}. ${REASONING_EFFORT_DESCRIPTIONS[effort]}${isCurrent ? '. Current' : ''}`}
                disabled={isDisabled}
                onClick={() => { void handleSelect(effort) }}
                className={cn(
                  'flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  isCurrent
                    ? 'bg-accent/60 text-foreground'
                    : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                  'disabled:cursor-wait disabled:opacity-60',
                )}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="block text-xs font-medium">{REASONING_EFFORT_LABELS[effort]}</span>
                  <span className="block truncate text-[11px] font-normal text-muted-foreground">
                    {REASONING_EFFORT_DESCRIPTIONS[effort]}
                  </span>
                </span>
                {isPending
                  ? <IconLoader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
                  : isCurrent && <IconCheck className="size-3.5 shrink-0" aria-hidden />}
              </button>
            )
          })}
          <div className="sr-only" aria-live="polite">
            {pendingEffort ? `Applying ${REASONING_EFFORT_LABELS[pendingEffort]} effort` : ''}
          </div>
          {error && (
            <p className="border-t border-border px-3 py-2 text-[11px] text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
})
