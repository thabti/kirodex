import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'

/** Max collapsed height in pixels before truncation kicks in */
const COLLAPSED_HEIGHT = 600

interface CollapsibleContentProps {
  children: ReactNode
}

export const CollapsibleContent = memo(function CollapsibleContent({ children }: CollapsibleContentProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setIsOverflowing(el.scrollHeight > COLLAPSED_HEIGHT + 40)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleToggle()
      }
    },
    [handleToggle],
  )

  const isTruncated = isOverflowing && !isExpanded

  return (
    <div className="relative">
      <div
        ref={contentRef}
        className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
        style={{ maxHeight: isTruncated ? COLLAPSED_HEIGHT : undefined }}
      >
        {children}
      </div>
      {isTruncated && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-card to-transparent" />
      )}
      {isOverflowing && (
        <button
          type="button"
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Show less' : 'Show more'}
          className="mt-1 flex w-full items-center justify-center gap-1 rounded-md border border-border/50 bg-muted py-1.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/80"
        >
          {isExpanded ? (
            <>
              <IconChevronUp className="size-3.5" />
              Show less
            </>
          ) : (
            <>
              <IconChevronDown className="size-3.5" />
              Show more
            </>
          )}
        </button>
      )}
    </div>
  )
})
