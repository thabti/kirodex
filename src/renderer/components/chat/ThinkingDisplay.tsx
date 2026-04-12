import { memo, useState } from 'react'
import { IconBrain, IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface ThinkingDisplayProps {
  text?: string
  isActive?: boolean
}

export const ThinkingDisplay = memo(function ThinkingDisplay({ text, isActive }: ThinkingDisplayProps) {
  const [expanded, setExpanded] = useState(false)
  const hasContent = !!text?.trim()

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-muted/30"
      >
        <IconBrain className={cn('size-4 shrink-0 text-muted-foreground', isActive && 'animate-pulse')} />
        <span className="flex-1 truncate text-[15px] italic text-muted-foreground">
          {hasContent && !expanded ? text : 'Thinking...'}
        </span>
        {hasContent && (
          expanded
            ? <IconChevronDown className="size-3 text-muted-foreground" />
            : <IconChevronRight className="size-3 text-muted-foreground" />
        )}
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200"
        style={{ gridTemplateRows: expanded && hasContent ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <p className="px-4 pb-3 text-[15px] italic text-muted-foreground/70 whitespace-pre-wrap">
            {text}
          </p>
        </div>
      </div>
    </div>
  )
})
