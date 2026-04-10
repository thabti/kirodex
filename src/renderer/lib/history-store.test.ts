import { describe, it, expect } from 'vitest'
import { toArchivedTasks } from './history-store'

describe('toArchivedTasks', () => {
  it('returns empty array for empty input', () => {
    expect(toArchivedTasks([])).toEqual([])
  })

  it('converts saved threads to archived AgentTasks', () => {
    const saved = [{
      id: 'thread-1',
      name: 'Test Thread',
      workspace: '/projects/foo',
      createdAt: '2026-01-01T00:00:00Z',
      messages: [
        { role: 'user', content: 'hello', timestamp: '2026-01-01T00:00:01Z' },
        { role: 'assistant', content: 'hi', timestamp: '2026-01-01T00:00:02Z' },
      ],
    }]

    const actual = toArchivedTasks(saved)

    expect(actual).toHaveLength(1)
    expect(actual[0].id).toBe('thread-1')
    expect(actual[0].name).toBe('Test Thread')
    expect(actual[0].workspace).toBe('/projects/foo')
    expect(actual[0].status).toBe('completed')
    expect(actual[0].isArchived).toBe(true)
    expect(actual[0].messages).toHaveLength(2)
    expect(actual[0].messages[0].role).toBe('user')
    expect(actual[0].messages[1].role).toBe('assistant')
  })

  it('preserves thinking field in messages', () => {
    const saved = [{
      id: 'thread-2',
      name: 'Thinking Thread',
      workspace: '/projects/bar',
      createdAt: '2026-01-01T00:00:00Z',
      messages: [
        { role: 'assistant', content: 'answer', timestamp: '2026-01-01T00:00:01Z', thinking: 'let me think...' },
      ],
    }]

    const actual = toArchivedTasks(saved)
    expect(actual[0].messages[0].thinking).toBe('let me think...')
  })

  it('omits thinking when not present', () => {
    const saved = [{
      id: 'thread-3',
      name: 'No Thinking',
      workspace: '/projects/baz',
      createdAt: '2026-01-01T00:00:00Z',
      messages: [
        { role: 'user', content: 'hi', timestamp: '2026-01-01T00:00:01Z' },
      ],
    }]

    const actual = toArchivedTasks(saved)
    expect(actual[0].messages[0]).not.toHaveProperty('thinking')
  })
})
