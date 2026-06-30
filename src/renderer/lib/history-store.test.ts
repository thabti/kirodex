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

import { loadThreads, loadProjects, saveThreads, toArchivedTasks, clearHistory, loadSoftDeleted, saveSoftDeleted, flush, createBackup, loadBackup } from './history-store'
import type { AgentTask, SoftDeletedThread } from '@/types'

beforeEach(() => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    value: {},
    configurable: true,
  })
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

  it('persists archived tasks (for restore on relaunch)', async () => {
    const tasks: Record<string, AgentTask> = {
      't1': {
        id: 't1', name: 'Archived', workspace: '/ws', status: 'completed',
        createdAt: '2026-01-01', messages: [{ role: 'user', content: 'hi', timestamp: '' }],
        isArchived: true,
      },
    }
    await saveThreads(tasks, {})
    expect(mockSet).toHaveBeenCalledWith('threads', [
      expect.objectContaining({ id: 't1', name: 'Archived' }),
    ])
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

  it('persists worktree metadata when present', async () => {
    const tasks: Record<string, AgentTask> = {
      't1': {
        id: 't1', name: 'WT Task', workspace: '/ws/.kiro/worktrees/feat', status: 'paused',
        createdAt: '', messages: [{ role: 'user', content: 'hi', timestamp: '' }],
        worktreePath: '/ws/.kiro/worktrees/feat',
        originalWorkspace: '/ws',
      },
    }
    await saveThreads(tasks, {})
    const savedThreads = mockSet.mock.calls.find((c: unknown[]) => c[0] === 'threads')?.[1]
    expect(savedThreads[0].worktreePath).toBe('/ws/.kiro/worktrees/feat')
    expect(savedThreads[0].originalWorkspace).toBe('/ws')
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

  it('preserves worktree metadata', () => {
    const saved = [{
      id: 't1', name: 'WT Thread', workspace: '/ws/.kiro/worktrees/feat',
      createdAt: '', messages: [{ role: 'user', content: 'hi', timestamp: '' }],
      worktreePath: '/ws/.kiro/worktrees/feat',
      originalWorkspace: '/ws',
    }]
    const actual = toArchivedTasks(saved)
    expect(actual[0].worktreePath).toBe('/ws/.kiro/worktrees/feat')
    expect(actual[0].originalWorkspace).toBe('/ws')
  })
})

describe('clearHistory', () => {
  it('deletes threads, projects, and softDeleted then saves', async () => {
    await clearHistory()
    expect(mockDelete).toHaveBeenCalledWith('threads')
    expect(mockDelete).toHaveBeenCalledWith('projects')
    expect(mockDelete).toHaveBeenCalledWith('softDeleted')
    expect(mockSave).toHaveBeenCalledOnce()
  })
})

describe('loadSoftDeleted', () => {
  it('returns empty array when store has no soft-deleted threads', async () => {
    mockGet.mockResolvedValue(null)
    const actual = await loadSoftDeleted()
    expect(actual).toEqual([])
    expect(mockGet).toHaveBeenCalledWith('softDeleted')
  })

  it('returns stored soft-deleted threads', async () => {
    const expected: SoftDeletedThread[] = [{
      task: { id: 't1', name: 'Deleted', workspace: '/ws', status: 'completed', createdAt: '', messages: [] },
      deletedAt: '2026-04-15T10:00:00Z',
    }]
    mockGet.mockResolvedValue(expected)
    const actual = await loadSoftDeleted()
    expect(actual).toEqual(expected)
  })
})

describe('saveSoftDeleted', () => {
  it('persists soft-deleted threads to the store', async () => {
    const items: SoftDeletedThread[] = [{
      task: { id: 't1', name: 'Deleted', workspace: '/ws', status: 'completed', createdAt: '', messages: [] },
      deletedAt: '2026-04-15T10:00:00Z',
    }]
    await saveSoftDeleted(items)
    expect(mockSet).toHaveBeenCalledWith('softDeleted', items)
  })
})

describe('projectId persistence', () => {
  it('saveThreads persists projectId when present', async () => {
    const tasks: Record<string, AgentTask> = {
      't1': {
        id: 't1', name: 'WT Task', workspace: '/ws/.kiro/worktrees/feat', status: 'paused',
        createdAt: '', messages: [{ role: 'user', content: 'hi', timestamp: '' }],
        projectId: '/ws',
        worktreePath: '/ws/.kiro/worktrees/feat',
        originalWorkspace: '/ws',
      },
    }
    await saveThreads(tasks, {})
    const savedThreads = mockSet.mock.calls.find((c: unknown[]) => c[0] === 'threads')?.[1]
    expect(savedThreads[0].projectId).toBe('/ws')
  })

  it('saveThreads omits projectId when not present', async () => {
    const tasks: Record<string, AgentTask> = {
      't1': {
        id: 't1', name: 'Task', workspace: '/ws', status: 'paused',
        createdAt: '', messages: [{ role: 'user', content: 'hi', timestamp: '' }],
      },
    }
    await saveThreads(tasks, {})
    const savedThreads = mockSet.mock.calls.find((c: unknown[]) => c[0] === 'threads')?.[1]
    expect(savedThreads[0]).not.toHaveProperty('projectId')
  })

  it('saveThreads groups worktree threads under originalWorkspace for projects', async () => {
    const tasks: Record<string, AgentTask> = {
      't1': {
        id: 't1', name: 'Regular', workspace: '/ws', status: 'paused',
        createdAt: '', messages: [{ role: 'user', content: 'hi', timestamp: '' }],
      },
      't2': {
        id: 't2', name: 'Worktree', workspace: '/ws/.kiro/worktrees/feat', status: 'paused',
        createdAt: '', messages: [{ role: 'user', content: 'hi', timestamp: '' }],
        originalWorkspace: '/ws',
        worktreePath: '/ws/.kiro/worktrees/feat',
      },
    }
    await saveThreads(tasks, {})
    const projects = mockSet.mock.calls.find((c: unknown[]) => c[0] === 'projects')?.[1]
    // Both threads should be grouped under /ws, not /ws/.kiro/worktrees/feat
    expect(projects).toHaveLength(1)
    expect(projects[0].workspace).toBe('/ws')
    expect(projects[0].threadIds).toContain('t1')
    expect(projects[0].threadIds).toContain('t2')
  })

  it('toArchivedTasks restores projectId', () => {
    const saved = [{
      id: 't1', name: 'WT Thread', workspace: '/ws/.kiro/worktrees/feat',
      createdAt: '', messages: [{ role: 'user', content: 'hi', timestamp: '' }],
      projectId: '/ws',
      worktreePath: '/ws/.kiro/worktrees/feat',
      originalWorkspace: '/ws',
    }]
    const actual = toArchivedTasks(saved)
    expect(actual[0].projectId).toBe('/ws')
  })

  it('toArchivedTasks omits projectId when not in saved data', () => {
    const saved = [{
      id: 't1', name: 'Thread', workspace: '/ws', createdAt: '',
      messages: [{ role: 'user', content: 'hi', timestamp: '' }],
    }]
    const actual = toArchivedTasks(saved)
    expect(actual[0]).not.toHaveProperty('projectId')
  })
})

describe('flush', () => {
  it('forces an immediate save to disk', async () => {
    await flush()
    expect(mockSave).toHaveBeenCalledOnce()
  })
})

describe('createBackup', () => {
  it('copies threads, projects, softDeleted to backup store', async () => {
    const threads = [{ id: 't1', name: 'Thread', workspace: '/ws', createdAt: '', messages: [] }]
    const projects = [{ workspace: '/ws', threadIds: ['t1'] }]
    const softDeleted = [{ task: { id: 't2', name: 'Del', workspace: '/ws', status: 'completed', createdAt: '', messages: [] }, deletedAt: '2026-01-01' }]
    mockGet.mockImplementation((key: string) => {
      if (key === 'threads') return Promise.resolve(threads)
      if (key === 'projects') return Promise.resolve(projects)
      if (key === 'softDeleted') return Promise.resolve(softDeleted)
      return Promise.resolve(null)
    })
    await createBackup()
    expect(mockSet).toHaveBeenCalledWith('threads', threads)
    expect(mockSet).toHaveBeenCalledWith('projects', projects)
    expect(mockSet).toHaveBeenCalledWith('softDeleted', softDeleted)
    expect(mockSave).toHaveBeenCalled()
  })

  it('includes settings snapshot when provided', async () => {
    mockGet.mockResolvedValue([])
    const settings = { kiroBin: 'kiro-cli', agentProfiles: [], fontSize: 16 }
    await createBackup(settings as never)
    expect(mockSet).toHaveBeenCalledWith('settings', settings)
  })

  it('preserves worktree fields in backup', async () => {
    const threads = [{
      id: 't1', name: 'WT', workspace: '/ws/.kiro/worktrees/feat', createdAt: '',
      messages: [{ role: 'user', content: 'hi', timestamp: '' }],
      worktreePath: '/ws/.kiro/worktrees/feat',
      originalWorkspace: '/ws',
      parentTaskId: 'parent-1',
      projectId: '/ws',
    }]
    mockGet.mockImplementation((key: string) => key === 'threads' ? Promise.resolve(threads) : Promise.resolve([]))
    await createBackup()
    const savedThreads = mockSet.mock.calls.find((c: unknown[]) => c[0] === 'threads')?.[1]
    expect(savedThreads[0].worktreePath).toBe('/ws/.kiro/worktrees/feat')
    expect(savedThreads[0].originalWorkspace).toBe('/ws')
    expect(savedThreads[0].parentTaskId).toBe('parent-1')
    expect(savedThreads[0].projectId).toBe('/ws')
  })
})

describe('loadBackup', () => {
  it('returns backup data', async () => {
    const threads = [{ id: 't1', name: 'Thread', workspace: '/ws', createdAt: '', messages: [] }]
    mockGet.mockImplementation((key: string) => key === 'threads' ? Promise.resolve(threads) : Promise.resolve([]))
    const backup = await loadBackup()
    expect(backup.threads).toEqual(threads)
  })

  it('returns empty arrays when no backup exists', async () => {
    mockGet.mockResolvedValue(null)
    const backup = await loadBackup()
    expect(backup.threads).toEqual([])
    expect(backup.projects).toEqual([])
    expect(backup.softDeleted).toEqual([])
    expect(backup.settings).toBeUndefined()
  })
})
