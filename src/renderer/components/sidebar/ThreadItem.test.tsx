import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useTaskStore } from '@/stores/taskStore'
import type { SidebarTask } from '@/hooks/useSidebarTasks'
import { ThreadItem } from './ThreadItem'

const task: SidebarTask = {
  id: 'thread-1',
  name: 'Review sidebar',
  preview: 'Check the nested task layout',
  isDraft: false,
  status: 'completed',
  createdAt: '2026-08-13T08:00:00.000Z',
  lastActivityAt: '2026-08-13T08:15:00.000Z',
  lastUserMessageAt: '2026-08-13T08:00:00.000Z',
  workspace: '/workspace',
  projectId: 'project-1',
}

const renderItem = (overrides: Partial<React.ComponentProps<typeof ThreadItem>> = {}) => {
  const props: React.ComponentProps<typeof ThreadItem> = {
    task,
    isActive: false,
    onSelect: vi.fn(),
    onDelete: vi.fn(),
    onRename: vi.fn(),
    ...overrides,
  }
  render(
    <TooltipProvider>
      <ul><ThreadItem {...props} /></ul>
    </TooltipProvider>,
  )
  return props
}

beforeEach(() => {
  useTaskStore.setState({
    splitViews: [],
    pinnedThreadIds: [],
    notifiedTaskIds: [],
    sessionIds: {},
  })
})

describe('ThreadItem', () => {
  it('uses a semantic button and exposes the preview in its accessible name', () => {
    const props = renderItem({ isActive: true })
    const button = screen.getByRole('button', { name: /review sidebar.*check the nested task layout/i })

    expect(button).toHaveAttribute('aria-current', 'page')
    expect(button).toHaveClass('bg-accent/30', 'hover:bg-accent/35')
    fireEvent.click(button)
    expect(props.onSelect).toHaveBeenCalledOnce()
  })

  it('uses the compact single-line row treatment', () => {
    renderItem()
    expect(screen.getByRole('button', { name: /review sidebar/i })).toHaveClass('h-8', 'gap-1.5', 'px-1.5', 'rounded-md', 'hover:bg-accent/20')
  })

  it('renders the rename field outside the thread button', () => {
    renderItem()
    const button = screen.getByRole('button', { name: /review sidebar/i })
    fireEvent.contextMenu(button, { clientX: 20, clientY: 20 })
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

    const input = screen.getByRole('textbox', { name: 'Rename Review sidebar' })
    expect(button).toHaveAttribute('aria-hidden', 'true')
    expect(button.contains(input)).toBe(false)
  })
})
