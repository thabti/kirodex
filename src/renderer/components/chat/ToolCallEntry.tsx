import { memo, useState, useId } from 'react'
import {
  IconChevronDown, IconChevronRight, IconCheck, IconLoader2, IconX,
  IconFilePencil, IconTerminal2, IconGitCompare, IconPlayerStop,
} from '@tabler/icons-react'
import { createPatch } from 'diff'
import type { ToolCall } from '@/types'
import { cn } from '@/lib/utils'
import { useDiffStore } from '@/stores/diffStore'
import { useTaskStore } from '@/stores/taskStore'
import { ipc } from '@/lib/ipc'
import { InlineDiff } from './InlineDiff'
import { getToolIcon, getToolColor } from './tool-call-utils'
import { FileTypeIcon } from '@/components/file-tree/FileTypeIcon'
import { ReadOutput, parseReadInput } from './ReadOutput'
import { isFetchToolCall, getFetchMeta, shortenUrl, formatBytes, formatDuration } from './fetch-display'
import { getToolDetail, formatToolDuration } from './tool-call-detail'

/** File badge pill with material icon */
const FileBadge = memo(function FileBadge({ path, isDir = false }: { path: string; isDir?: boolean }) {
  const shortPath = path.split('/').slice(-2).join('/')
  const fileName = path.split('/').pop() ?? path
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground/70">
      <FileTypeIcon name={fileName} isDir={isDir} className="size-3.5 shrink-0" />
      {shortPath}
    </span>
  )
})

/** Circular progress spinner for in-progress tool calls — mimics Kiro IDE style */
const ToolProgressRing = memo(function ToolProgressRing() {
  const gradId = useId()
  const r = 6
  const circ = 2 * Math.PI * r
  // Indeterminate: show ~30% arc that spins
  const offset = circ * 0.7

  return (
    <span className="relative flex size-4 shrink-0 items-center justify-center">
      <svg viewBox="0 0 16 16" className="absolute inset-0 animate-spin" style={{ animationDuration: '1.2s' }} aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle cx="8" cy="8" r={r} fill="none" stroke="rgba(139,92,246,0.15)" strokeWidth="2" />
        {/* Progress arc */}
        <circle
          cx="8" cy="8" r={r} fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="2" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
        />
      </svg>
    </span>
  )
})

/** Status icon — circular progress ring for running, checkmark for completed, X for failed, stop for cancelled */
const StatusIcon = memo(function StatusIcon({ status }: { status?: string }) {
  if (status === 'in_progress') {
    return <ToolProgressRing />
  }
  if (status === 'failed') {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-red-500/15">
        <IconX className="size-2.5 text-red-500" />
      </span>
    )
  }
  if (status === 'cancelled') {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-orange-500/15">
        <IconPlayerStop className="size-2.5 text-orange-500" />
      </span>
    )
  }
  if (status === 'completed') {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
        <IconCheck className="size-2.5 text-emerald-500" strokeWidth={3} />
      </span>
    )
  }
  return null
})

