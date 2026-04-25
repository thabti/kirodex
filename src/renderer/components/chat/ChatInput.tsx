import { memo, useEffect, useMemo } from 'react'
import { IconChevronUp } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { ChatTextarea } from './ChatTextarea'
import { ChatToolbar } from './ChatToolbar'
import { DragOverlay } from './DragOverlay'
import { ContextRing } from './ContextRing'
import { useChatInput } from '@/hooks/useChatInput'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'
import { useModifierKeys } from '@/hooks/useModifierKeys'

import type { Attachment, ProjectFile } from '@/types'
import type { PastedChunk } from '@/hooks/useChatInput'

// Re-export for backwards compatibility (used by tests)
export { PillsRow, PILLS_COLLAPSE_THRESHOLD } from './PillsRow'

interface ChatInputProps {
  disabled?: boolean
  disabledReason?: string
  contextUsage?: { used: number; size: number } | null
  messageCount?: number
  isRunning?: boolean
  initialValue?: string
  initialAttachments?: Attachment[]
  initialFolderPaths?: string[]
  initialPastedChunks?: PastedChunk[]
  initialMentionedFiles?: ProjectFile[]
  autoFocus?: boolean
  hasQueuedMessages?: boolean
  onSendMessage: (message: string) => void
  onPause?: () => void
  onDraftChange?: (value: string) => void
  onAttachmentsChange?: (attachments: Attachment[]) => void
  onFolderPathsChange?: (paths: string[]) => void
  onPastedChunksChange?: (chunks: PastedChunk[]) => void
  onMentionedFilesChange?: (files: ProjectFile[]) => void
  workspace?: string | null
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  isWorktree?: boolean
}

