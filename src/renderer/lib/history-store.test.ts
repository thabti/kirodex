import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet, mockSet, mockDelete, mockSave } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn().mockResolvedValue(undefined),
  mockDelete: vi.fn().mockResolvedValue(undefined),
  mockSave: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get = mockGet
    set = mockSet
    delete = mockDelete
    save = mockSave
  },
}))

import { loadThreads, loadProjects, saveThreads, toArchivedTasks, clearHistory } from './history-store'
import type { AgentTask } from '@/types'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadThreads', () => {
  it('returns empty array when store has no threads', async () => {
    mockGet.mockResolvedValue(null)
    const actual = await loadThreads()
    expect(actual).toEqual([])
    expect(mockGet).toHaveBeenCalledWith('threads')
  })

  it('returns stored threads', async () => {
    const expectedThreads = [{ id: 't1', name: 'Thread 1', workspace: '/ws', createdAt: '', messages: [] }]
    mockGet.mockResolvedValue(expectedThreads)
    const actual = await loadThreads()
    expect(actual).toEqual(expectedThreads)
  })
})

describe('loadProjects', () => {
  it('returns empty array when store has no projects', async () => {
    mockGet.mockResolvedValue(null)
    const actual = await loadProjects()
    expect(actual).toEqual([])
    expect(mockGet).toHaveBeenCalledWith('projects')
  })

  it('returns stored projects', async () => {
    const expectedProjects = [{ workspace: '/ws', threadIds: ['t1'] }]
    mockGet.mockResolvedValue(expectedProjects)
    const actual = await loadProjects()
    expect(actual).toEqual(expectedProjects)
  })
})

describe('saveThreads', () => {
  it('persists non-archived tasks with messages', async () => {
    const tasks: Record<string, AgentTask> = {
      't1': {
        id: 't1', name: 'Task 1', workspace: '/ws', status: 'completed',
        createdAt: '2026-01-01', messages: [
          { role: 'user', content: 'hello', timestamp: '2026-01-01T00:00:01Z' },
        ],
      },
    }
    await saveThreads(tasks, {})
    expect(mockSet).toHaveBeenCalledWith('threads', expect.arrayContaining([
      expect.objectContaining({ id: 't1', name: 'Task 1' }),
    ]))
    expect(mockSet).toHaveBeenCalledWith('projects', expect.any(Array))
  })

  it('skips archived tasks', async () => {
    const tasks: Record<string, AgentTask> = {
      't1': {
        id: 't1', name: 'Archived', workspace: '/ws', status: 'completed',
        createdAt: '2026-01-01', messages: [{ role: 'user', content: 'hi', timestamp: '' }],
        isArchived: true,
      },
    }
    await saveThreads(tasks, {})
    expect(mockSet).toHaveBeenCalledWith('threads', [])
  })

  it('skips tasks with no messages', async () => {
    const tasks: Record<string, AgentTask> = {
      't1': { id: 't1', name: 'Empty', workspace: '/ws', status: 'paused', createdAt: '', messages: [] },
    }
    await saveThreads(tasks, {})
    expect(mockSet).toHaveBeenCalledWith('threads', [])
  })

  it('includes project display names when provided', async () => {
    const tasks: Record<string, AgentTask> = {
      't1': {
        id: 't1', name: 'Task', workspace: '/ws', status: 'paused',
        createdAt: '', messages: [{ role: 'user', content: 'hi', timestamp: '' }],
      },
    }
    await saveThreads(tasks, { '/ws': 'My Project' })
    expect(mockSet).toHaveBeenCalledWith('projects', expect.arrayContaining([
      expect.objectContaining({ workspace: '/ws', displayName: 'My Project' }),
    ]))
  })

  it('preserves thinking field in saved messages', async () => {
    const tasks: Record<string, AgentTask> = {
      't1': {
        id: 't1', name: 'Task', workspace: '/ws', status: 'completed',
        createdAt: '', messages: [
          { role: 'assistant', content: 'answer', timestamp: '', thinking: 'hmm' },
        ],
      },
    }
    await saveThreads(tasks, {})
    const savedThreads = mockSet.mock.calls.find((c: unknown[]) => c[0] === 'threads')?.[1]
    expect(savedThreads[0].messages[0].thinking).toBe('hmm')
  })

  it('omits thinking when not present', async () => {
    const tasks: Record<string, AgentTask> = {
      't1': {
        id: 't1', name: 'Task', workspace: '/ws', status: 'completed',
        createdAt: '', messages: [
          { role: 'user', content: 'hi', timestamp: '' },
        ],
      },
    }
    await saveThreads(tasks, {})
    const savedThreads = mockSet.mock.calls.find((c: unknown[]) => c[0] === 'threads')?.[1]
    expect(savedThreads[0].messages[0]).not.toHaveProperty('thinking')
  })

  it('groups threads by workspace into projects', async () => {
    const tasks: Record<string, AgentTask> = {
      't1': {
        id: 't1', name: 'Task 1', workspace: '/ws1', status: 'paused',
        createdAt: '', messages: [{ role: 'user', content: 'hi', timestamp: '' }],
      },
      't2': {
        id: 't2', name: 'Task 2', workspace: '/ws2', status: 'paused',
        createdAt: '', messages: [{ role: 'user', content: 'hi', timestamp: '' }],
      },
    }
    await saveThreads(tasks, {})
    const projects = mockSet.mock.calls.find((c: unknown[]) => c[0] === 'projects')?.[1]
    expect(projects).toHaveLength(2)
    const ws1 = projects.find((p: { workspace: string }) => p.workspace === '/ws1')
    expect(ws1.threadIds).toContain('t1')
  })
})

describe('toArchivedTasks', () => {
  it('returns empty array for empty input', () => {
    expect(toArchivedTasks([])).toEqual([])
  })

  it('converts saved threads to archived AgentTasks', () => {
    const saved = [{
      id: 't1', name: 'Thread', workspace: '/ws', createdAt: '2026-01-01',
      messages: [{ role: 'user', content: 'hi', timestamp: '2026-01-01' }],
    }]
    const actual = toArchivedTasks(saved)
    expect(actual).toHaveLength(1)
    expect(actual[0].id).toBe('t1')
    expect(actual[0].status).toBe('completed')
    expect(actual[0].isArchived).toBe(true)
    expect(actual[0].messages[0].role).toBe('user')
  })

  it('preserves thinking field', () => {
    const saved = [{
      id: 't1', name: 'Thread', workspace: '/ws', createdAt: '',
      messages: [{ role: 'assistant', content: 'x', timestamp: '', thinking: 'hmm' }],
    }]
    const actual = toArchivedTasks(saved)
    expect(actual[0].messages[0].thinking).toBe('hmm')
  })
})

describe('clearHistory', () => {
  it('deletes threads and projects then saves', async () => {
    await clearHistory()
    expect(mockDelete).toHaveBeenCalledWith('threads')
    expect(mockDelete).toHaveBeenCalledWith('projects')
    expect(mockSave).toHaveBeenCalledOnce()
  })
})
