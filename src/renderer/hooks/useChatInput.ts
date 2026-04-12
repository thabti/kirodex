import { useState, useRef, useMemo, useCallback, useEffect, type KeyboardEvent, type ChangeEvent, type ClipboardEvent } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'
import { useSlashAction } from '@/hooks/useSlashAction'
import { useAttachments } from '@/hooks/useAttachments'
import { useFileMention } from '@/hooks/useFileMention'
import { buildMessageWithInlineImages } from '@/components/chat/attachment-utils'

export interface PastedChunk {
  id: number
  text: string
  lines: number
  chars: number
}

const PASTE_WORD_THRESHOLD = 4
const PASTE_LINE_THRESHOLD = 1

function isLargePaste(text: string): boolean {
  if (text.split('\n').length > PASTE_LINE_THRESHOLD) return true
  if (text.trim().split(/\s+/).length > PASTE_WORD_THRESHOLD) return true
  return false
}

function makePlaceholder(id: number, lines: number, chars: number): string {
  const detail = lines > 1 ? `${lines} lines` : `${chars} chars`
  return `[Pasted text #${id} +${detail}]`
}

interface UseChatInputOptions {
  disabled?: boolean
  isRunning?: boolean
  initialValue?: string
  onSendMessage: (message: string) => void
  onPause?: () => void
  onDraftChange?: (value: string) => void
}

