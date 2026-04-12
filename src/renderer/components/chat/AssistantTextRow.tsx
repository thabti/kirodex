import { memo } from 'react'
import ChatMarkdown from './ChatMarkdown'
import { ThinkingDisplay } from './ThinkingDisplay'
import type { AssistantTextRow as AssistantTextRowData } from '@/lib/timeline'

export const AssistantTextRow = memo(function AssistantTextRow({ row }: { row: AssistantTextRowData }) {
  return (
    <div data-testid="assistant-text-row" className={row.squashed ? 'pb-2' : 'pb-6'} data-timeline-row-kind="assistant-text">
      {row.thinking && (
        <ThinkingDisplay text={row.thinking} isActive={row.isStreaming} />
      )}
      {row.content ? (
        <ChatMarkdown text={row.content} isStreaming={row.isStreaming} />
      ) : null}
    </div>
  )
})
