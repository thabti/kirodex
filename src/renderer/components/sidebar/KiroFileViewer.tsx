import { useEffect, useState, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { IconX, IconExternalLink } from '@tabler/icons-react'
import { ipc } from '@/lib/ipc'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface KiroFileViewerProps {
  filePath: string
  title: string
  onClose: () => void
}

export const KiroFileViewer = memo(function KiroFileViewer({ filePath, title, onClose }: KiroFileViewerProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!filePath) { setContent(null); setLoading(false); return }
    setLoading(true)
    ipc.readFile(filePath).then((c) => { setContent(c); setLoading(false) })
  }, [filePath])

  const shortPath = (filePath ?? '').replace(/^\/Users\/[^/]+/, '~')
  const isJson = filePath.endsWith('.json')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex h-[80vh] w-[680px] max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            <p className="truncate text-[10px] font-mono text-muted-foreground/50 mt-0.5">{shortPath}</p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => ipc.openInEditor(filePath, 'zed')}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-accent hover:text-foreground transition-colors"
              >
                <IconExternalLink className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Open in editor</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onClose}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-accent hover:text-foreground transition-colors"
              >
                <IconX className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close</TooltipContent>
          </Tooltip>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex h-full items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
          {!loading && content === null && (
            <p className="text-sm text-muted-foreground">Could not read file.</p>
          )}
          {!loading && content !== null && isJson && (
            <pre className={cn(
              'text-[12px] leading-relaxed font-mono text-foreground/80',
              'rounded-lg bg-muted/30 p-4 overflow-auto',
            )}>
              {content}
            </pre>
          )}
          {!loading && content !== null && !isJson && (
            <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none
              [&_h1]:text-base [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-0
              [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4
              [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mb-1.5 [&_h3]:mt-3
              [&_p]:text-xs [&_p]:leading-relaxed [&_p]:text-foreground/80
              [&_li]:text-xs [&_li]:leading-relaxed [&_li]:text-foreground/80
              [&_code]:text-[11px] [&_code]:bg-muted/50 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
              [&_pre]:bg-muted/30 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-auto
              [&_pre_code]:bg-transparent [&_pre_code]:p-0
              [&_blockquote]:border-l-2 [&_blockquote]:border-primary/30 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground
              [&_hr]:border-border/50 [&_a]:text-primary [&_a]:no-underline [&_a:hover]:underline
              [&_table]:text-xs [&_th]:font-semibold [&_th]:text-left [&_th]:pb-1
              [&_td]:py-0.5 [&_tr]:border-b [&_tr]:border-border/30
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
