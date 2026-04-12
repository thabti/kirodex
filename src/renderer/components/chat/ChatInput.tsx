import { memo, useEffect } from 'react'
import { IconPaperclip, IconClipboard, IconX } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { SlashCommandPicker } from './SlashCommandPicker'
import { SlashActionPanel } from './SlashPanels'
import { BranchSelector } from './BranchSelector'
import { FileMentionPicker, FileMentionPill } from './FileMentionPicker'
import { AttachmentPreview } from './AttachmentPreview'
import { DragOverlay } from './DragOverlay'
import { ContextRing } from './ContextRing'
import { ModelPicker } from './ModelPicker'
import { ModeToggle } from './ModeToggle'
import { AutoApproveToggle } from './AutoApproveToggle'
import { useChatInput } from '@/hooks/useChatInput'
import { useSettingsStore } from '@/stores/settingsStore'

/** Pill-shaped group wrapper for toolbar items */
const ToolbarGroup = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('flex items-center gap-0.5 rounded-lg bg-muted/50 px-0.5 py-0.5', className)}>
    {children}
  </div>
)

/** Thin dot separator within a group */
const Dot = () => <span className="mx-0.5 size-[3px] shrink-0 rounded-full bg-border" aria-hidden />

interface ChatInputProps {
  disabled?: boolean
  contextUsage?: { used: number; size: number } | null
  messageCount?: number
  isRunning?: boolean
  initialValue?: string
  onSendMessage: (message: string) => void
  onPause?: () => void
  onDraftChange?: (value: string) => void
  workspace?: string | null
}

