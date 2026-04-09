import { memo } from 'react'
import { Paperclip } from 'lucide-react'
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

const Sep = () => <span className="mx-1.5 h-3.5 w-px shrink-0 bg-border/60" aria-hidden />

interface ChatInputProps {
  disabled?: boolean
  contextUsage?: { used: number; size: number } | null
  messageCount?: number
  isRunning?: boolean
  onSendMessage: (message: string) => void
  onPause?: () => void
  workspace?: string | null
}

export const ChatInput = memo(function ChatInput({ disabled, contextUsage, messageCount = 0, isRunning, onSendMessage, onPause, workspace }: ChatInputProps) {
  const {
    value, setValue, textareaRef, canSend,
    slashIndex, slashQuery, commands, filteredCmds, showPicker,
    panel, dismissPanel, handleSelectCommand,
    showFilePicker, mentionTrigger, mentionIndex, mentionedFiles,
    handleSelectFile, handleRemoveMention,
    attachments, isDragOver, fileInputRef,
    handleRemoveAttachment, handlePaste, handleFilePickerClick, handleFileInputChange,
    handleChange, handleSend, handleKeyDown, handleSelect,
  } = useChatInput({ disabled, isRunning, onSendMessage, onPause })

  const currentModeId = useSettingsStore((s) => s.currentModeId)
  const isPlanMode = currentModeId === 'kiro_planner'
  const borderFocus = isPlanMode ? 'focus-within:border-red-500/60' : 'focus-within:border-violet-500/60'
  const borderIdle = isPlanMode ? 'border-red-500/25' : 'border-border'
  const buttonBg = isPlanMode ? 'bg-red-500/90 hover:bg-red-500' : 'bg-violet-500/90 hover:bg-violet-500'

  return (
    <div data-testid="chat-input" className="px-4 pt-1.5 pb-3 mb-[20px] sm:px-6 sm:pt-2 sm:pb-4">
      <div className="mx-auto w-full min-w-0 max-w-2xl lg:max-w-3xl xl:max-w-4xl">
        <div className={cn(
          'relative rounded-[20px] border bg-card transition-colors duration-200',
          borderIdle, borderFocus,
          isDragOver && 'border-primary/50',
        )}>
          {isDragOver && <DragOverlay />}

          {(contextUsage && contextUsage.size > 0) ? (
            <div className="absolute right-3 top-2.5 z-10">
              <ContextRing used={contextUsage.used} size={contextUsage.size} />
            </div>
          ) : messageCount > 0 ? (
            <div className="absolute right-3 top-2.5 z-10">
              <ContextRing used={Math.min(messageCount * 3, 95)} size={100} />
            </div>
          ) : null}

          {mentionedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-3 sm:px-4">
              {mentionedFiles.map((f) => (
                <FileMentionPill key={f.path} path={f.path} onRemove={() => handleRemoveMention(f.path)} />
              ))}
            </div>
          )}

          <AttachmentPreview attachments={attachments} onRemove={handleRemoveAttachment} />

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
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onSelect={handleSelect}
              onPaste={handlePaste}
              placeholder="Ask anything, @ to mention files, / for commands"
              disabled={disabled}
              rows={1}
              className="block max-h-[200px] min-h-[70px] w-full resize-none bg-transparent text-[14px] leading-[1.6] text-foreground outline-none placeholder:text-muted-foreground/35"
              style={{ overflow: 'auto', fontFamily: 'inherit', caretColor: 'var(--foreground)' }}
            />
          </div>

          <div className="relative z-10 flex items-center justify-between gap-1.5 px-3 pb-3 sm:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-0 overflow-visible">
              <ModelPicker />
              <Sep />
              <ModeToggle />
              <Sep />
              <AutoApproveToggle />
              <Sep />
              <BranchSelector workspace={workspace ?? null} />
              {disabled && <span className="ml-2 text-[11px] text-muted-foreground/40">Task ended</span>}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleFilePickerClick}
                    aria-label="Attach files"
                    className="flex items-center justify-center rounded-lg p-1 text-muted-foreground/40 transition-colors hover:text-muted-foreground/70"
                  >
                    <Paperclip className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-[11px]">Attach files or images</TooltipContent>
              </Tooltip>
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
                <>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!canSend}
                    aria-label="Queue message"
                    data-testid="queue-button"
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150',
                      'bg-muted text-foreground/70 hover:bg-muted/80 hover:scale-105',
                      'disabled:pointer-events-none disabled:opacity-30 disabled:hover:scale-100',
                    )}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={onPause}
                    aria-label="Pause agent"
                    data-testid="pause-button"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-white transition-all duration-150 hover:scale-105"
                    style={{ backgroundColor: isPlanMode ? 'rgba(239,68,68,0.9)' : 'rgba(139,92,246,0.9)' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                      <rect x="1.5" y="1" width="3" height="10" rx="1" />
                      <rect x="7.5" y="1" width="3" height="10" rx="1" />
                    </svg>
                  </button>
                </>
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
                    'disabled:pointer-events-none disabled:opacity-30 disabled:hover:scale-100',
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
