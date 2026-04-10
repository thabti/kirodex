import { memo, useCallback } from 'react'
import { IconX, IconFileText, IconFileCode, IconFile, IconPhoto } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import type { Attachment } from '@/types'

const FILE_ICON_MAP: Record<string, typeof IconFile> = {
  image: IconPhoto,
  text: IconFileText,
  binary: IconFile,
}

const EXT_ICON_MAP: Record<string, typeof IconFile> = {
  ts: IconFileCode, tsx: IconFileCode, js: IconFileCode, jsx: IconFileCode,
  py: IconFileCode, rs: IconFileCode, go: IconFileCode, rb: IconFileCode,
  json: IconFileCode, yaml: IconFileCode, yml: IconFileCode, toml: IconFileCode,
  md: IconFileText, txt: IconFileText, csv: IconFileText, log: IconFileText,
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

interface AttachmentPreviewProps {
  readonly attachments: readonly Attachment[]
  readonly onRemove: (id: string) => void
}

export const AttachmentPreview = memo(function AttachmentPreview({
  attachments,
  onRemove,
}: AttachmentPreviewProps) {
  if (attachments.length === 0) return null

  return (
    <div
      className="flex flex-wrap gap-2 pb-2"
      role="list"
      aria-label="Attached files"
    >
      {attachments.map((attachment) => (
        <AttachmentItem
          key={attachment.id}
          attachment={attachment}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
})

interface AttachmentItemProps {
  readonly attachment: Attachment
  readonly onRemove: (id: string) => void
}

const AttachmentItem = memo(function AttachmentItem({
  attachment,
  onRemove,
}: AttachmentItemProps) {
  const handleRemove = useCallback(() => {
    onRemove(attachment.id)
  }, [attachment.id, onRemove])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onRemove(attachment.id)
    }
  }, [attachment.id, onRemove])

  if (attachment.type === 'image' && attachment.preview) {
    return (
      <div
        className="group relative shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted/30"
        role="listitem"
        aria-label={`Image: ${attachment.name}`}
      >
        <img
          src={attachment.preview}
          alt={attachment.name}
          className="h-16 w-16 object-cover"
        />
        <RemoveButton
          name={attachment.name}
          onRemove={handleRemove}
          onKeyDown={handleKeyDown}
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-1 pb-0.5 pt-3">
          <span className="block truncate text-[9px] text-white/90">
            {formatSize(attachment.size)}
          </span>
        </div>
      </div>
    )
  }

  const ext = attachment.name.split('.').pop()?.toLowerCase() ?? ''
  const IconComponent = EXT_ICON_MAP[ext] ?? FILE_ICON_MAP[attachment.type] ?? IconFile

  return (
    <div
      className="group relative flex shrink-0 items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2 pr-7"
      role="listitem"
      aria-label={`File: ${attachment.name}`}
    >
      <IconComponent className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />
      <div className="min-w-0">
        <span className="block max-w-[120px] truncate text-[11px] font-medium text-foreground/80">
          {attachment.name}
        </span>
        <span className="text-[9px] text-muted-foreground/60">
          {formatSize(attachment.size)}
        </span>
      </div>
      <RemoveButton
        name={attachment.name}
        onRemove={handleRemove}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
})

interface RemoveButtonProps {
  readonly name: string
  readonly onRemove: () => void
  readonly onKeyDown: (e: React.KeyboardEvent) => void
}

const RemoveButton = memo(function RemoveButton({
  name,
  onRemove,
  onKeyDown,
}: RemoveButtonProps) {
  return (
    <button
      type="button"
      onClick={onRemove}
      onKeyDown={onKeyDown}
      tabIndex={0}
      aria-label={`Remove ${name}`}
      className={cn(
        'absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full',
        'bg-foreground/70 text-background opacity-0 transition-opacity',
        'group-hover:opacity-100 focus:opacity-100',
      )}
    >
      <IconX className="size-2.5" aria-hidden />
    </button>
  )
})