export const ChatInput = memo(function ChatInput({ disabled, contextUsage, messageCount = 0, isRunning, initialValue, onSendMessage, onPause, onDraftChange, workspace }: ChatInputProps) {
  const {
    value, setValue, textareaRef, canSend,
    slashIndex, slashQuery, commands, filteredCmds, showPicker,
    panel, dismissPanel, handleSelectCommand,
    showFilePicker, mentionTrigger, mentionIndex, mentionedFiles,
    handleSelectFile, handleRemoveMention,
    attachments, isDragOver, fileInputRef,
    handleRemoveAttachment, handlePaste, handleFilePickerClick, handleFileInputChange,
    pastedChunks, handleRemoveChunk,
    handleChange, handleSend, handleKeyDown, handleSelect,
  } = useChatInput({ disabled, isRunning, initialValue, onSendMessage, onPause, onDraftChange })

  const currentModeId = useSettingsStore((s) => s.currentModeId)

  // Listen for /upload slash command
  useEffect(() => {
    const h = () => fileInputRef.current?.click()
    document.addEventListener('slash-upload', h)
    return () => document.removeEventListener('slash-upload', h)
  }, [fileInputRef])

  const isPlanMode = currentModeId === 'kiro_planner'
  const borderFocus = isPlanMode ? 'focus-within:border-teal-500/60' : 'focus-within:border-blue-500/60'
  const borderIdle = isPlanMode ? 'border-teal-500/25' : 'border-border'
  const buttonBg = isPlanMode ? 'bg-teal-500/90 hover:bg-teal-500' : 'bg-blue-500/90 hover:bg-blue-500'

  const contextRingNode = (contextUsage && contextUsage.size > 0)
    ? <ContextRing used={contextUsage.used} size={contextUsage.size} />
    : messageCount > 0
      ? <ContextRing used={Math.min(messageCount * 3, 95)} size={100} />
      : null

  return (
    <div data-testid="chat-input" className="px-4 pt-1.5 pb-3 mb-[20px] sm:px-6 sm:pt-2 sm:pb-4">
      <div className="mx-auto w-full min-w-0 max-w-3xl lg:max-w-4xl xl:max-w-5xl">
        <div className={cn(
          'relative rounded-[20px] border bg-card transition-colors duration-200',
          borderIdle, borderFocus,
          isDragOver && 'border-primary/50',
        )}>
          {isDragOver && <DragOverlay />}

          {contextRingNode && (
            <div className="absolute top-2.5 right-3 z-20 sm:right-4">
              {contextRingNode}
            </div>
          )}

          <div className="relative px-3 pb-2 pt-3.5 sm:px-4 sm:pt-4" style={{ isolation: 'isolate' }}>
            {showPicker && (
              <SlashCommandPicker
                query={slashQuery}
                commands={commands}
                onSelect={handleSelectCommand}
                onDismiss={() => setValue('')}
                activeIndex={slashIndex}
              />
            )}
            {showFilePicker && (
              <FileMentionPicker
                query={mentionTrigger?.query ?? ''}
                workspace={workspace ?? null}
                onSelect={handleSelectFile}
                onDismiss={() => {}}
                activeIndex={mentionIndex}
              />
            )}
            {panel && <SlashActionPanel panel={panel} onDismiss={dismissPanel} />}
            {/* Pills row — mentions, attachments, pasted text */}
            {(mentionedFiles.length > 0 || attachments.length > 0 || pastedChunks.length > 0) && (
              <div className="flex flex-wrap items-center gap-1 mb-1">
                {mentionedFiles.map((f) => (
                  <FileMentionPill key={f.path} path={f.path} onRemove={() => handleRemoveMention(f.path)} />
                ))}
                {attachments.length > 0 && (
                  <AttachmentPreview attachments={attachments} onRemove={handleRemoveAttachment} />
                )}
                {pastedChunks.map((chunk) => (
                  <span
                    key={chunk.id}
                    data-testid="pasted-chunk-pill"
                    className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium align-middle bg-muted/40 text-foreground/60"
                  >
                    <IconClipboard className="size-3.5 shrink-0 text-foreground/30" aria-hidden />
                    <span className="max-w-[120px] truncate">Pasted #{chunk.id}</span>
                    <span className="text-foreground/25">+{chunk.lines > 1 ? `${chunk.lines}L` : `${chunk.chars}c`}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveChunk(chunk.id)}
                      aria-label={`Remove pasted text #${chunk.id}`}
                      className="ml-0.5 flex size-4 items-center justify-center rounded text-foreground/25 hover:text-foreground/50"
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 1l6 6M7 1l-6 6" /></svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              data-testid="chat-textarea"
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onSelect={handleSelect}
              onPaste={handlePaste}
              placeholder="Ask anything, @ to mention files, / for commands"
              disabled={disabled}
              rows={1}
              className="block max-h-[200px] min-h-[70px] w-full resize-none bg-transparent leading-[1.6] text-foreground outline-none placeholder:text-muted-foreground/35"
              style={{ overflow: 'auto', fontFamily: 'inherit', caretColor: 'var(--foreground)' }}
            />
          </div>

          {/* ── Footer toolbar ── */}
          <div className="relative z-10 flex items-center justify-between gap-2 px-3 pb-3 sm:px-4">
            {/* Left: attach + AI controls (mode + model) */}
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleFilePickerClick}
                    aria-label="Attach files"
                    data-testid="attach-files-button"
                    className="flex size-8 items-center justify-center rounded-full text-muted-foreground/40 transition-colors hover:bg-muted/60 hover:text-muted-foreground/70"
                  >
                    <IconPaperclip className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-[11px]">Attach files or images</TooltipContent>
              </Tooltip>
              <ToolbarGroup>
                <ModeToggle />
                <Dot />
                <ModelPicker />
                <Dot />
                <AutoApproveToggle />
              </ToolbarGroup>
            </div>

            {/* Right: git + context + send/pause */}
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <BranchSelector workspace={workspace ?? null} />
                {disabled && <span className="ml-1 text-[11px] text-muted-foreground/40">Task ended</span>}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileInputChange}
                tabIndex={-1}
                aria-hidden
              />
              {isRunning ? (
                <button
                  type="button"
                  onClick={onPause}
                  aria-label="Pause agent"
                  data-testid="pause-button"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white transition-all duration-150 hover:scale-105"
                  style={{ backgroundColor: isPlanMode ? 'rgba(20,184,166,0.9)' : 'rgba(59,130,246,0.9)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                    <rect x="1.5" y="1" width="3" height="10" rx="1" />
                    <rect x="7.5" y="1" width="3" height="10" rx="1" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!canSend}
                  aria-label="Send message"
                  data-testid="send-button"
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150',
                    buttonBg, 'text-white hover:scale-105',
                    'disabled:pointer-events-none disabled:opacity-50 disabled:hover:scale-100',
                  )}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