export const ChatInput = memo(function ChatInput({ disabled, disabledReason, contextUsage, messageCount = 0, isRunning, initialValue, initialAttachments, initialFolderPaths, initialPastedChunks, initialMentionedFiles, autoFocus, hasQueuedMessages, onSendMessage, onPause, onDraftChange, onAttachmentsChange, onFolderPathsChange, onPastedChunksChange, onMentionedFilesChange, workspace, isCollapsed, onToggleCollapse, isWorktree }: ChatInputProps) {
  const {
    value, setValue, textareaRef, canSend,
    slashIndex, slashQuery, commands, filteredCmds, showPicker,
    panel, dismissPanel, handleSelectCommand,
    showFilePicker, mentionTrigger, mentionIndex, mentionedFiles,
    handleSelectFile, handleRemoveMention, detectMentionTrigger, dismissMention,
    attachments, isDragOver, fileInputRef,
    handleRemoveAttachment, handlePaste, handleFilePickerClick, handleFileInputChange,
    folderPaths, handleRemoveFolder,
    pastedChunks, handleRemoveChunk,
    handleChange, handleSend, handleKeyDown, handleSelect,
  } = useChatInput({ disabled, isRunning, initialValue, initialAttachments, initialFolderPaths, initialPastedChunks, initialMentionedFiles, onSendMessage, onPause, onDraftChange, onAttachmentsChange, onFolderPathsChange, onPastedChunksChange, onMentionedFilesChange })

  const currentModeId = useSettingsStore((s) => s.currentModeId)
  const compactionStatus = useTaskStore((s) => s.selectedTaskId ? s.tasks[s.selectedTaskId]?.compactionStatus : undefined)
  const isMetaHeld = useModifierKeys()

  const imageAttachments = useMemo(() => attachments.filter((a) => a.type === 'image' && a.preview), [attachments])
  const nonImageAttachments = useMemo(() => attachments.filter((a) => a.type !== 'image' || !a.preview), [attachments])

  // Listen for /upload slash command
  useEffect(() => {
    const h = () => fileInputRef.current?.click()
    document.addEventListener('slash-upload', h)
    return () => document.removeEventListener('slash-upload', h)
  }, [fileInputRef])

  // Listen for Cmd+B btw shortcut — prefill /btw in the input
  useEffect(() => {
    const h = () => {
      setValue('/btw ')
      textareaRef.current?.focus()
    }
    document.addEventListener('btw-shortcut', h)
    return () => document.removeEventListener('btw-shortcut', h)
  }, [setValue, textareaRef])

  // Listen for splash-insert (EmptyThreadSplash click)
  useEffect(() => {
    const h = (e: Event) => {
      const text = (e as CustomEvent<string>).detail
      if (!text) return
      setValue(text)
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(text.length, text.length)
        detectMentionTrigger(text, text.length)
      })
    }
    document.addEventListener('splash-insert', h)
    return () => document.removeEventListener('splash-insert', h)
  }, [setValue, textareaRef, detectMentionTrigger])

  // Auto-focus textarea
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [autoFocus, textareaRef])

  // Cmd+Enter global shortcut to focus the chat input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        textareaRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [textareaRef])

  const isPlanMode = currentModeId === 'kiro_planner'
  const borderFocus = isPlanMode ? 'focus-within:border-teal-500/60' : 'focus-within:border-blue-500/60'
  const borderIdle = isPlanMode ? 'border-teal-500/25' : 'border-border'

  const contextRingNode = (contextUsage && contextUsage.size > 0)
    ? <ContextRing used={contextUsage.used} size={contextUsage.size} compactionStatus={compactionStatus} />
    : messageCount > 0
      ? <ContextRing used={Math.min(messageCount * 3, 95)} size={100} />
      : null

  const placeholderText = disabled
    ? (disabledReason ?? 'Task ended')
    : 'Ask anything, @ to mention files, / for commands — Shift+Enter for newline'

  if (isCollapsed) {
    return (
      <div data-testid="chat-input-collapsed" className="px-4 pb-3 sm:px-6">
        <div className="mx-auto w-full min-w-0 max-w-3xl lg:max-w-4xl xl:max-w-5xl">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expand chat input"
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-2xl border bg-card px-4 py-2.5 transition-colors',
              borderIdle,
              'hover:border-muted-foreground/30',
            )}
          >
            <span className="text-[13px] text-muted-foreground">Type a message…</span>
            <IconChevronUp className="size-4 text-muted-foreground/80" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="chat-input" className="px-4 pt-1.5 pb-4 sm:px-6 sm:pt-2 sm:pb-5">
      <div className="mx-auto w-full min-w-0 max-w-3xl lg:max-w-4xl xl:max-w-5xl">
        <div className={cn(
          'relative rounded-[20px] border-2 bg-card transition-colors duration-200',
          borderIdle, borderFocus,
          isDragOver && 'border-primary/50',
        )}>
          <DragOverlay visible={isDragOver} />
          {contextRingNode && (
            <div className="absolute top-2.5 right-3 z-20 sm:right-4">
              {contextRingNode}
            </div>
          )}
          <ChatTextarea
            value={value}
            disabled={disabled}
            placeholderText={placeholderText}
            textareaRef={textareaRef}
            hasContextRing={!!contextRingNode}
            showPicker={showPicker}
            slashQuery={slashQuery}
            commands={commands}
            slashIndex={slashIndex}
            onSelectCommand={handleSelectCommand}
            onDismissSlash={() => setValue('')}
            showFilePicker={showFilePicker}
            mentionTrigger={mentionTrigger}
            mentionIndex={mentionIndex}
            mentionedFiles={mentionedFiles}
            workspace={workspace ?? null}
            onSelectFile={handleSelectFile}
            onDismissMention={dismissMention}
            panel={panel}
            onDismissPanel={dismissPanel}
            imageAttachments={imageAttachments}
            nonImageAttachments={nonImageAttachments}
            pastedChunks={pastedChunks}
            folderPaths={folderPaths}
            onRemoveAttachment={handleRemoveAttachment}
            onRemoveMention={handleRemoveMention}
            onRemoveFolder={handleRemoveFolder}
            onRemoveChunk={handleRemoveChunk}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onSelect={handleSelect}
            onPaste={handlePaste}
          />
          <ChatToolbar
            isPlanMode={isPlanMode}
            isRunning={isRunning}
            canSend={canSend}
            hasQueuedMessages={hasQueuedMessages}
            workspace={workspace ?? null}
            isWorktree={isWorktree}
            isMetaHeld={isMetaHeld}
            fileInputRef={fileInputRef}
            onFilePickerClick={handleFilePickerClick}
            onFileInputChange={handleFileInputChange}
            onSend={handleSend}
            onPause={onPause}
          />
        </div>
      </div>
    </div>
  )
})
