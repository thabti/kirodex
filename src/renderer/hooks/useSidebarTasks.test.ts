import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTaskStore } from '@/stores/taskStore'
import { useSidebarTasks } from './useSidebarTasks'
import type { AgentTask } from '@/types'

const makeTask = (overrides?: Partial<AgentTask>): AgentTask => ({
  id: 'task-1',
  name: 'Test Task',
  workspace: '/project',
  status: 'paused',
  createdAt: '2026-01-01T00:00:00Z',
  messages: [],
  ...overrides,
})

beforeEach(() => {
  useTaskStore.setState({
    tasks: {},
    projects: [],
    projectIds: {},
    projectNames: {},
    drafts: {},
    deletedTaskIds: new Set(),
    softDeleted: {},
    selectedTaskId: null,
    streamingChunks: {},
    thinkingChunks: {},
    liveToolCalls: {},
    queuedMessages: {},
    activityFeed: [],
    connected: false,
    terminalOpenTasks: new Set(),
    pendingWorkspace: null,
    view: 'dashboard',
    isNewProjectOpen: false,
    isSettingsOpen: false,
  })
})

describe('useSidebarTasks projectId grouping', () => {
  it('groups regular threads under their projectId', () => {
    useTaskStore.setState({
      tasks: {
        't1': makeTask({ id: 't1', workspace: '/project', projectId: '/project' }),
        't2': makeTask({ id: 't2', workspace: '/project', projectId: '/project' }),
      },
      projects: ['/project'],
    })
    const { result } = renderHook(() => useSidebarTasks('recent'))
    expect(result.current).toHaveLength(1)
    expect(result.current[0].cwd).toBe('/project')
    expect(result.current[0].tasks).toHaveLength(2)
  })

  it('groups worktree threads under parent projectId', () => {
    useTaskStore.setState({
      tasks: {
        't1': makeTask({ id: 't1', workspace: '/project', projectId: '/project' }),
        't2': makeTask({
          id: 't2',
          workspace: '/project/.kiro/worktrees/feat',
          projectId: '/project',
          worktreePath: '/project/.kiro/worktrees/feat',
          originalWorkspace: '/project',
        }),
      },
      projects: ['/project'],
    })
    const { result } = renderHook(() => useSidebarTasks('recent'))
    expect(result.current).toHaveLength(1)
    expect(result.current[0].cwd).toBe('/project')
    expect(result.current[0].tasks).toHaveLength(2)
  })

  it('does not create separate project for worktree workspace path', () => {
    useTaskStore.setState({
      tasks: {
        't1': makeTask({
          id: 't1',
          workspace: '/project/.kiro/worktrees/feat',
          projectId: '/project',
          worktreePath: '/project/.kiro/worktrees/feat',
          originalWorkspace: '/project',
        }),
      },
      projects: ['/project'],
    })
    const { result } = renderHook(() => useSidebarTasks('recent'))
    expect(result.current).toHaveLength(1)
    expect(result.current[0].cwd).toBe('/project')
  })

  it('falls back to originalWorkspace when projectId is missing', () => {
    useTaskStore.setState({
      tasks: {
        't1': makeTask({
          id: 't1',
          workspace: '/project/.kiro/worktrees/feat',
          originalWorkspace: '/project',
          worktreePath: '/project/.kiro/worktrees/feat',
        }),
      },
      projects: ['/project'],
    })
    const { result } = renderHook(() => useSidebarTasks('recent'))
    expect(result.current).toHaveLength(1)
    expect(result.current[0].cwd).toBe('/project')
  })

  it('falls back to workspace when both projectId and originalWorkspace are missing', () => {
    useTaskStore.setState({
      tasks: {
        't1': makeTask({ id: 't1', workspace: '/project' }),
      },
      projects: ['/project'],
    })
    const { result } = renderHook(() => useSidebarTasks('recent'))
    expect(result.current).toHaveLength(1)
    expect(result.current[0].cwd).toBe('/project')
  })

  it('multiple worktree threads nest under same parent', () => {
    useTaskStore.setState({
      tasks: {
        't1': makeTask({ id: 't1', workspace: '/project', projectId: '/project' }),
        't2': makeTask({
          id: 't2',
          workspace: '/project/.kiro/worktrees/feat-a',
          projectId: '/project',
          worktreePath: '/project/.kiro/worktrees/feat-a',
        }),
        't3': makeTask({
          id: 't3',
          workspace: '/project/.kiro/worktrees/feat-b',
          projectId: '/project',
          worktreePath: '/project/.kiro/worktrees/feat-b',
        }),
      },
      projects: ['/project'],
    })
    const { result } = renderHook(() => useSidebarTasks('recent'))
    expect(result.current).toHaveLength(1)
    expect(result.current[0].tasks).toHaveLength(3)
  })

  it('threads from different projects stay separate', () => {
    useTaskStore.setState({
      tasks: {
        't1': makeTask({ id: 't1', workspace: '/project-a', projectId: '/project-a' }),
        't2': makeTask({ id: 't2', workspace: '/project-b', projectId: '/project-b' }),
      },
      projects: ['/project-a', '/project-b'],
    })
    const { result } = renderHook(() => useSidebarTasks('recent'))
    expect(result.current).toHaveLength(2)
  })

  it('uses projectNames for display name', () => {
    useTaskStore.setState({
      tasks: {
        't1': makeTask({ id: 't1', workspace: '/project', projectId: '/project' }),
      },
      projects: ['/project'],
      projectNames: { '/project': 'My App' },
    })
    const { result } = renderHook(() => useSidebarTasks('recent'))
    expect(result.current[0].name).toBe('My App')
  })

  it('SidebarTask carries projectId field', () => {
    useTaskStore.setState({
      tasks: {
        't1': makeTask({ id: 't1', workspace: '/project', projectId: '/project' }),
      },
      projects: ['/project'],
    })
    const { result } = renderHook(() => useSidebarTasks('recent'))
    expect(result.current[0].tasks[0].projectId).toBe('/project')
  })

  it('groups by UUID projectId and resolves workspace for display', () => {
    const uuid = crypto.randomUUID()
    useTaskStore.setState({
      tasks: {
        't1': makeTask({ id: 't1', workspace: '/project', projectId: uuid }),
        't2': makeTask({
          id: 't2',
          workspace: '/project/.kiro/worktrees/feat',
          projectId: uuid,
          worktreePath: '/project/.kiro/worktrees/feat',
        }),
      },
      projects: ['/project'],
      projectIds: { '/project': uuid },
    })
    const { result } = renderHook(() => useSidebarTasks('recent'))
    expect(result.current).toHaveLength(1)
    expect(result.current[0].cwd).toBe('/project')
    expect(result.current[0].tasks).toHaveLength(2)
  })

  it('filters worktreePath from appearing as top-level project even if in projects array', () => {
    const uuid = crypto.randomUUID()
    useTaskStore.setState({
      tasks: {
        't1': makeTask({
          id: 't1',
          workspace: '/project/.kiro/worktrees/feat',
          projectId: uuid,
          worktreePath: '/project/.kiro/worktrees/feat',
          originalWorkspace: '/project',
        }),
      },
      projects: ['/project', '/project/.kiro/worktrees/feat'],
      projectIds: { '/project': uuid },
    })
    const { result } = renderHook(() => useSidebarTasks('recent'))
    expect(result.current).toHaveLength(1)
    expect(result.current[0].cwd).toBe('/project')
  })

  it('does not create sidebar entry for orphaned UUID projectId with no workspace mapping', () => {
    const orphanUuid = crypto.randomUUID()
    useTaskStore.setState({
      tasks: {
        't1': makeTask({ id: 't1', workspace: '/old-project', projectId: orphanUuid }),
      },
      projects: [],
      projectIds: {},
    })
    const { result } = renderHook(() => useSidebarTasks('recent'))
    // Should not create an entry with the UUID as the project name
    const uuidEntry = result.current.find((p) => p.cwd === orphanUuid)
    expect(uuidEntry).toBeUndefined()
  })
})
