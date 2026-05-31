import { useRef } from 'react'
import { IconChevronRight, IconChevronDown, IconRefresh } from '@tabler/icons-react'
import { useTaskStore } from '@/stores/taskStore'
import ChatMarkdown from '@/components/chat/ChatMarkdown'
import { cn } from '@/lib/utils'

interface DiffSummaryPanelProps {
  taskId?: string
  collapsed: boolean
  onToggle: () => void
}

export const DiffSummaryPanel = ({ taskId, collapsed, onToggle }: DiffSummaryPanelProps) => {
  const messages = useTaskStore((s) => (taskId ? s.tasks[taskId]?.messages : undefined))
  const lastAssistant = (() => {
    if (!messages || messages.length === 0) return undefined
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i]
    }
    return undefined
  })()

  const scrollRef = useRef<HTMLDivElement>(null)

  const handleRefresh = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  if (collapsed) {
    return (
      <div className="flex shrink-0 flex-col items-center border-l bg-background">
        <button
          type="button"
          onClick={onToggle}
          aria-label="Expand agent summary"
          className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <IconChevronRight className="size-3.5 rotate-180" />
        </button>
      </div>
    )
  }

  return (
    <div
      className="flex shrink-0 flex-col border-l bg-background"
      style={{ width: 280 }}
    >
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b bg-background px-2 py-1.5 shrink-0">
        <button
          type="button"
          onClick={onToggle}
          aria-label="Collapse agent summary"
          className="flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <IconChevronDown className="size-3.5" />
        </button>
        <span className="flex-1 text-[11px] font-medium text-foreground">Agent summary</span>
        <button
          type="button"
          onClick={handleRefresh}
          aria-label="Refresh agent summary"
          className="flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <IconRefresh className="size-3" />
        </button>
      </div>
      <div ref={scrollRef} className={cn('flex-1 min-h-0 overflow-auto')}>
        {lastAssistant && lastAssistant.content.trim().length > 0 ? (
          <div className="p-3 text-[12px] text-foreground/80">
            <ChatMarkdown text={lastAssistant.content} taskId={taskId ?? null} />
          </div>
        ) : (
          <div className="p-3 text-[12px] text-muted-foreground italic">
            No agent summary yet.
          </div>
        )}
      </div>
    </div>
  )
}
