import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconCopy, IconCheck, IconPencilPlus, IconMessagePlus } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface ToolbarState {
  text: string
  x: number
  y: number
}

interface SelectionToolbarProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  workspace?: string | null
}

const TOOLBAR_WIDTH_ESTIMATE = 160
const TOOLBAR_HEIGHT_ESTIMATE = 36
const EDGE_MARGIN = 8

function clampX(x: number): number {
  const half = TOOLBAR_WIDTH_ESTIMATE / 2
  return Math.max(half + EDGE_MARGIN, Math.min(window.innerWidth - half - EDGE_MARGIN, x))
}

function clampY(rawTop: number, selectionBottom: number): number {
  const above = rawTop - TOOLBAR_HEIGHT_ESTIMATE - EDGE_MARGIN
  if (above >= EDGE_MARGIN) return rawTop
  return selectionBottom + EDGE_MARGIN
}

export const SelectionToolbar = memo(function SelectionToolbar({ containerRef, workspace }: SelectionToolbarProps) {
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const flipRef = useRef(false)

  const dismiss = useCallback(() => {
    setToolbar(null)
    setCopied(false)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMouseUp = () => {
      requestAnimationFrame(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          setToolbar(null)
          return
        }

        const text = sel.toString().trim()
        const range = sel.getRangeAt(0)
        const rect = range.getBoundingClientRect()

        const rawX = rect.left + rect.width / 2
        const rawY = rect.top - 8
        const x = clampX(rawX)
        flipRef.current = rawY - TOOLBAR_HEIGHT_ESTIMATE - EDGE_MARGIN < EDGE_MARGIN
        const y = clampY(rawY, rect.bottom)

        setToolbar({ text, x, y })
        setCopied(false)
      })
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return
      setToolbar(null)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }

    container.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      container.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [containerRef, dismiss])

  useEffect(() => {
    return () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current) }
  }, [])

  const handleCopy = useCallback(() => {
    if (!toolbar) return
    void navigator.clipboard.writeText(toolbar.text).then(() => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      setCopied(true)
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500)
    })
  }, [toolbar])

  const handleAddToChat = useCallback(() => {
    if (!toolbar) return
    const current = (document.querySelector('textarea[data-chat-input]') as HTMLTextAreaElement | null)?.value ?? ''
    const prefix = current.trim() ? current.trimEnd() + '\n\n' : ''
    document.dispatchEvent(new CustomEvent('selection-insert', { detail: { text: toolbar.text, prefix } }))
    dismiss()
  }, [toolbar, dismiss])

  const handleNewThread = useCallback(() => {
    if (!toolbar) return
    document.dispatchEvent(new CustomEvent('selection-new-thread', { detail: { text: toolbar.text, workspace } }))
    dismiss()
  }, [toolbar, workspace, dismiss])

  if (!toolbar) return null

  const translateY = flipRef.current ? '8px' : 'calc(-100% - 8px)'

  return createPortal(
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Selection actions"
      style={{
        position: 'fixed',
        left: toolbar.x,
        top: toolbar.y,
        transform: `translate(-50%, ${translateY})`,
        zIndex: 9999,
      }}
      className="flex items-stretch rounded-lg border border-border/70 bg-popover shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
    >
      {/* Copy — primary, icon + label */}
      <button
        type="button"
        aria-label={copied ? 'Copied' : 'Copy selection'}
        onClick={handleCopy}
        className={cn(
          'flex items-center gap-1.5 rounded-l-[7px] pl-3 pr-2.5 text-[12px] font-medium transition-colors',
          copied
            ? 'text-emerald-500 dark:text-emerald-400'
            : 'text-foreground hover:bg-accent',
        )}
      >
        {copied
          ? <IconCheck className="size-3.5 shrink-0" strokeWidth={2.5} />
          : <IconCopy className="size-3.5 shrink-0" strokeWidth={1.75} />}
        <span>{copied ? 'Copied!' : 'Copy'}</span>
      </button>

      <div className="my-1.5 w-px bg-border/60 shrink-0" />

      {/* Add to chat — icon only + tooltip */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Add to chat input"
            onClick={handleAddToChat}
            className="flex items-center justify-center px-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <IconPencilPlus className="size-3.5 shrink-0" strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[11px]">Add to chat</TooltipContent>
      </Tooltip>

      <div className="my-1.5 w-px bg-border/60 shrink-0" />

      {/* New thread — icon only + tooltip */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Start new thread with selection"
            onClick={handleNewThread}
            className="flex items-center justify-center rounded-r-[7px] px-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <IconMessagePlus className="size-3.5 shrink-0" strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[11px]">New thread</TooltipContent>
      </Tooltip>
    </div>,
    document.body
  )
})
