import { describe, it, expect } from 'vitest'
import { deriveTimeline } from './timeline'
import type { TaskMessage, ToolCall } from '@/types'

const makeMsg = (role: TaskMessage['role'], content: string, extra?: Partial<TaskMessage>): TaskMessage => ({
  role,
  content,
  timestamp: '2026-01-01T00:00:00Z',
  ...extra,
})

const makeTool = (overrides?: Partial<ToolCall>): ToolCall => ({
  toolCallId: 'tc-1',
  title: 'read file',
  status: 'completed',
  ...overrides,
})

describe('deriveTimeline', () => {
  it('returns empty array for no messages and no streaming', () => {
    const actual = deriveTimeline([], undefined, undefined, undefined, false)
    expect(actual).toEqual([])
  })

  it('maps a user message to a user-message row', () => {
    const msgs = [makeMsg('user', 'hello')]
    const rows = deriveTimeline(msgs, undefined, undefined, undefined, false)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('user-message')
    expect((rows[0] as { content: string }).content).toBe('hello')
  })

  it('maps a system message to a system-message row', () => {
    const msgs = [makeMsg('system', 'warning')]
    const rows = deriveTimeline(msgs, undefined, undefined, undefined, false)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('system-message')
  })

  it('maps assistant text + tool calls to separate rows', () => {
    const msgs = [makeMsg('assistant', 'thinking...', {
      toolCalls: [makeTool({ kind: 'read' })],
    })]
    const rows = deriveTimeline(msgs, undefined, undefined, undefined, false)
    expect(rows.map((r) => r.kind)).toEqual(['assistant-text', 'work'])
  })

  it('adds changed-files row after work with file mutations', () => {
    const msgs = [makeMsg('assistant', 'done', {
      toolCalls: [makeTool({ kind: 'edit', status: 'completed' })],
    })]
    const rows = deriveTimeline(msgs, undefined, undefined, undefined, false)
    expect(rows.map((r) => r.kind)).toEqual(['assistant-text', 'work', 'changed-files'])
  })

  it('does not add changed-files for non-mutation tools', () => {
    const msgs = [makeMsg('assistant', 'done', {
      toolCalls: [makeTool({ kind: 'read', status: 'completed' })],
    })]
    const rows = deriveTimeline(msgs, undefined, undefined, undefined, false)
    expect(rows.map((r) => r.kind)).toEqual(['assistant-text', 'work'])
  })

  it('adds streaming text as live assistant-text row', () => {
    const rows = deriveTimeline([], 'streaming...', undefined, undefined, false)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('assistant-text')
    expect((rows[0] as { isStreaming?: boolean }).isStreaming).toBe(true)
  })

  it('adds live tool calls as live work row', () => {
    const rows = deriveTimeline([], undefined, [makeTool()], undefined, false)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('work')
  })

  it('adds working indicator when running', () => {
    const rows = deriveTimeline([], undefined, undefined, undefined, true)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('working')
  })

  it('shows thinking as live assistant-text', () => {
    const rows = deriveTimeline([], undefined, undefined, 'hmm...', false)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('assistant-text')
    expect((rows[0] as { thinking?: string }).thinking).toBe('hmm...')
  })

  it('combines persisted messages with live state', () => {
    const msgs = [makeMsg('user', 'hi')]
    // 'working' row is suppressed when there's live streaming text
    const rows = deriveTimeline(msgs, 'responding...', [makeTool()], undefined, true)
    expect(rows.map((r) => r.kind)).toEqual(['user-message', 'assistant-text', 'work'])
  })

  it('shows working indicator alongside live tool calls when running', () => {
    const rows = deriveTimeline([], undefined, [makeTool()], undefined, true)
    expect(rows.map((r) => r.kind)).toEqual(['work', 'working'])
  })

  it('suppresses working indicator when streaming text is active', () => {
    const rows = deriveTimeline([], 'typing...', [makeTool()], undefined, true)
    expect(rows.map((r) => r.kind)).toEqual(['assistant-text', 'work'])
  })
})
