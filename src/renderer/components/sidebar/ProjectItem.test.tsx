import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ProjectIconResult } from '@/hooks/useProjectIcon'

// ── mocks ──────────────────────────────────────────────────────────────────

let mockIcon: ProjectIconResult = null

vi.mock('@/hooks/useProjectIcon', () => ({
  useProjectIcon: () => mockIcon,
  setProjectIconOverride: vi.fn(),
  clearIconCache: vi.fn(),
}))

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ clearLastAddedProject: vi.fn() }),
    { getState: () => ({ clearLastAddedProject: vi.fn() }) },
  ),
}))

vi.mock('@/stores/fileTreeStore', () => ({
  useFileTreeStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({}),
    { getState: () => ({ setOpen: vi.fn(), loadRoot: vi.fn() }) },
  ),
}))

vi.mock('@/lib/ipc', () => ({
  ipc: { openUrl: vi.fn(), readFileBase64: vi.fn() },
}))

vi.mock('./ThreadItem', () => ({
  ThreadItem: ({ task }: { task: { id: string } }) => (
    <li data-testid={`thread-${task.id}`} />
  ),
}))

vi.mock('./IconPickerDialog', () => ({
  IconPickerDialog: () => null,
}))

// ── helpers ────────────────────────────────────────────────────────────────

import { ProjectItem } from './ProjectItem'

const noop = () => {}

const defaultProps = {
  name: 'my-project',
  cwd: '/home/user/my-project',
  tasks: [] as never[],
  selectedTaskId: null,
  isActiveProject: false,
  canMoveUp: false,
  canMoveDown: false,
  onSelectTask: noop,
  onNewThread: noop,
  onDeleteTask: noop,
  onRenameTask: noop,
  onRemoveProject: noop,
  onArchiveThreads: noop,
  onMoveUp: noop,
  onMoveDown: noop,
  onMoveThread: noop,
}

const wrap = (ui: React.ReactNode) => <TooltipProvider>{ui}</TooltipProvider>

beforeEach(() => {
  mockIcon = null
})

// ── tests ──────────────────────────────────────────────────────────────────

describe('ProjectItem — project name visibility', () => {
  it('shows name when icon is null', () => {
    mockIcon = null
    render(wrap(<ProjectItem {...defaultProps} />))
    expect(screen.getByText('my-project')).toBeInTheDocument()
  })

  it('shows name when icon is emoji', () => {
    mockIcon = { type: 'emoji', emoji: '🚀' }
    render(wrap(<ProjectItem {...defaultProps} />))
    expect(screen.getByText('my-project')).toBeInTheDocument()
  })

  it('shows name when icon is framework', () => {
    mockIcon = { type: 'framework', id: 'react' }
    render(wrap(<ProjectItem {...defaultProps} />))
    expect(screen.getByText('my-project')).toBeInTheDocument()
  })

  it('shows name when icon is favicon', () => {
    mockIcon = { type: 'favicon', dataUrl: 'data:image/png;base64,abc' }
    render(wrap(<ProjectItem {...defaultProps} />))
    expect(screen.getByText('my-project')).toBeInTheDocument()
  })
})

describe('ProjectItem — jumpLabel', () => {
  it('renders jumpLabel kbd when provided', () => {
    mockIcon = null
    render(wrap(<ProjectItem {...defaultProps} jumpLabel="1" />))
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})

describe('ProjectItem — thread list', () => {
  it('shows "No threads yet" when tasks is empty', () => {
    render(wrap(<ProjectItem {...defaultProps} tasks={[]} />))
    expect(screen.getByText('No threads yet')).toBeInTheDocument()
  })

  it('renders thread items when tasks present', () => {
    const tasks = [
      { id: 't1', name: 'Thread 1', isDraft: false, status: 'idle', createdAt: '0', lastActivityAt: '0', lastUserMessageAt: '0', workspace: '/tmp', projectId: 'p1' },
      { id: 't2', name: 'Thread 2', isDraft: false, status: 'idle', createdAt: '1', lastActivityAt: '1', lastUserMessageAt: '1', workspace: '/tmp', projectId: 'p1' },
    ]
    render(wrap(<ProjectItem {...defaultProps} tasks={tasks} />))
    expect(screen.getByTestId('thread-t1')).toBeInTheDocument()
    expect(screen.getByTestId('thread-t2')).toBeInTheDocument()
  })
})