export const ToolCallEntry = memo(function ToolCallEntry({ toolCall }: { toolCall: ToolCall }) {
  const isRunning = toolCall.status === 'in_progress'
  const [expanded, setExpanded] = useState(isRunning)
  const [fileDiff, setFileDiff] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const Icon = getToolIcon(toolCall.kind, toolCall.title)
  const colors = getToolColor(toolCall.kind, toolCall.title)
  const isFailed = toolCall.status === 'failed'
  const isCompleted = toolCall.status === 'completed'
  const isCancelled = toolCall.status === 'cancelled'

  const firstPath = toolCall.locations?.[0]?.path
  const isEditOp = toolCall.kind === 'edit' || toolCall.kind === 'delete' || toolCall.kind === 'move'
  const isFetchOp = isFetchToolCall(toolCall)
  const fetchMeta = isFetchOp ? getFetchMeta(toolCall) : null

  // Detect if this is a directory operation (for showing folder icon)
  const isDirectoryOp = (() => {
    if (toolCall.kind === 'read' && toolCall.rawInput) {
      const ops = parseReadInput(toolCall.rawInput)
      if (ops && ops.length === 1 && ops[0].mode === 'Directory') return true
    }
    return false
  })()

  const toolDetail = !isFetchOp ? getToolDetail(toolCall) : null

  const hasContent = !!(
    toolCall.content?.length ||
    toolCall.rawInput !== undefined ||
    toolCall.rawOutput !== undefined
  )

  const isClickable = isEditOp || hasContent || isFailed

  const fetchDiffIfNeeded = () => {
    if (!isEditOp || !isCompleted || !firstPath || fileDiff !== null || diffLoading) return
    const taskId = useTaskStore.getState().selectedTaskId
    if (!taskId) return
    setDiffLoading(true)
    ipc.gitDiffFile(taskId, firstPath).then((diff) => {
      if (diff) {
        setFileDiff(diff)
      } else {
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

  const handleOpenDiff = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!firstPath) return
    useDiffStore.getState().openToFile(firstPath)
  }

  const hasDiff = fileDiff !== null && fileDiff.length > 0

  // Build right-side metadata
  const rightMeta = buildRightMeta(fetchMeta, toolDetail, null)

  return (
    <div data-testid="tool-call-entry" className={cn(
      'group/entry',
      isRunning && 'rounded-lg border border-purple-500/20 bg-purple-500/[0.03]',
    )}>
      <button
        onClick={handleClick}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors',
          isClickable ? 'hover:bg-accent/50 cursor-pointer' : 'cursor-default',
        )}
        style={{ fontSize: 'calc(var(--chat-font-size, 15px) - 2px)' }}
      >
        {/* Chevron */}
        {isClickable ? (
          expanded
            ? <IconChevronDown className="size-3 shrink-0 text-muted-foreground/60" />
            : <IconChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {/* Colored tool icon */}
        <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md', colors.bg)}>
          <Icon className={cn('size-3', colors.icon)} />
        </span>

        {/* Title + file badge + preview */}
        <span className="min-w-0 flex-1 flex items-center gap-1.5 truncate">
          <span className={cn(
            'shrink-0 font-medium',
            isRunning ? 'text-foreground' : 'text-foreground/80',
          )}>
            {toolCall.title}
          </span>

          {/* File badge */}
          {firstPath && <FileBadge path={firstPath} isDir={isDirectoryOp} />}

          {/* Fetch URL */}
          {fetchMeta?.url && (
            <span
              role="link"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                void ipc.openUrl(fetchMeta.url!)
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.stopPropagation()
                e.preventDefault()
                void ipc.openUrl(fetchMeta.url!)
              }}
              title={fetchMeta.url}
              className="truncate font-mono text-[11px] text-primary/80 underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
            >
              {shortenUrl(fetchMeta.url)}
            </span>
          )}

          {/* Tool detail preview (search query, command, etc.) */}
          {toolDetail?.preview && !firstPath && (
            <span className="truncate text-[11px] text-muted-foreground/70 font-mono">
              {toolDetail.preview}
            </span>
          )}
        </span>

        {/* Right metadata */}
        {rightMeta && (
          <span className="hidden sm:inline shrink-0 tabular-nums text-[10px] text-muted-foreground/70">
            {rightMeta}
          </span>
        )}

        {/* Cancelled label */}
        {isCancelled && (
          <span className="shrink-0 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-500">
            Cancelled
          </span>
        )}

        {/* Action buttons (visible on hover or focus) */}
        {isEditOp && isCompleted && firstPath && (
          <span className="shrink-0 inline-flex items-center gap-0.5 opacity-50 transition-opacity group-hover/entry:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={handleOpenDiff}
              className="rounded-md p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
              aria-label="View diff"
            >
              <IconGitCompare className="size-3" />
            </button>
          </span>
        )}

        {/* Loading indicator */}
        {diffLoading && <IconLoader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />}

        {/* Status icon */}
        <StatusIcon status={toolCall.status} />
      </button>

      {expanded && hasDiff && <InlineDiff diffText={fileDiff} />}

      {expanded && hasContent && toolCall.kind === 'read' && (
        <ReadOutput rawInput={toolCall.rawInput} rawOutput={toolCall.rawOutput} />
      )}

      {/* Show error state for failed tool calls with no content */}
      {expanded && isFailed && !hasContent && !hasDiff && (
        <div className="ml-8 mr-2 mb-2 mt-1 min-w-0 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-[12px]">
          <p className="flex items-center gap-1.5 text-red-500/80 text-[11px]">
            <IconX className="size-3" />
            Tool call failed — no details available
          </p>
        </div>
      )}

      {expanded && hasContent && toolCall.kind !== 'read' && (
        <div className="ml-8 mr-2 mb-2 mt-1 min-w-0 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-[12px] space-y-2">
          {toolCall.content?.map((item, i) => (
            <div key={i}>
              {item.type === 'diff' && item.path && (
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                    <IconFilePencil className="size-3" />
                    <FileBadge path={item.path} />
                  </p>
                  {item.newText && (
                    <pre className="max-h-48 overflow-auto rounded-md bg-background/80 p-2 font-mono text-[11px] leading-[1.6] text-foreground/70">
                      {item.newText.slice(0, 2000)}{item.newText.length > 2000 ? '\n...(truncated)' : ''}
                    </pre>
                  )}
                </div>
              )}
              {item.type === 'terminal' && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <IconTerminal2 className="size-3" />
                  <span className="font-mono text-[11px]">Terminal: {item.terminalId}</span>
                </div>
              )}
              {item.type === 'content' && item.text && (
                <pre className="max-h-48 overflow-auto rounded-md bg-background/80 p-2 font-mono text-[11px] leading-[1.6]">
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

// ── Right-side metadata builder ──────────────────────────────────

function buildRightMeta(
  fetchMeta: ReturnType<typeof getFetchMeta> | null,
  toolDetail: ReturnType<typeof getToolDetail> | null,
  shortPath: string | null,
): string | null {
  if (fetchMeta) {
    const parts = [
      fetchMeta.bytes != null ? formatBytes(fetchMeta.bytes) : null,
      fetchMeta.durationMs != null ? formatDuration(fetchMeta.durationMs) : null,
    ].filter(Boolean)
    return parts.length > 0 ? parts.join(' · ') : null
  }

  if (toolDetail) {
    const parts = [
      toolDetail.preview && shortPath ? toolDetail.preview : null,
      toolDetail.durationMs != null && toolDetail.durationMs >= 200
        ? formatToolDuration(toolDetail.durationMs)
        : null,
    ].filter(Boolean)
    return parts.length > 0 ? parts.join(' · ') : null
  }

  return null
}

// ── Smarter rendering for rawInput / rawOutput ───────────────────

const parseRaw = (raw: unknown): Record<string, unknown> | null => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try { const parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object') return parsed } catch { /* not JSON */ }
  }
  return null
}

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
          <p className="flex items-center gap-1.5 text-[11px] text-emerald-500">
            <span className="flex size-3.5 items-center justify-center rounded-full bg-emerald-500/15">
              <IconCheck className="size-2" strokeWidth={3} />
            </span>
            {simpleOut}
          </p>
        )}
        {rawOutput !== undefined && !simpleOut && (
          <FallbackRaw label="Output" raw={rawOutput} />
        )}
      </>
    )
  }

  return (
    <>
      {rawInput !== undefined && <FallbackRaw label="Input" raw={rawInput} />}
      {rawOutput !== undefined && (() => {
        const simpleOut = isSimpleMessage(rawOutput)
        if (simpleOut) {
          return (
            <p className="flex items-center gap-1.5 text-[11px] text-emerald-500">
              <span className="flex size-3.5 items-center justify-center rounded-full bg-emerald-500/15">
                <IconCheck className="size-2" strokeWidth={3} />
              </span>
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
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <pre className="max-h-32 overflow-auto rounded-md bg-background/80 p-2 font-mono text-[11px] leading-[1.6] text-foreground/70">
        {text.slice(0, 1500)}{text.length > 1500 ? '\n…(truncated)' : ''}
      </pre>
    </div>
  )
})
