import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { Copy, Check, Circle, Key } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useKiroStore } from '@/stores/kiroStore'
import { ipc } from '@/lib/ipc'
import ChatMarkdown from './ChatMarkdown'
import { ToolCallDisplay } from './ToolCallDisplay'
import { CollapsedAnswers } from './CollapsedAnswers'
import { ThinkingDisplay } from './ThinkingDisplay'
import type {
  UserMessageRow as UserMessageRowData,
  SystemMessageRow as SystemMessageRowData,
  AssistantTextRow as AssistantTextRowData,
  WorkRow as WorkRowData,
} from '@/lib/timeline'

// ── Loading indicator ─────────────────────────────────────────

const LOADING_WORDS = [
  'Thinking',
  'Reasoning',
  'Analyzing',
  'Planning',
  'Processing',
  'Reflecting',
  'Considering',
  'Evaluating',
  'Synthesizing',
  'Crafting',
]

const McpStatusLines = memo(function McpStatusLines() {
  const mcpServers = useKiroStore((s) => s.config.mcpServers ?? [])
  const active = mcpServers.filter((m) => m.enabled && m.status)

  if (active.length === 0) return null

  const needsAction = active.filter(
    (m) => m.status === 'needs-auth' || m.status === 'error',
  )
  const others = active.filter(
    (m) => m.status !== 'needs-auth' && m.status !== 'error',
  )

  return (
    <div className="mt-2 space-y-1.5">
      {needsAction.map((m) => (
        <McpActionBanner key={m.name} server={m} />
      ))}

      {others.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {others.map((m) => {
            const isReady = m.status === 'ready'
            const isConnecting = m.status === 'connecting'
            return (
              <span
                key={m.name}
                className="flex items-center gap-1 text-[10px] text-muted-foreground/40"
              >
                {isConnecting ? (
                  <span className="size-1.5 shrink-0 rounded-full border border-sky-400 border-t-transparent animate-spin" />
                ) : (
                  <Circle
                    className={cn(
                      'size-1.5 shrink-0 fill-current',
                      isReady ? 'text-emerald-400' : 'text-muted-foreground/30',
                    )}
                  />
                )}
                {isConnecting ? `${m.name}\u2026` : m.name}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
})

const McpActionBanner = memo(function McpActionBanner({
  server,
}: {
  server: { name: string; status?: string; error?: string; oauthUrl?: string }
}) {
  const needsAuth = server.status === 'needs-auth'
  const hasError = server.status === 'error'

  if (needsAuth) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-2.5 py-1.5">
        <Key className="size-3 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-medium text-foreground">
            {server.name}
          </span>
          <span className="ml-1 text-[10px] text-muted-foreground">
            — OAuth setup needed. Configure in <code className="rounded bg-muted px-1 text-[10px]">~/.kiro/settings/mcp.json</code>
          </span>
        </div>
      </div>
    )
  }

  if (hasError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.04] px-2.5 py-1.5">
        <Circle className="size-2 shrink-0 fill-current text-red-400" />
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-medium text-foreground">
            {server.name}
          </span>
          <span className="ml-1 text-[10px] text-red-400/70">
            failed to connect
          </span>
          {server.error && (
            <p className="mt-0.5 truncate text-[9px] font-mono text-red-400/50">
              {server.error}
            </p>
          )}
        </div>
      </div>
    )
  }

  return null
})

// ── User message row ──────────────────────────────────────────

export const UserMessageRow = memo(function UserMessageRow({ row }: { row: UserMessageRowData }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(row.content).then(() => {
      if (timerRef.current) clearTimeout(timerRef.current)
      setCopied(true)
      timerRef.current = setTimeout(() => setCopied(false), 1200)
    })
  }, [row.content])

  const timeStr = row.timestamp
    ? new Date(row.timestamp).toLocaleTimeString()
    : ''

  return (
    <div className="pb-3" data-timeline-row-kind="user-message">
      <div className="flex justify-end">
        <div className="group relative max-w-[75%]">
          <div className="rounded-2xl rounded-br-md bg-primary/10 px-3.5 py-2 dark:bg-primary/[0.08]">
            {row.questionAnswers?.length ? (
              <CollapsedAnswers questionAnswers={row.questionAnswers} />
            ) : (
              <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
                {row.content}
              </p>
            )}
          </div>
          <div className="mt-1 flex items-center justify-end gap-1.5 px-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded-md p-0.5 text-muted-foreground/0 transition-all group-hover:text-muted-foreground/50 hover:!text-foreground"
                >
                  {copied ? (
                    <Check className="size-3" aria-hidden />
                  ) : (
                    <Copy className="size-3" aria-hidden />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {copied ? 'Copied!' : 'Copy message'}
              </TooltipContent>
            </Tooltip>
            <span className="text-[10px] tabular-nums text-muted-foreground/30">
              {timeStr}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
})

// ── System message row ────────────────────────────────────────

export const SystemMessageRow = memo(function SystemMessageRow({ row }: { row: SystemMessageRowData }) {
  return (
    <div className="pb-3 px-1" data-timeline-row-kind="system-message">
      <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-[13px] text-destructive/80">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 shrink-0"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>{row.content.replace(/^\u26a0\ufe0f\s*/, '')}</span>
      </div>
    </div>
  )
})

// ── Assistant text row ────────────────────────────────────────

export const AssistantTextRow = memo(function AssistantTextRow({ row }: { row: AssistantTextRowData }) {
  return (
    <div className="pb-4" data-timeline-row-kind="assistant-text">
      {row.thinking && (
        <ThinkingDisplay text={row.thinking} isActive={row.isStreaming} />
      )}
      {row.content ? (
        <ChatMarkdown text={row.content} isStreaming={row.isStreaming} />
      ) : null}
    </div>
  )
})

// ── Work group row ────────────────────────────────────────────

export const WorkGroupRow = memo(function WorkGroupRow({ row }: { row: WorkRowData }) {
  return (
    <div className="pb-3" data-timeline-row-kind="work">
      <ToolCallDisplay toolCalls={row.toolCalls} />
    </div>
  )
})

// ── Working indicator row ─────────────────────────────────────

export const WorkingRow = memo(function WorkingRow() {
  const [idx, setIdx] = useState(() =>
    Math.floor(Math.random() * LOADING_WORDS.length),
  )
  const [visible, setVisible] = useState(true)
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const cycle = () => {
      setVisible(false)
      fadeRef.current = setTimeout(() => {
        setIdx((i) => (i + 1) % LOADING_WORDS.length)
        setVisible(true)
      }, 300)
    }
    const t = setInterval(cycle, 2200)
    return () => {
      clearInterval(t)
      if (fadeRef.current) clearTimeout(fadeRef.current)
    }
  }, [])

  return (
    <div className="py-1 select-none" data-timeline-row-kind="working">
      <div className="flex items-center gap-2">
        <span
          className="text-xs text-muted-foreground/50 transition-opacity duration-300"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {LOADING_WORDS[idx]}&hellip;
        </span>
      </div>
      <McpStatusLines />
    </div>
  )
})
