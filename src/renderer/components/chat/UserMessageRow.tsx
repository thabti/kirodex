import { memo, useState, useRef, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconCopy, IconCheck, IconPhoto, IconFileText, IconFile, IconRobot, IconBolt, IconGitFork, IconX } from '@tabler/icons-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { CollapsedAnswers } from './CollapsedAnswers'
import { highlightNode, SearchQueryContext } from './HighlightText'
import { useFilePreviewStore } from '@/stores/filePreviewStore'
import { useTaskStore } from '@/stores/taskStore'
import { useSettingsStore, selectChatFontSize } from '@/stores/settingsStore'
import { FileTypeIcon } from '@/components/file-tree/FileTypeIcon'
import type { UserMessageRow as UserMessageRowData } from '@/lib/timeline'

/** Match all @mentions: @agent:name, @skill:name, @file/paths */
const MENTION_RE = /@(agent:[\w.-]+|skill:[\w.-]+|(?:\.{0,2}[\\/])?(?:[\w.@-]+[\\/])*[\w.@-]+\.\w{1,10})/g

/** Render text with inline mention pills */
function renderWithMentions(text: string): ReactNode {
  const parts: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(MENTION_RE)) {
    const idx = m.index!
    if (idx > last) parts.push(text.slice(last, idx))
    const ref = m[1]
    if (ref.startsWith('agent:')) {
      const name = ref.slice(6)
      parts.push(
        <span key={idx} className="mx-0.5 inline-flex items-center gap-0.5 rounded bg-blue-500/15 px-1 py-px align-middle text-[13px] font-medium leading-normal text-blue-600 dark:text-blue-400">
          <IconRobot className="size-3 shrink-0" />{name}
        </span>
      )
    } else if (ref.startsWith('skill:')) {
      const name = ref.slice(6)
      parts.push(
        <span key={idx} className="mx-0.5 inline-flex items-center gap-0.5 rounded bg-yellow-500/15 px-1 py-px align-middle text-[13px] font-medium leading-normal text-yellow-600 dark:text-yellow-400">
          <IconBolt className="size-3 shrink-0" />{name}
        </span>
      )
    } else {
      const fileName = ref.split('/').pop() ?? ref
      parts.push(
        <button key={idx} type="button"
          onClick={() => useFilePreviewStore.getState().openPreview(ref)}
          className="mx-0.5 inline-flex items-center gap-1 rounded bg-accent/40 px-1.5 py-px align-middle font-mono text-[13px] leading-normal text-foreground/80 transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
        >
          <FileTypeIcon name={fileName} isDir={false} className="size-3.5 shrink-0" />
          {fileName}
        </button>
      )
    }
    last = idx + m[0].length
  }
  if (last === 0) return text
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

/** Parse attachment blocks out of the message, return clean text + attachment metadata */
function parseAttachments(content: string): { text: string; attachments: Array<{ name: string; type: 'image' | 'file'; src?: string }> } {
  const attachments: Array<{ name: string; type: 'image' | 'file'; src?: string }> = []
  // Extract image attachments: [Attached image: name (...)] + <image src="..." />
  let cleaned = content.replace(
    /\[Attached image: ([^\]]+)\]\n?<image src="(data:[^"]+)" \/>/g,
    (_, name, src) => { attachments.push({ name: name.split(' (')[0], type: 'image', src }); return '' }
  )
  // Extract file attachments with code blocks: [Attached file: name]\n```...\n```
  cleaned = cleaned.replace(
    /\[Attached file: ([^\]]+)\]\n```[\s\S]*?```/g,
    (_, name) => { attachments.push({ name, type: 'file' }); return '' }
  )
  // Extract file attachments with path: [Attached file: name at path]
  cleaned = cleaned.replace(
    /\[Attached file: ([^\]]+) at ([^\]]+)\]/g,
    (_, name) => { attachments.push({ name, type: 'file' }); return '' }
  )
  // Extract binary file attachments: [Attached file: name (size bytes, binary)]
  cleaned = cleaned.replace(
    /\[Attached file: ([^\]]+)\]/g,
    (_, name) => { attachments.push({ name: name.split(' (')[0], type: 'file' }); return '' }
  )
  // Extract standalone <image> tags (from inline image replacement)
  cleaned = cleaned.replace(
    /<image src="(data:([^;]+);base64,[^"]+)" \/>/g,
    (_, src, mime) => {
      const ext = mime.split('/')[1] ?? 'png'
      attachments.push({ name: `image.${ext}`, type: 'image', src })
      return ''
    }
  )
  return { text: cleaned.trim(), attachments }
}

