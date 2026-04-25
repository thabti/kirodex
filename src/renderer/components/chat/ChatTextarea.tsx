import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { SlashCommandPicker } from './SlashCommandPicker'
import { SlashActionPanel } from './SlashPanels'
import { FileMentionPicker } from './FileMentionPicker'
import { PillsRow } from './PillsRow'
import type { PastedChunk } from '@/hooks/useChatInput'
import type { Attachment, ProjectFile } from '@/types'
import type { SlashPanel } from '@/hooks/useSlashAction'
import type { SlashCommand } from '@/stores/settingsStore'

interface ChatTextareaProps {
  value: string
  disabled?: boolean
  placeholderText: string
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  hasContextRing?: boolean
  // Slash command picker
  showPicker: boolean
  slashQuery: string
  commands: SlashCommand[]
  slashIndex: number
  onSelectCommand: (cmd: SlashCommand) => void
  onDismissSlash: () => void
  // File mention picker
  showFilePicker: boolean
  mentionTrigger: { query: string } | null
  mentionIndex: number
  mentionedFiles: readonly ProjectFile[]
  workspace: string | null
  onSelectFile: (file: ProjectFile) => void
  onDismissMention: () => void
  // Panel
  panel: SlashPanel
  onDismissPanel: () => void
  // Attachments
  imageAttachments: readonly Attachment[]
  nonImageAttachments: readonly Attachment[]
  pastedChunks: readonly PastedChunk[]
  folderPaths: readonly string[]
  onRemoveAttachment: (id: string) => void
  onRemoveMention: (path: string) => void
  onRemoveFolder: (path: string) => void
  onRemoveChunk: (id: number) => void
  // Handlers
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onSelect: (e: React.SyntheticEvent<HTMLTextAreaElement>) => void
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
}

export const ChatTextarea = memo(function ChatTextarea({
  value,
  disabled,
  placeholderText,
  textareaRef,
  hasContextRing,
  showPicker, slashQuery, commands, slashIndex, onSelectCommand, onDismissSlash,
  showFilePicker, mentionTrigger, mentionIndex, mentionedFiles, workspace, onSelectFile, onDismissMention,
  panel, onDismissPanel,
  imageAttachments, nonImageAttachments, pastedChunks,
  folderPaths,
  onRemoveAttachment, onRemoveMention, onRemoveFolder, onRemoveChunk,
  onChange, onKeyDown, onSelect, onPaste,
}: ChatTextareaProps) {
  const [hasScrollShadow, setHasScrollShadow] = useState(false)
  const scrollCheckRef = useRef<number>(0)

  const handleTextareaScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    setHasScrollShadow(e.currentTarget.scrollTop > 0)
  }, [])

  useEffect(() => {
    cancelAnimationFrame(scrollCheckRef.current)
    scrollCheckRef.current = requestAnimationFrame(() => {
      if (textareaRef.current) {
        setHasScrollShadow(textareaRef.current.scrollTop > 0)
      }
    })
  }, [value, textareaRef])

  return (
    <div className="relative px-3 pb-2 pt-3.5 sm:px-4 sm:pt-4" style={{ isolation: 'isolate' }}>
      {showPicker && (
        <SlashCommandPicker
          query={slashQuery}
          commands={commands}
          onSelect={onSelectCommand}
          onDismiss={onDismissSlash}
          activeIndex={slashIndex}
        />
      )}
      {showFilePicker && (
        <FileMentionPicker
          query={mentionTrigger?.query ?? ''}
          workspace={workspace ?? null}
          onSelect={onSelectFile}
          onDismiss={onDismissMention}
          activeIndex={mentionIndex}
        />
      )}
      {panel && <SlashActionPanel panel={panel} onDismiss={onDismissPanel} />}
      {/* Inline image previews */}
      {imageAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {imageAttachments.map((a) => (
            <div key={a.id} className="group relative">
              <img
                src={a.preview}
                alt={a.name}
                className="h-16 w-auto rounded-lg border border-border/40 object-cover"
              />
              <button
                type="button"
                onClick={() => onRemoveAttachment(a.id)}
                aria-label={`Remove ${a.name}`}
                className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-background border border-border/60 text-foreground/60 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground/80"
              >
                <IconX className="size-3" />
              </button>
              <span className="mt-0.5 block max-w-[80px] truncate text-center text-[10px] text-foreground/60">{a.name}</span>
            </div>
          ))}
        </div>
      )}
      {/* Pills row */}
      {(mentionedFiles.length > 0 || nonImageAttachments.length > 0 || pastedChunks.length > 0 || folderPaths.length > 0) && (
        <PillsRow
          mentionedFiles={mentionedFiles}
          nonImageAttachments={nonImageAttachments}
          pastedChunks={pastedChunks}
          folderPaths={folderPaths}
          onRemoveMention={onRemoveMention}
          onRemoveAttachment={onRemoveAttachment}
          onRemoveFolder={onRemoveFolder}
          onRemoveChunk={onRemoveChunk}
        />
      )}
      {/* Scroll shadow */}
      <div
        className={cn(
          'pointer-events-none absolute left-3 right-3 h-6 bg-gradient-to-b from-card to-transparent transition-opacity duration-200 sm:left-4 sm:right-4',
          hasScrollShadow ? 'opacity-100' : 'opacity-0',
        )}
        style={{ top: 'calc(0.875rem)' }}
        aria-hidden
      />
      <textarea
        ref={textareaRef}
        data-testid="chat-textarea"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onSelect={onSelect}
        onPaste={onPaste}
        onScroll={handleTextareaScroll}
        placeholder={placeholderText}
        disabled={disabled}
        rows={1}
        className={cn(
          'block max-h-[200px] min-h-[70px] w-full resize-none rounded-lg bg-transparent text-sm leading-[1.6] text-foreground outline-none placeholder:text-muted-foreground',
          hasContextRing && 'pr-8',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        style={{ overflow: 'auto', fontFamily: 'inherit', caretColor: 'var(--foreground)' }}
      />
    </div>
  )
})
