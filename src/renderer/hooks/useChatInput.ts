import { useState, useRef, useMemo, useCallback, type KeyboardEvent, type ChangeEvent } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'
import { useSlashAction } from '@/hooks/useSlashAction'
import { useAttachments } from '@/hooks/useAttachments'
import { useFileMention } from '@/hooks/useFileMention'
import { buildAttachmentMessage } from '@/components/chat/attachment-utils'

interface UseChatInputOptions {
  disabled?: boolean
  isRunning?: boolean
  onSendMessage: (message: string) => void
  onPause?: () => void
}

export function useChatInput({ disabled, isRunning, onSendMessage, onPause }: UseChatInputOptions) {
  const [value, setValue] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const backendCommands = useSettingsStore((s) => s.availableCommands)
  const { panel, dismissPanel, execute } = useSlashAction()

  const attachmentsBag = useAttachments()
  const mentionBag = useFileMention({ textareaRef, value, setValue })

  // ── Message history cycling (ArrowUp/Down) ─────────────────────
  // -1 = composing new message, 0 = most recent, 1 = second most recent, etc.
  const historyIndexRef = useRef(-1)
  const draftRef = useRef('')  // save the user's in-progress text when entering history

  const commands = useMemo(() => {
    const clientCommands: Array<{ name: string; description?: string }> = [
      { name: 'settings', description: 'Open application settings' },
      { name: 'clear', description: 'Clear the current conversation' },
      { name: 'model', description: 'Switch the active AI model' },
      { name: 'agent', description: 'Switch between agents or list available ones' },
      { name: 'plan', description: 'Start the planning agent to design before building' },
      { name: 'chat', description: 'Switch to chat mode' },
    ]
    const names = new Set(backendCommands.map((c) => c.name.replace(/^\/+/, '')))
    return [...backendCommands, ...clientCommands.filter((c) => !names.has(c.name))]
  }, [backendCommands])

  const isSlash = value.startsWith('/')
  const slashQuery = isSlash ? value.slice(1) : ''
  const filteredCmds = isSlash
    ? (slashQuery ? commands.filter((c) => c.name.replace(/^\/+/, '').toLowerCase().startsWith(slashQuery.toLowerCase())) : commands)
    : []
  const showPicker = isSlash && filteredCmds.length > 0 && !panel
  const showFilePicker = mentionBag.mentionTrigger !== null && !showPicker && !panel

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    setValue(newValue)
    historyIndexRef.current = -1
    resize()
    mentionBag.detectMentionTrigger(newValue, e.target.selectionStart ?? newValue.length)
  }, [resize, mentionBag.detectMentionTrigger])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    const hasAttachments = attachmentsBag.attachments.length > 0
    if ((!trimmed && !hasAttachments) || disabled) return
    dismissPanel()
    let message = trimmed
    if (mentionBag.mentionedFiles.length > 0) {
      const missingRefs = mentionBag.mentionedFiles.filter((f) => !message.includes(`@${f.path}`))
      if (missingRefs.length > 0) {
        message = missingRefs.map((f) => `@${f.path}`).join(' ') + ' ' + message
      }
    }
    if (hasAttachments) {
      const attachmentBlock = buildAttachmentMessage(attachmentsBag.attachments)
      message = message ? `${message}\n\n${attachmentBlock}` : attachmentBlock
    }
    setValue('')
    setSlashIndex(0)
    mentionBag.clearMentions()
    attachmentsBag.clearAttachments()
    onSendMessage(message)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    textareaRef.current?.focus()
  }, [value, disabled, onSendMessage, dismissPanel, mentionBag, attachmentsBag])

  const handleSelectCommand = useCallback((cmd: { name: string }) => {
    if (execute(cmd.name)) {
      setValue('')
      setSlashIndex(0)
      textareaRef.current?.focus()
      return
    }
    setValue(`/${cmd.name} `)
    setSlashIndex(0)
    textareaRef.current?.focus()
  }, [execute])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (panel && e.key === 'Escape') { e.preventDefault(); dismissPanel(); return }
    if (showFilePicker) {
      if (e.key === 'ArrowDown') { e.preventDefault(); mentionBag.incrementMentionIndex(); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); mentionBag.decrementMentionIndex(); return }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        document.dispatchEvent(new CustomEvent('file-mention-select', { detail: { index: mentionBag.mentionIndex } }))
        return
      }
      if (e.key === 'Escape') { e.preventDefault(); mentionBag.dismissMention(); return }
    }
    if (showPicker) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex((i) => i + 1); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex((i) => Math.max(0, i - 1)); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && filteredCmds.length > 0)) {
        e.preventDefault()
        const cmd = filteredCmds[slashIndex % filteredCmds.length]
        if (cmd) handleSelectCommand(cmd)
        return
      }
      if (e.key === 'Escape') { e.preventDefault(); setValue(''); return }
    }

    // ── Message history cycling ──────────────────────────────────
    // ArrowUp at cursor position 0 (or empty) → cycle back through sent messages
    // ArrowDown while browsing history → cycle forward, back to draft
    if (!showPicker && !showFilePicker && !panel) {
      const s = useTaskStore.getState()
      const task = s.selectedTaskId ? s.tasks[s.selectedTaskId] : null
      const msgs = task ? task.messages.filter((m) => m.role === 'user').map((m) => m.content) : []
      if (msgs.length > 0) {
        const el = textareaRef.current
        const cursorAtStart = el ? el.selectionStart === 0 && el.selectionEnd === 0 : true
        const reversed = msgs.reverse() // most recent first

        if (e.key === 'ArrowUp' && (cursorAtStart || historyIndexRef.current >= 0)) {
          const nextIdx = historyIndexRef.current + 1
          if (nextIdx < reversed.length) {
            e.preventDefault()
            if (historyIndexRef.current === -1) draftRef.current = value
            historyIndexRef.current = nextIdx
            setValue(reversed[nextIdx])
            resize()
          }
          return
        }
        if (e.key === 'ArrowDown' && historyIndexRef.current >= 0) {
          e.preventDefault()
          const nextIdx = historyIndexRef.current - 1
          historyIndexRef.current = nextIdx
          setValue(nextIdx < 0 ? draftRef.current : reversed[nextIdx])
          resize()
          return
        }
      }
    }

    if (e.key === 'Escape' && isRunning && onPause) { e.preventDefault(); onPause(); return }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [panel, dismissPanel, showFilePicker, mentionBag, showPicker, filteredCmds, slashIndex, handleSend, handleSelectCommand, isRunning, onPause, value, resize])

  const handleSelect = useCallback(() => {
    if (showPicker || showFilePicker) return
    const el = textareaRef.current
    if (!el) return
    mentionBag.detectMentionTrigger(el.value, el.selectionStart ?? el.value.length)
  }, [showPicker, showFilePicker, mentionBag.detectMentionTrigger])

  const canSend = !disabled && (value.trim().length > 0 || attachmentsBag.attachments.length > 0)

  return {
    // Text state
    value,
    setValue,
    textareaRef,
    canSend,
    // Slash commands
    slashIndex,
    slashQuery,
    commands,
    filteredCmds,
    showPicker,
    panel,
    dismissPanel,
    handleSelectCommand,
    // File mentions
    showFilePicker,
    ...mentionBag,
    // Attachments
    ...attachmentsBag,
    // Handlers
    handleChange,
    handleSend,
    handleKeyDown,
    handleSelect,
  } as const
}