const AttachmentPill = memo(function AttachmentPill({ name, type, src }: { name: string; type: 'image' | 'file'; src?: string }) {
  const [showPreview, setShowPreview] = useState(false)
  const Icon = type === 'image' ? IconPhoto : name.match(/\.(ts|js|tsx|jsx|py|rs|go|rb|java|c|cpp|h|css|html|json|yaml|yml|toml|xml|md|sql|sh)$/i) ? IconFileText : IconFile

  if (type === 'image' && src) {
    return (
      <div className="inline-flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="group/img overflow-hidden rounded-lg border border-border/60 bg-background/70 transition-colors hover:border-border"
          aria-label={`Preview ${name}`}
        >
          <img
            src={src}
            alt={name}
            className="block h-auto max-h-[180px] w-full max-w-[240px] cursor-zoom-in object-cover transition-transform group-hover/img:scale-[1.02]"
          />
        </button>
        {showPreview && createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setShowPreview(false)}
            onKeyDown={(e) => e.key === 'Escape' && setShowPreview(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
            tabIndex={-1}
            ref={(el) => el?.focus()}
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowPreview(false) }}
              className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
              aria-label="Close preview"
            >
              <IconX className="size-5" />
            </button>
            <img
              src={src}
              alt={name}
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body
        )}
      </div>
    )
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={() => type === 'image' && src && setShowPreview((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/50 px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-accent/30"
      >
        <Icon className="size-3 shrink-0" />
        <span className="max-w-[200px] truncate">{name}</span>
      </button>
    </div>
  )
})

export const UserMessageRow = memo(function UserMessageRow({ row }: { row: UserMessageRowData }) {
  const chatFontSize = useSettingsStore(selectChatFontSize)
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchQuery = useContext(SearchQueryContext)

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(row.content).then(() => {
      if (timerRef.current) clearTimeout(timerRef.current)
      setCopied(true)
      timerRef.current = setTimeout(() => setCopied(false), 1200)
    })
  }, [row.content])

  const handleFork = useCallback(() => {
    const { selectedTaskId, forkTask, isForking } = useTaskStore.getState()
    if (selectedTaskId && !isForking) void forkTask(selectedTaskId)
  }, [])

  const timeStr = row.timestamp
    ? new Date(row.timestamp).toLocaleTimeString()
    : ''

  const { text: cleanText, attachments: parsedAttachments } = useMemo(() => parseAttachments(row.content), [row.content])

  const isQuestionAnswer = !!row.questionAnswers?.length
  const displayText = cleanText

  return (
    <div data-testid="user-message-row" className="pb-4" data-timeline-row-kind="user-message">
      <div className={isQuestionAnswer ? 'flex justify-end' : 'flex justify-end'}>
        <div className={`group relative w-fit ${isQuestionAnswer ? 'max-w-[90%] sm:max-w-[85%]' : 'max-w-[85%] sm:max-w-[75%]'}`}>
          {isQuestionAnswer ? (
            <CollapsedAnswers questionAnswers={row.questionAnswers!} />
          ) : (
          <div className="rounded-2xl rounded-br-md border border-border/40 bg-card/80 px-4 py-2.5">
                <div className="space-y-2">
                  {displayText && (
                    <p className="whitespace-pre-wrap break-words leading-[1.7] text-foreground" style={{ fontSize: chatFontSize }}>
                      {highlightNode(renderWithMentions(displayText), searchQuery)}
                    </p>
                  )}
                  {parsedAttachments.length > 0 && (
                    <div className="grid max-w-[420px] grid-cols-2 gap-2">
                      {parsedAttachments.map((a, i) => (
                        <AttachmentPill key={i} name={a.name} type={a.type} src={a.src} />
                      ))}
                    </div>
                  )}
                </div>
          </div>
          )}
          <div className="mt-1 flex items-center justify-end gap-1.5 px-1">
            {!isQuestionAnswer && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleFork}
                    className="rounded-md p-0.5 text-muted-foreground/70 opacity-50 transition-all group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                  >
                    <IconGitFork className="size-3" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Fork thread
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded-md p-0.5 text-muted-foreground/70 opacity-50 transition-all group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                >
                  {copied ? (
                    <IconCheck className="size-3" aria-hidden />
                  ) : (
                    <IconCopy className="size-3" aria-hidden />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {copied ? 'Copied!' : 'Copy message'}
              </TooltipContent>
            </Tooltip>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {timeStr}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
})
