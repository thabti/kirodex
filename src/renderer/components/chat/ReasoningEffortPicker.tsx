import { memo, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { IconBrain, IconCheck, IconChevronDown, IconInfoCircle, IconLoader2 } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePanelResolvedTaskId } from './PanelContext'
import { useTaskStore } from '@/stores/taskStore'
import { ipc } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import {
  applyReasoningEffort,
  REASONING_EFFORT_DESCRIPTIONS,
  REASONING_EFFORT_LABELS,
  REASONING_EFFORTS,
} from '@/lib/reasoning-effort'
import type { ReasoningEffort } from '@/types'

const EFFORT_HINTS: Record<ReasoningEffort, string> = {
  low: 'Fast',
  medium: 'Balanced',
  high: 'Thorough',
  xhigh: 'Extended',
  max: 'Deepest',
}

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
  const [optionsNotice, setOptionsNotice] = useState<string | null>(null)
  const [availableEfforts, setAvailableEfforts] = useState<ReasoningEffort[] | null>(null)
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
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
    if (!isOpen || !taskId) return
    let isCancelled = false
    setIsLoadingOptions(true)
    setAvailableEfforts(null)
    setOptionsNotice(null)

    void ipc.listEffortOptions(taskId)
      .then((efforts) => {
        if (!isCancelled) setAvailableEfforts(efforts)
      })
      .catch(() => {
        if (isCancelled) return
        setAvailableEfforts([...REASONING_EFFORTS])
        setOptionsNotice('Could not verify this model. Kiro will validate your choice.')
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingOptions(false)
      })

    return () => { isCancelled = true }
  }, [isOpen, taskId])

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: MouseEvent): void => {
      if (!pickerRef.current?.contains(event.target as Node)) onOpenChange(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen, onOpenChange])

  useEffect(() => {
    if (isOpen && isBusy) onOpenChange(false)
  }, [isBusy, isOpen, onOpenChange])

  useEffect(() => {
    if (!isOpen || isLoadingOptions || !availableEfforts?.length) return
    const currentIndex = currentEffort ? availableEfforts.indexOf(currentEffort) : -1
    const selectedIndex = currentIndex >= 0 ? currentIndex : 0
    const frameId = requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus())
    return () => cancelAnimationFrame(frameId)
  }, [availableEfforts, currentEffort, isLoadingOptions, isOpen])

  const handleToggle = (): void => {
    if (isDisabled) return
    setError(null)
    if (!isOpen) {
      setAvailableEfforts(null)
      setOptionsNotice(null)
    }
    onOpenChange(!isOpen)
  }

  const handleClose = (): void => {
    onOpenChange(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const effortOptions = availableEfforts ?? []
    if (effortOptions.length === 0) {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleClose()
      }
      return
    }
    const currentIndex = optionRefs.current.findIndex((option) => option === document.activeElement)
    let nextIndex: number | null = null
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % effortOptions.length
    if (event.key === 'ArrowUp') nextIndex = ((currentIndex < 0 ? 0 : currentIndex) - 1 + effortOptions.length) % effortOptions.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = effortOptions.length - 1
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
            data-slot="reasoning-effort-trigger"
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
          aria-busy={pendingEffort !== null || isLoadingOptions}
          onKeyDown={handleListKeyDown}
          data-slot="reasoning-effort-listbox"
          className="absolute bottom-full left-0 z-[200] mb-2 w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-1 motion-safe:duration-150"
        >
          <div data-slot="reasoning-effort-header" className="flex h-8 items-center justify-between gap-2 px-2">
            <p className="text-[11px] font-semibold text-foreground">Reasoning effort</p>
            <span className="text-[10px] text-muted-foreground">Next reply</span>
          </div>
          <div data-slot="reasoning-effort-separator" className="h-px bg-border/60" aria-hidden />

          {isLoadingOptions && (
            <div data-slot="reasoning-effort-loading" className="flex h-20 items-center justify-center gap-2 text-[11px] text-muted-foreground" role="status">
              <IconLoader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              Checking model…
            </div>
          )}

          {!isLoadingOptions && availableEfforts?.length === 0 && (
            <div data-slot="reasoning-effort-empty" className="flex items-center gap-2 px-2 py-3 text-muted-foreground" role="status">
              <IconInfoCircle className="size-3.5 shrink-0" aria-hidden />
              <span className="text-[11px] leading-4">
                This model does not support effort. Choose another model first.
              </span>
            </div>
          )}

          {!isLoadingOptions && availableEfforts?.map((effort, index) => {
            const isCurrent = currentEffort === effort
            const isPending = pendingEffort === effort
            return (
              <button
                ref={(element) => { optionRefs.current[index] = element }}
                key={effort}
                type="button"
                data-slot="reasoning-effort-option"
                role="option"
                aria-selected={isCurrent}
                aria-label={`${REASONING_EFFORT_LABELS[effort]}. ${REASONING_EFFORT_DESCRIPTIONS[effort]}${isCurrent ? '. Current' : ''}`}
                disabled={isDisabled}
                onClick={() => { void handleSelect(effort) }}
                className={cn(
                  'flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  isCurrent
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-accent/60 hover:text-accent-foreground',
                  'disabled:cursor-wait disabled:opacity-60',
                )}
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="text-xs font-medium">{REASONING_EFFORT_LABELS[effort]}</span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {EFFORT_HINTS[effort]}
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
            <p data-slot="reasoning-effort-error" className="mt-1 border-t border-border px-2 py-2 text-[10px] leading-4 text-destructive" role="alert">
              {error}
            </p>
          )}
          {!error && optionsNotice && (
            <p data-slot="reasoning-effort-notice" className="mt-1 border-t border-border px-2 py-2 text-[10px] leading-4 text-muted-foreground" role="status">
              {optionsNotice}
            </p>
          )}
        </div>
      )}
    </div>
  )
})
