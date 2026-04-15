import type { AgentTask } from '@/types'
import { playNotificationSound } from '@/lib/sounds'

/** Debounce window per task (ms). Prevents notification stacking from rapid turn ends. */
const DEBOUNCE_MS = 3000
const MAX_BODY_LENGTH = 120

/** Tracks the last notification timestamp per task for debouncing. */
const lastNotifiedAt: Record<string, number> = {}

/**
 * Strip markdown formatting from text for use in plain-text notification bodies.
 * Removes block-level constructs (headers, code fences, blockquotes, bullets)
 * and inline formatting (bold, italic, strikethrough, links, images, inline code).
 */
export const stripMarkdown = (text: string): string => {
  return text
    // Remove code fences (```...```)
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove images ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Remove links [text](url) → text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Remove heading markers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove blockquotes
    .replace(/^>\s?/gm, '')
    // Remove bullet/list markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    // Remove numbered list markers
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Remove bold/italic (*** ** * __ _)
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2')
    // Remove strikethrough
    .replace(/~~(.*?)~~/g, '$1')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Collapse multiple newlines
    .replace(/\n{2,}/g, ' ')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

/** Build a notification body with status prefix and content preview. */
const buildNotificationBody = (task: AgentTask, status: 'completed' | 'error' | 'permission'): string => {
  if (status === 'permission') {
    const toolName = task.pendingPermission?.toolName ?? 'a tool'
    return `⏳ Waiting for approval: ${toolName}`
  }
  const prefix = status === 'error' ? '⚠ Error' : '✓ Done'
  const lastMsg = task.messages
    ?.filter((m) => m.role === 'assistant' && m.content.trim())
    .at(-1)?.content
  if (!lastMsg) return prefix
  const stripped = stripMarkdown(lastMsg)
  if (!stripped) return prefix
  const preview = stripped.length > MAX_BODY_LENGTH
    ? stripped.slice(0, MAX_BODY_LENGTH) + '…'
    : stripped
  return `${prefix} — ${preview}`
}

interface SendNotificationOptions {
  readonly task: AgentTask
  readonly status: 'completed' | 'error' | 'permission'
  readonly isNotificationsEnabled: boolean
  readonly isSoundEnabled: boolean
  /** Callback to register the task ID for click-to-navigate. */
  readonly onNotified: (taskId: string) => void
}

/**
 * Send a native desktop notification for a task event.
 * Respects user settings, debounces rapid fires, and optionally plays a sound.
 */
export const sendTaskNotification = ({
  task,
  status,
  isNotificationsEnabled,
  isSoundEnabled,
  onNotified,
}: SendNotificationOptions): void => {
  if (!isNotificationsEnabled) return
  if (document.hasFocus()) return
  // Debounce: skip if we notified this task within DEBOUNCE_MS
  const now = Date.now()
  const lastTime = lastNotifiedAt[task.id] ?? 0
  if (now - lastTime < DEBOUNCE_MS) return
  lastNotifiedAt[task.id] = now
  const title = task.name || 'Agent update'
  const body = buildNotificationBody(task, status)
  onNotified(task.id)
  if (isSoundEnabled) playNotificationSound()
  import('@tauri-apps/plugin-notification').then(({ isPermissionGranted, sendNotification }) => {
    isPermissionGranted().then((ok) => {
      if (ok) sendNotification({ title, body, extra: { taskId: task.id } })
    })
  }).catch(() => {})
}