export function useChatInput({ disabled, isRunning, initialValue, onSendMessage, onPause, onDraftChange }: UseChatInputOptions) {
  const [value, setValue] = useState(initialValue ?? '')
  const [slashIndex, setSlashIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const backendCommands = useSettingsStore((s) => s.availableCommands)
  const { panel, dismissPanel, execute } = useSlashAction()

  const attachmentsBag = useAttachments()
  const mentionBag = useFileMention({ textareaRef, value, setValue })

  // ── Pasted text chunks ─────────────────────────────────────────
  const [pastedChunks, setPastedChunks] = useState<PastedChunk[]>([])
  const chunkCounterRef = useRef(0)

  const handleTextPaste = useCallback((e: ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain')
    if (!text || !isLargePaste(text)) return
    // Let image pastes pass through to useAttachments
    const hasImages = Array.from(e.clipboardData.items).some((i) => i.type.startsWith('image/'))
    if (hasImages) return
    e.preventDefault()
    const id = ++chunkCounterRef.current
    const lines = text.split('\n').length
    const chars = text.length
    setPastedChunks((prev) => [...prev, { id, text, lines, chars }])
    const placeholder = makePlaceholder(id, lines, chars)
    const el = textareaRef.current
    if (el) {
      const start = el.selectionStart
      const end = el.selectionEnd
      const before = value.slice(0, start)
      const after = value.slice(end)
      const newValue = before + placeholder + after
      setValue(newValue)
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + placeholder.length
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`
      })
    } else {
      setValue((v) => v + placeholder)
    }
  }, [value])

  const handleRemoveChunk = useCallback((id: number) => {
    setPastedChunks((prev) => {
      const chunk = prev.find((c) => c.id === id)
      if (chunk) {
        const exact = makePlaceholder(chunk.id, chunk.lines, chunk.chars)
        const fuzzy = new RegExp(`\\[Pasted text #${chunk.id}\\b[^\\]]*\\]`)
        setValue((v) => {
          const replaced = v.replace(exact, '')
          return replaced !== v ? replaced : v.replace(fuzzy, '')
        })
      }
      return prev.filter((c) => c.id !== id)
    })
  }, [])

  // Expand placeholders back to full text.
  // Uses regex so minor edits to the detail suffix don't break expansion.
  const expandChunks = useCallback((text: string): string => {
    let result = text
    for (const chunk of pastedChunks) {
      const exact = makePlaceholder(chunk.id, chunk.lines, chunk.chars)
      if (result.includes(exact)) {
        result = result.replace(exact, chunk.text)
      } else {
        // Tolerate edits: match [Pasted text #<id> ...anything... ]
        const fuzzy = new RegExp(`\\[Pasted text #${chunk.id}\\b[^\\]]*\\]`)
        result = result.replace(fuzzy, chunk.text)
      }
    }
    return result
  }, [pastedChunks])

  // Remove orphaned chunks whose placeholder was deleted from the textarea
  useEffect(() => {
    if (pastedChunks.length === 0) return
    setPastedChunks((prev) =>
      prev.filter((chunk) => {
        const exact = makePlaceholder(chunk.id, chunk.lines, chunk.chars)
        if (value.includes(exact)) return true
        const fuzzy = new RegExp(`\\[Pasted text #${chunk.id}\\b`)
        return fuzzy.test(value)
      }),
    )
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only reacts to value

  // ── Draft save (debounced) ─────────────────────────────────────
  const onDraftChangeRef = useRef(onDraftChange)
  onDraftChangeRef.current = onDraftChange
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    if (!onDraftChangeRef.current) return
    const timer = setTimeout(() => onDraftChangeRef.current?.(value), 300)
    return () => clearTimeout(timer)
  }, [value])

  // Flush draft on unmount so a fast navigate doesn't lose the last keystrokes
  useEffect(() => {
    return () => onDraftChangeRef.current?.(valueRef.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intentional unmount-only effect

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
      { name: 'upload', description: 'Upload images or files' },
      { name: 'close', description: 'Close and delete the current thread' },
      { name: 'exit', description: 'Close and delete the current thread' },
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
    let message = expandChunks(trimmed)
    if (mentionBag.mentionedFiles.length > 0) {
      const missingRefs = mentionBag.mentionedFiles.filter((f) => !message.includes(`@${f.path}`))
      if (missingRefs.length > 0) {
        message = missingRefs.map((f) => `@${f.path}`).join(' ') + ' ' + message
      }
    }
    if (hasAttachments) {
      message = buildMessageWithInlineImages(message, attachmentsBag.attachments)
    }
    setValue('')
    setSlashIndex(0)
    setPastedChunks([])
    mentionBag.clearMentions()
    attachmentsBag.clearAttachments()
    onSendMessage(message)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    textareaRef.current?.focus()
  }, [value, disabled, onSendMessage, dismissPanel, mentionBag, attachmentsBag, expandChunks])

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

  // ── Auto-insert [Image filename] when images are added ───────
  const prevAttachmentCountRef = useRef(0)
  useEffect(() => {
    const images = attachmentsBag.attachments.filter((a) => a.type === 'image')
    if (images.length > prevAttachmentCountRef.current) {
      const newImages = images.slice(prevAttachmentCountRef.current)
      const tags = newImages.map((a) => `[Image ${a.name}]`).join(' ')
      setValue((v) => {
        const trimmed = v.trimEnd()
        return trimmed ? `${trimmed} ${tags}` : tags
      })
      requestAnimationFrame(resize)
    }
    prevAttachmentCountRef.current = images.length
  }, [attachmentsBag.attachments]) // eslint-disable-line react-hooks/exhaustive-deps

  const canSend = !disabled && (value.trim().length > 0 || attachmentsBag.attachments.length > 0)

  // Combined paste: intercept large text first, then fall through to image handler
  const handlePaste = useCallback((e: ClipboardEvent) => {
    handleTextPaste(e)
    if (!e.defaultPrevented) attachmentsBag.handlePaste(e)
  }, [handleTextPaste, attachmentsBag.handlePaste])

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
    // Attachments (spread but override handlePaste + handleRemoveAttachment)
    attachments: attachmentsBag.attachments,
    isDragOver: attachmentsBag.isDragOver,
    fileInputRef: attachmentsBag.fileInputRef,
    handleRemoveAttachment: useCallback((id: string) => {
      const att = attachmentsBag.attachments.find((a) => a.id === id)
      if (att?.type === 'image') {
        const tag = `[Image ${att.name}]`
        setValue((v) => v.replace(tag, '').replace(/  +/g, ' ').trim())
        prevAttachmentCountRef.current = Math.max(0, prevAttachmentCountRef.current - 1)
      }
      attachmentsBag.handleRemoveAttachment(id)
    }, [attachmentsBag.attachments, attachmentsBag.handleRemoveAttachment]),
    handleFilePickerClick: attachmentsBag.handleFilePickerClick,
    handleFileInputChange: attachmentsBag.handleFileInputChange,
    clearAttachments: attachmentsBag.clearAttachments,
    handlePaste,
    // Pasted chunks
    pastedChunks,
    handleRemoveChunk,
    // Handlers
    handleChange,
    handleSend,
    handleKeyDown,
    handleSelect,
  } as const
}
