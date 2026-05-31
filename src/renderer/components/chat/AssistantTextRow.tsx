import { memo, useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { IconCopy, IconCheck, IconGitFork, IconMessageCircle, IconHistory, IconAlertTriangle } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import ChatMarkdown from './ChatMarkdown'
import { ThinkingDisplay } from './ThinkingDisplay'
import { isPlanHandoff, PlanHandoffCard } from './PlanHandoffCard'
import { TaskCompletionCard, parseReport, stripReport, shouldRenderReportCard } from './TaskCompletionCard'
import { CompletionDivider } from './CompletionDivider'
import { useTaskStore } from '@/stores/taskStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { ipc } from '@/lib/ipc'
import { toast } from 'sonner'
import { useMessageListTaskId } from './MessageList'
import type { AssistantTextRow as AssistantTextRowData } from '@/lib/timeline'

/** Format duration in ms to a human-readable label */
function formatDurationLabel(ms: number): string {
  if (ms < 1000) return '<1s'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`
}

/**
 * Tiny per-turn metadata chip with model + duration + Rollback affordance.
 * Renders above the assistant content on the final segment of a completed
 * assistant turn. Rollback truncates the message list to this turn and
 * (when a checkpoint exists for a worktree thread) reverts the file tree.
 *
 * The chip itself is rendered cheaply (no Tooltip wrapper for the label
 * row) since the message list can have dozens of these on long threads.
 *
 * TODO: no per-turn checkpoint is created automatically at the moment.
 * `ipc.checkpointCreate` exists but only the diff/code panel surfaces it;
 * the chat pipeline doesn't pin checkpoints to message indices yet, so
 * file revert is best-effort (we look up checkpoints by turn = messageIndex
 * heuristically — if no matching turn is found, only messages are dropped).
 */
const TurnChip = memo(function TurnChip({
  taskId,
  messageIndex,
  durationMs,
}: {
  taskId: string | null
  messageIndex: number
  durationMs?: number
}) {
  const [confirm, setConfirm] = useState(false)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Per-task model id, falling back to the global selection. Both can be
  // stale relative to which model actually answered this turn — we don't
  // record per-message model attribution yet.
  const taskModelId = useTaskStore((s) => taskId ? s.taskModels[taskId] ?? null : null)
  const globalModelId = useSettingsStore((s) => s.currentModelId)
  const availableModels = useSettingsStore((s) => s.availableModels)
  const worktreePath = useTaskStore((s) => taskId ? s.tasks[taskId]?.worktreePath ?? null : null)

  const modelId = taskModelId ?? globalModelId
  const modelLabel = useMemo(() => {
    if (!modelId) return null
    const found = availableModels.find((m) => m.modelId === modelId)
    return found?.name ?? modelId
  }, [modelId, availableModels])

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    }
  }, [])

  const fileRevertActive = !!worktreePath

  const handleRollback = useCallback(async () => {
    if (!taskId) return
    if (!confirm) {
      setConfirm(true)
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
      confirmTimerRef.current = setTimeout(() => setConfirm(false), 3000)
      return
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    setConfirm(false)

    // Truncate chat messages first — this is the always-safe part.
    useTaskStore.getState().rollbackToMessage(taskId, messageIndex)

    // Best-effort worktree revert. Look for a checkpoint that matches this
    // turn number. We use messageIndex as a proxy for turn — works when the
    // backend pins one checkpoint per assistant message but not otherwise.
    if (fileRevertActive) {
      try {
        const list = await ipc.checkpointList(taskId)
        const cp = list.find((c) => c.turn === messageIndex)
        if (cp) {
          await ipc.checkpointRevert(taskId, cp.turn, true)
          toast.success('Rolled back files + messages')
        } else {
          toast.success('Rolled back messages — no matching checkpoint to revert files')
        }
      } catch {
        toast.error('Reverted messages, but file revert failed')
      }
    } else {
      toast.success('Rolled back messages')
    }
  }, [taskId, messageIndex, confirm, fileRevertActive])

  return (
    <div className="mb-2 flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card/60 px-2 py-0.5 text-[11px] text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2 truncate">
        <span aria-hidden className="inline-block size-1.5 shrink-0 rounded-full bg-emerald-500/70" />
        {modelLabel && <span className="truncate">{modelLabel}</span>}
        {durationMs != null && durationMs > 0 && (
          <>
            {modelLabel && <span className="text-muted-foreground/40">·</span>}
            <span className="tabular-nums">{formatDurationLabel(durationMs)}</span>
          </>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleRollback}
            aria-label="Rollback to this turn"
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60',
              confirm
                ? 'bg-destructive/15 text-destructive ring-1 ring-destructive/40 hover:bg-destructive/20'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground hover:ring-1 hover:ring-destructive/30',
            )}
          >
            {confirm
              ? <IconAlertTriangle className="size-3" aria-hidden />
              : <IconHistory className="size-3" aria-hidden />}
            <span>{confirm ? 'Confirm rollback' : 'Rollback to here'}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[11px]">
          {fileRevertActive ? 'Reverts files + messages' : 'Reverts messages only'}
        </TooltipContent>
      </Tooltip>
    </div>
  )
})

export const AssistantTextRow = memo(function AssistantTextRow({ row }: { row: AssistantTextRowData }) {
  // Inline-mode middle segments must not parse the content for report/handoff —
  // they hold a slice of prose, not the full message body.
  const isInline = row.isInlineSegment === true
  const showHandoff = !row.isStreaming && !isInline && isPlanHandoff(row.content)
  const report = useMemo(
    () => (!row.isStreaming && !isInline ? parseReport(row.content) : null),
    [row.isStreaming, row.content, isInline],
  )
  const displayContent = useMemo(
    () => (!row.isStreaming && !isInline ? stripReport(row.content) : row.content),
    [row.isStreaming, row.content, isInline],
  )
  const isRichReport = report && shouldRenderReportCard(report)
  // Only render the card here when there's no changed-files row to host it
  const showReportCard = isRichReport && !row.hasChangedFiles

  const handleFork = useCallback(() => {
    const { selectedTaskId, forkTask, isForking } = useTaskStore.getState()
    if (selectedTaskId && !isForking) void forkTask(selectedTaskId)
  }, [])

  const handleBtw = useCallback(() => {
    // Dispatch the same event as Cmd+B — prefills /btw in the chat input and focuses it
    document.dispatchEvent(new CustomEvent('btw-shortcut'))
  }, [])

  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clean up the copy-feedback timer on unmount to avoid setState on unmounted component
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(row.content).then(() => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      setCopied(true)
      copyTimerRef.current = setTimeout(() => setCopied(false), 1200)
    })
  }, [row.content])

  const ctxTaskId = useMessageListTaskId()
  const showTurnChip =
    !row.isStreaming &&
    !isInline &&
    row.isTurnBoundary === true &&
    typeof row.messageIndex === 'number' &&
    !!ctxTaskId

  return (
    <div data-testid="assistant-text-row" className={cn('group/assistant', row.squashed ? 'pb-2.5' : 'pb-4')} data-timeline-row-kind="assistant-text">
      {row.showCompletionDivider && !row.isStreaming && (
        <CompletionDivider durationMs={row.durationMs} />
      )}
      {showTurnChip && (
        <TurnChip
          taskId={ctxTaskId}
          messageIndex={row.messageIndex!}
          durationMs={row.durationMs}
        />
      )}
      {row.thinking && (
        <ThinkingDisplay text={row.thinking} isActive={row.isStreaming} />
      )}
      {displayContent ? (
        row.isStreaming ? (
          <ChatMarkdown text={displayContent} isStreaming />
        ) : (
          <ChatMarkdown text={displayContent} questionsAnswered={row.questionsAnswered} />
        )
      ) : null}
      {showReportCard && <TaskCompletionCard report={report} />}
      {showHandoff && <PlanHandoffCard />}
      {!row.isStreaming && !isInline && displayContent && (
        <div className="mt-1 flex items-center gap-1 opacity-50 transition-opacity group-hover/assistant:opacity-100 focus-within:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={handleFork} className="rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60">
                <IconGitFork className="size-3" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[11px]">Fork thread</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={handleBtw} className="rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60">
                <IconMessageCircle className="size-3" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[11px]">Side question (/btw)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={handleCopy} className="rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60">
                {copied ? <IconCheck className="size-3" aria-hidden /> : <IconCopy className="size-3" aria-hidden />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[11px]">{copied ? 'Copied!' : 'Copy'}</TooltipContent>
          </Tooltip>
          {row.durationMs != null && row.durationMs > 0 && (
            <span className="ml-1 text-[10px] tabular-nums text-muted-foreground/40">
              {formatDurationLabel(row.durationMs)}
            </span>
          )}
        </div>
      )}
    </div>
  )
})
