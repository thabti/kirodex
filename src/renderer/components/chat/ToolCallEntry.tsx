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
import { ReadOutput } from './ReadOutput'

export const ToolCallEntry = memo(function ToolCallEntry({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false)
  const [fileDiff, setFileDiff] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const Icon = getToolIcon(toolCall.kind, toolCall.title)
  const isRunning = toolCall.status === 'in_progress'
  const isFailed = toolCall.status === 'failed'
  const isCompleted = toolCall.status === 'completed'

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
            ? <IconChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            : <IconChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        ) : null}
        <Icon className={cn(
          'size-3.5 shrink-0',
          isRunning ? 'text-primary' : isFailed ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
        )} />
        <span className={cn(
          'flex-1 truncate',
          isRunning ? 'text-foreground' : 'text-foreground/80',
        )}>
          {toolCall.title}
        </span>
        {shortPath && (
          <span className="hidden sm:inline max-w-[180px] truncate font-mono text-[11px] text-foreground/70">
            {shortPath}
          </span>
        )}
        {diffLoading && <IconLoader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />}
        {isRunning ? (
          <IconLoader2 className="size-3 shrink-0 animate-spin text-primary" />
        ) : isFailed ? (
          <IconX className="size-3 shrink-0 text-red-600 dark:text-red-400" />
        ) : isCompleted ? (
          <IconCheck className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : null}
      </button>

      {expanded && hasDiff && <InlineDiff diffText={fileDiff} />}

      {expanded && hasContent && toolCall.kind === 'read' && (
        <ReadOutput rawInput={toolCall.rawInput} rawOutput={toolCall.rawOutput} />
      )}

      {expanded && hasContent && toolCall.kind !== 'read' && (
        <div className="ml-6 mr-2 mb-1.5 mt-1 min-w-0 rounded-md border border-border/60 bg-background/50 px-3 py-2.5 text-[13px] space-y-2">
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

          <RawInputOutput rawInput={toolCall.rawInput} rawOutput={toolCall.rawOutput} filePath={firstPath} />
        </div>
      )}
    </div>
  )
})

// ── Smarter rendering for rawInput / rawOutput ───────────────────

/** Parse rawInput as an object if possible */
const parseRaw = (raw: unknown): Record<string, unknown> | null => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try { const parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object') return parsed } catch { /* not JSON */ }
  }
  return null
}

/** Check if rawOutput is a simple one-line success/status message */
const isSimpleMessage = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.length < 200 && !trimmed.includes('\n')) return trimmed
  return null
}

const RawInputOutput = memo(function RawInputOutput({
  rawInput,
  rawOutput,
  filePath,
}: {
  rawInput?: unknown
  rawOutput?: unknown
  filePath?: string | null
}) {
  if (rawInput === undefined && rawOutput === undefined) return null

  const inputObj = rawInput !== undefined ? parseRaw(rawInput) : null
  const hasStrReplace = inputObj && typeof inputObj.oldStr === 'string' && typeof inputObj.newStr === 'string'

  // For strReplace-style edits, render a diff instead of raw JSON
  if (hasStrReplace) {
    const oldStr = inputObj.oldStr as string
    const newStr = inputObj.newStr as string
    const path = (inputObj.path as string) ?? filePath ?? 'file'
    const diffText = createPatch(path, oldStr, newStr, '', '', { context: 3 })
    const simpleOut = rawOutput !== undefined ? isSimpleMessage(rawOutput) : null

    return (
      <>
        <InlineDiff diffText={diffText} />
        {simpleOut && (
          <p className="flex items-center gap-1.5 text-[12px] text-emerald-600 dark:text-emerald-400">
            <IconCheck className="size-3 shrink-0" />
            {simpleOut}
          </p>
        )}
        {rawOutput !== undefined && !simpleOut && (
          <FallbackRaw label="Output" raw={rawOutput} />
        )}
      </>
    )
  }

  // Default: render input and output with fallback formatting
  return (
    <>
      {rawInput !== undefined && <FallbackRaw label="Input" raw={rawInput} />}
      {rawOutput !== undefined && (() => {
        const simpleOut = isSimpleMessage(rawOutput)
        if (simpleOut) {
          return (
            <p className="flex items-center gap-1.5 text-[12px] text-emerald-600 dark:text-emerald-400">
              <IconCheck className="size-3 shrink-0" />
              {simpleOut}
            </p>
          )
        }
        return <FallbackRaw label="Output" raw={rawOutput} />
      })()}
    </>
  )
})

const FallbackRaw = memo(function FallbackRaw({ label, raw }: { label: string; raw: unknown }) {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2) ?? ''
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-muted-foreground">{label}</p>
      <pre className="max-h-32 overflow-auto rounded-md bg-background p-2 font-mono text-[12px] leading-[1.6] text-foreground/70">
        {text.slice(0, 1500)}{text.length > 1500 ? '\n…(truncated)' : ''}
      </pre>
    </div>
  )
})
