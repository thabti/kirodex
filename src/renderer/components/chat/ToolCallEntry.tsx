import { memo, useState } from 'react'
import {
  IconChevronDown, IconChevronRight, IconCheck, IconLoader2, IconX,
  IconFilePencil, IconTerminal2,
} from '@tabler/icons-react'
import { createPatch } from 'diff'
import type { ToolCall } from '@/types'
import { cn } from '@/lib/utils'
import { useDiffStore } from '@/stores/diffStore'
import { useTaskStore } from '@/stores/taskStore'
import { ipc } from '@/lib/ipc'
import { InlineDiff } from './InlineDiff'
import { getToolIcon } from './tool-call-utils'
import { TaskListDisplay, isTaskListToolCall } from './TaskListDisplay'

export const ToolCallEntry = memo(function ToolCallEntry({ toolCall, allToolCalls }: { toolCall: ToolCall; allToolCalls: ToolCall[] }) {
  const [expanded, setExpanded] = useState(false)
  const [fileDiff, setFileDiff] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const Icon = getToolIcon(toolCall.kind, toolCall.title)
  const isRunning = toolCall.status === 'in_progress'
  const isFailed = toolCall.status === 'failed'
  const isCompleted = toolCall.status === 'completed'
  const isTaskList = isTaskListToolCall(toolCall)

  const firstPath = toolCall.locations?.[0]?.path
  const shortPath = firstPath ? firstPath.split('/').slice(-2).join('/') : null

  const hasContent = !!(
    toolCall.content?.length ||
    toolCall.rawInput !== undefined ||
    toolCall.rawOutput !== undefined
  )

  const isEditOp = toolCall.kind === 'edit' || toolCall.kind === 'delete' || toolCall.kind === 'move'
  const isClickable = isEditOp || hasContent

  const fetchDiffIfNeeded = () => {
    if (!isEditOp || !isCompleted || !firstPath || fileDiff !== null || diffLoading) return
    const taskId = useTaskStore.getState().selectedTaskId
    if (!taskId) return
    setDiffLoading(true)
    ipc.gitDiffFile(taskId, firstPath).then((diff) => {
      if (diff) {
        setFileDiff(diff)
      } else {
        // Git diff empty (already committed) — generate from tool call content
        const diffContent = toolCall.content?.find((c) => c.type === 'diff')
        if (diffContent && (diffContent.oldText != null || diffContent.newText != null)) {
          const generated = createPatch(firstPath, diffContent.oldText ?? '', diffContent.newText ?? '')
          setFileDiff(generated)
        } else {
          setFileDiff('')
        }
      }
      setDiffLoading(false)
    }).catch(() => {
      setFileDiff('')
      setDiffLoading(false)
    })
  }

  const handleClick = () => {
    if (!isClickable) return
    setExpanded((v) => !v)
    if (!expanded) fetchDiffIfNeeded()
  }

  const hasDiff = fileDiff !== null && fileDiff.length > 0

  return (
    <div data-testid="tool-call-entry">
      <button
        onClick={handleClick}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-left transition-colors',
          isClickable ? 'hover:bg-accent/10 cursor-pointer' : 'cursor-default',
        )}
      >
        {isClickable ? (
          expanded
            ? <IconChevronDown className="size-3.5 shrink-0 text-muted-foreground/30" />
            : <IconChevronRight className="size-3.5 shrink-0 text-muted-foreground/30" />
        ) : null}
        <Icon className={cn(
          'size-3.5 shrink-0',
          isRunning ? 'text-primary' : isFailed ? 'text-red-400' : 'text-foreground/40',
        )} />
        <span className={cn(
          'flex-1 truncate',
          isRunning ? 'text-foreground' : 'text-foreground/60',
        )}>
          {toolCall.title}
        </span>
        {shortPath && (
          <span className="hidden sm:inline max-w-[180px] truncate font-mono text-[11px] text-foreground/30">
            {shortPath}
          </span>
        )}
        {diffLoading && <IconLoader2 className="size-3 shrink-0 animate-spin text-muted-foreground/30" />}
        {isRunning ? (
          <IconLoader2 className="size-3 shrink-0 animate-spin text-primary" />
        ) : isFailed ? (
          <IconX className="size-3 shrink-0 text-red-400" />
        ) : isCompleted ? (
          <IconCheck className="size-3 shrink-0 text-emerald-400/60" />
        ) : null}
      </button>

      {expanded && hasDiff && <InlineDiff diffText={fileDiff} />}

      {isTaskList && <TaskListDisplay toolCall={toolCall} allToolCalls={allToolCalls} />}

      {expanded && hasContent && !isTaskList && (
        <div className="ml-6 mr-2 mb-1.5 mt-1 rounded-md border border-border/30 bg-background/50 px-3 py-2.5 text-[13px] space-y-2">
          {toolCall.content?.map((item, i) => (
            <div key={i}>
              {item.type === 'diff' && item.path && (
                <div>
                  <p className="mb-1 flex items-center gap-1 text-muted-foreground">
                    <IconFilePencil className="size-3" />
                    <span className="font-mono">{item.path}</span>
                  </p>
                  {item.newText && (
                    <pre className="max-h-48 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-[12px] leading-[1.6] text-foreground/70">
                      {item.newText.slice(0, 2000)}{item.newText.length > 2000 ? '\n...(truncated)' : ''}
                    </pre>
                  )}
                </div>
              )}
              {item.type === 'terminal' && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <IconTerminal2 className="size-3" />
                  <span className="font-mono">Terminal: {item.terminalId}</span>
                </div>
              )}
              {item.type === 'content' && item.text && (
                <pre className="max-h-48 overflow-auto rounded-md bg-background p-2 font-mono text-[12px] leading-[1.6]">
                  {item.text.slice(0, 2000)}{item.text.length > 2000 ? '\n...(truncated)' : ''}
                </pre>
              )}
            </div>
          ))}

          {toolCall.rawInput !== undefined && (
            <div>
              <p className="mb-1 text-muted-foreground/60">Input</p>
              <pre className="max-h-32 overflow-auto rounded-md bg-background p-2 font-mono text-[12px] leading-[1.6]">
                {typeof toolCall.rawInput === 'string'
                  ? toolCall.rawInput.slice(0, 1500)
                  : JSON.stringify(toolCall.rawInput, null, 2)?.slice(0, 1500)}
              </pre>
            </div>
          )}

          {toolCall.rawOutput !== undefined && (
            <div>
              <p className="mb-1 text-muted-foreground/60">Output</p>
              <pre className="max-h-32 overflow-auto rounded-md bg-background p-2 font-mono text-[12px] leading-[1.6]">
                {typeof toolCall.rawOutput === 'string'
                  ? toolCall.rawOutput.slice(0, 1500)
                  : JSON.stringify(toolCall.rawOutput, null, 2)?.slice(0, 1500)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
})
