import { useState, useRef, useMemo, useCallback, useEffect, type KeyboardEvent, type ChangeEvent, type ClipboardEvent } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'
import { useSlashAction } from '@/hooks/useSlashAction'
import { useAttachments } from '@/hooks/useAttachments'
import { useFileMention } from '@/hooks/useFileMention'
import { buildMessageWithInlineImages, extractIpcAttachments } from '@/components/chat/attachment-utils'
import type { IpcAttachment } from '@/types'

export interface PastedChunk {
  id: number
  text: string
  lines: number
  chars: number
}

const PASTE_WORD_THRESHOLD = 100
const PASTE_LINE_THRESHOLD = 10

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
  onSendMessage: (message: string, attachments?: IpcAttachment[]) => void
  onPause?: () => void
  onDraftChange?: (value: string) => void
}

export function useChatInput({ disabled, isRunning, initialValue, onSendMessage, onPause, onDraftChange }: UseChatInputOptions) {
  const [value, setValue] = useState(initialValue ?? '')
  const [slashIndex, setSlashIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const backendCommands = useSettingsStore((s) => s.availableCommands)
  const { panel, dismissPanel, execute, executeFullInput } = useSlashAction()

  const attachmentsBag = useAttachments()
  const mentionBag = useFileMention({ textareaRef, value, setValue })

  // ── Track Shift key for raw paste (Cmd+Shift+V) ────────────────
  const isShiftHeldRef = useRef(false)
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const handleDown = (e: globalThis.KeyboardEvent) => { if (e.shiftKey) isShiftHeldRef.current = true }
    const handleUp = () => { isShiftHeldRef.current = false }
    el.addEventListener('keydown', handleDown)
    el.addEventListener('keyup', handleUp)
    el.addEventListener('blur', handleUp)
    return () => { el.removeEventListener('keydown', handleDown); el.removeEventListener('keyup', handleUp); el.removeEventListener('blur', handleUp) }
  }, [])
  // ── Pasted text chunks ─────────────────────────────────────────
  const [pastedChunks, setPastedChunks] = useState<PastedChunk[]>([])
  const chunkCounterRef = useRef(0)

  const handleTextPaste = useCallback((e: ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain')
    if (!text || !isLargePaste(text)) return
    // Cmd+Shift+V (or Ctrl+Shift+V): paste raw text without placeholder
    if (isShiftHeldRef.current) return
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
      { name: 'plan', description: 'Toggle plan mode on or off' },
      { name: 'upload', description: 'Upload images or files' },
      { name: 'usage', description: 'Show token and cost usage for this session' },
      { name: 'branch', description: 'Create and checkout a new git branch' },
      { name: 'worktree', description: 'Create a worktree and spawn a new thread in it' },
      { name: 'close', description: 'Close and delete the current thread' },
      { name: 'exit', description: 'Close and delete the current thread' },
      { name: 'btw', description: 'Ask a side question without polluting conversation history' },
      { name: 'tangent', description: 'Ask a side question (alias for /btw)' },
    ]
    const HIDDEN_COMMANDS = new Set(['reply'])
    const filtered = backendCommands.filter((c) => !HIDDEN_COMMANDS.has(c.name.replace(/^\/+/, '')))
    const names = new Set(filtered.map((c) => c.name.replace(/^\/+/, '')))
    return [...filtered, ...clientCommands.filter((c) => !names.has(c.name))]
  }, [backendCommands])

  // ── Cursor-based slash trigger (mirrors mention detection) ───
  const [slashTrigger, setSlashTrigger] = useState<{ start: number; query: string } | null>(null)

  const detectSlashTrigger = useCallback((text: string, cursorPos: number) => {
    let i = cursorPos - 1
    while (i >= 0 && text[i] !== '/' && text[i] !== '\n' && text[i] !== ' ') i--
    if (i >= 0 && text[i] === '/' && (i === 0 || /\s/.test(text[i - 1]))) {
      const query = text.slice(i + 1, cursorPos)
      if (!query.includes(' ')) {
        setSlashTrigger({ start: i, query })
        setSlashIndex(0)
        return
      }
    }
    setSlashTrigger(null)
  }, [])

  const slashQuery = slashTrigger?.query ?? ''
  const filteredCmds = slashTrigger
    ? (slashQuery ? commands.filter((c) => c.name.replace(/^\/+/, '').toLowerCase().startsWith(slashQuery.toLowerCase())) : commands)
    : []
  const showPicker = slashTrigger !== null && filteredCmds.length > 0 && !panel
  const showFilePicker = mentionBag.mentionTrigger !== null && !showPicker && !panel

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const cursor = e.target.selectionStart ?? newValue.length
    setValue(newValue)
    historyIndexRef.current = -1
    resize()
    detectSlashTrigger(newValue, cursor)
    mentionBag.detectMentionTrigger(newValue, cursor)
  }, [resize, detectSlashTrigger, mentionBag.detectMentionTrigger])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    const hasAttachments = attachmentsBag.attachments.length > 0
    if ((!trimmed && !hasAttachments) || disabled) return
    dismissPanel()
    let message = expandChunks(trimmed)
    // Intercept /btw and /tangent commands before sending
    if (/^\/(?:btw|tangent)\b/i.test(message)) {
      const handled = executeFullInput(message)
      if (handled) {
        // Fully handled (exit btw mode) — clear input, don't send
        setValue('')
        setSlashIndex(0)
        setPastedChunks([])
        mentionBag.clearMentions()
        attachmentsBag.clearAttachments()
        if (textareaRef.current) textareaRef.current.style.height = 'auto'
        textareaRef.current?.focus()
        return
      }
      // Not fully handled = entering btw mode; extract question and send it
      const question = message.replace(/^\/(?:btw|tangent)\s*/i, '').trim()
      if (!question) return
      const btwMax = useSettingsStore.getState().settings.btwMaxChars ?? 1220
      if (question.length > btwMax) {
        const { selectedTaskId, tasks, upsertTask } = useTaskStore.getState()
        if (selectedTaskId && tasks[selectedTaskId]) {
          const task = tasks[selectedTaskId]
          upsertTask({ ...task, messages: [...task.messages, { role: 'system', content: `⚠️ /btw question exceeds ${btwMax} character limit (${question.length} chars). Shorten your question or adjust the limit in Settings > Advanced.`, timestamp: new Date().toISOString() }] })
        }
        return
      }
      message = `<kirodex_tangent>${question.replace(/<\/?kirodex_tangent>/gi, '')}</kirodex_tangent>`
    }
    if (mentionBag.mentionedFiles.length > 0) {
      const missingRefs = mentionBag.mentionedFiles.filter((f) => !message.includes(`@${f.path}`))
      if (missingRefs.length > 0) {
        message = missingRefs.map((f) => `@${f.path}`).join(' ') + ' ' + message
      }
    }
    if (hasAttachments) {
      message = buildMessageWithInlineImages(message, attachmentsBag.attachments)
    }
    const ipcAttachments = hasAttachments ? extractIpcAttachments(attachmentsBag.attachments) : undefined
    setValue('')
    setSlashIndex(0)
    setPastedChunks([])
    mentionBag.clearMentions()
    attachmentsBag.clearAttachments()
    onSendMessage(message, ipcAttachments)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    textareaRef.current?.focus()
  }, [value, disabled, onSendMessage, dismissPanel, mentionBag, attachmentsBag, expandChunks, executeFullInput])

  const handleSelectCommand = useCallback((cmd: { name: string }) => {
    const name = cmd.name.replace(/^\/+/, '')
    if (execute(name)) {
      // Client-handled command: remove the /trigger from the text
      if (slashTrigger) {
        const before = value.slice(0, slashTrigger.start)
        const after = value.slice(slashTrigger.start + 1 + slashTrigger.query.length)
        setValue((before + after).trim())
      } else {
        setValue('')
      }
      setSlashTrigger(null)
      setSlashIndex(0)
      textareaRef.current?.focus()
      return
    }
    // Pass-through command: replace the /trigger with /command + space
    if (slashTrigger) {
      const before = value.slice(0, slashTrigger.start)
      const after = value.slice(slashTrigger.start + 1 + slashTrigger.query.length)
      const newValue = `${before}/${name} ${after}`
      setValue(newValue)
      const cursorPos = before.length + name.length + 2
      requestAnimationFrame(() => textareaRef.current?.setSelectionRange(cursorPos, cursorPos))
    } else {
      setValue(`/${name} `)
    }
    setSlashTrigger(null)
    setSlashIndex(0)
    textareaRef.current?.focus()
  }, [execute, slashTrigger, value])

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
      if (e.key === 'Escape') { e.preventDefault(); setSlashTrigger(null); return }
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
    const cursor = el.selectionStart ?? el.value.length
    detectSlashTrigger(el.value, cursor)
    mentionBag.detectMentionTrigger(el.value, cursor)
  }, [showPicker, showFilePicker, detectSlashTrigger, mentionBag.detectMentionTrigger])

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
