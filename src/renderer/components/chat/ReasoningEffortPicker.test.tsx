import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ipc } from '@/lib/ipc'
import { useTaskStore } from '@/stores/taskStore'
import { PanelProvider } from './PanelContext'
import { ReasoningEffortPicker } from './ReasoningEffortPicker'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    listEffortOptions: vi.fn(),
    setEffort: vi.fn(),
  },
}))

const PickerHarness = () => {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <PanelProvider value="task-1">
      <TooltipProvider>
        <ReasoningEffortPicker isOpen={isOpen} onOpenChange={setIsOpen} />
      </TooltipProvider>
    </PanelProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(ipc.listEffortOptions).mockResolvedValue(['low', 'medium', 'high', 'xhigh', 'max'])
  vi.mocked(ipc.setEffort).mockResolvedValue(undefined)
  useTaskStore.setState({
    tasks: {
      'task-1': {
        id: 'task-1',
        name: 'Test',
        workspace: '/workspace',
        status: 'paused',
        createdAt: '',
        messages: [],
      },
    },
    selectedTaskId: 'task-1',
    taskEfforts: {},
    persistHistory: vi.fn(),
  })
})

describe('ReasoningEffortPicker', () => {
  it('loads model-supported levels and applies a selection from the chat toolbar', async () => {
    render(<PickerHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Reasoning effort: Effort' }))
    const highOption = await screen.findByRole('option', { name: /^High\./ })

    expect(ipc.listEffortOptions).toHaveBeenCalledWith('task-1')
    fireEvent.click(highOption)

    await waitFor(() => expect(ipc.setEffort).toHaveBeenCalledWith('task-1', 'high'))
    expect(useTaskStore.getState().taskEfforts['task-1']).toBe('high')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('only shows levels returned for the active model', async () => {
    vi.mocked(ipc.listEffortOptions).mockResolvedValue(['low', 'high'])
    render(<PickerHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Reasoning effort: Effort' }))

    expect(await screen.findByRole('option', { name: /Low\./ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^High\./ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Medium\./ })).not.toBeInTheDocument()
    expect(screen.getByRole('listbox')).toHaveClass('w-56')
  })

  it('explains when the active model has no effort support', async () => {
    vi.mocked(ipc.listEffortOptions).mockResolvedValue([])
    render(<PickerHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Reasoning effort: Effort' }))

    expect(await screen.findByText(/This model does not support effort/)).toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(ipc.setEffort).not.toHaveBeenCalled()
  })

  it('keeps the popup open and shows Kiro CLI errors', async () => {
    vi.mocked(ipc.setEffort).mockRejectedValue(new Error('This level is unavailable for the selected model'))
    render(<PickerHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Reasoning effort: Effort' }))
    fireEvent.click(await screen.findByRole('option', { name: /Max\./ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This level is unavailable')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(useTaskStore.getState().taskEfforts['task-1']).toBeUndefined()
  })
})
