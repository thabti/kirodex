import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useUpdateStore } from '@/stores/updateStore'
import type { UpdateStatus } from '@/stores/updateStore'

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ setSettingsOpen: vi.fn() }),
    { getState: () => ({ setSettingsOpen: vi.fn() }), setState: vi.fn() },
  ),
}))

vi.mock('@/stores/debugStore', () => ({
  useDebugStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ isOpen: false }),
    { getState: () => ({ toggleOpen: vi.fn() }) },
  ),
}))

vi.mock('@/hooks/useResizeHandle', () => ({
  useResizeHandle: () => vi.fn(),
}))

vi.mock('./KiroConfigPanel', () => ({
  KiroConfigPanel: () => <div data-testid="kiro-config-panel" />,
}))

import { SidebarFooter } from './SidebarFooter'

const wrap = (ui: React.ReactNode) => <TooltipProvider>{ui}</TooltipProvider>

const resetUpdateStore = (overrides: Partial<{ status: UpdateStatus; triggerDownload: (() => void) | null; triggerRestart: (() => Promise<void>) | null }> = {}) => {
  useUpdateStore.setState({
    status: 'idle',
    updateInfo: null,
    progress: null,
    error: null,
    dismissedVersion: null,
    triggerDownload: null,
    triggerRestart: null,
    ...overrides,
  })
}

beforeEach(() => {
  resetUpdateStore()
})

describe('SidebarFooter update indicator', () => {
  it('does not show indicator dot when status is idle', () => {
    resetUpdateStore({ status: 'idle' })
    render(wrap(<SidebarFooter />))
    expect(screen.queryByTestId('update-indicator-dot')).not.toBeInTheDocument()
  })

  it('does not show indicator dot when status is checking', () => {
    resetUpdateStore({ status: 'checking' })
    render(wrap(<SidebarFooter />))
    expect(screen.queryByTestId('update-indicator-dot')).not.toBeInTheDocument()
  })

  it('shows indicator dot when status is available', () => {
    resetUpdateStore({ status: 'available' })
    render(wrap(<SidebarFooter />))
    expect(screen.getByTestId('update-indicator-dot')).toBeInTheDocument()
  })

  it('shows indicator dot when status is downloading', () => {
    resetUpdateStore({ status: 'downloading' })
    render(wrap(<SidebarFooter />))
    expect(screen.getByTestId('update-indicator-dot')).toBeInTheDocument()
  })

  it('shows indicator dot when status is ready', () => {
    resetUpdateStore({ status: 'ready' })
    render(wrap(<SidebarFooter />))
    expect(screen.getByTestId('update-indicator-dot')).toBeInTheDocument()
  })

  it('does not show indicator dot when status is error', () => {
    resetUpdateStore({ status: 'error' })
    render(wrap(<SidebarFooter />))
    expect(screen.queryByTestId('update-indicator-dot')).not.toBeInTheDocument()
  })

  it('shows "Update Now" badge only when status is available', () => {
    resetUpdateStore({ status: 'available', triggerDownload: vi.fn() })
    render(wrap(<SidebarFooter />))
    expect(screen.getByText('Update Now')).toBeInTheDocument()
  })

  it('does not show "Update Now" badge when status is downloading', () => {
    resetUpdateStore({ status: 'downloading' })
    render(wrap(<SidebarFooter />))
    expect(screen.queryByText('Update Now')).not.toBeInTheDocument()
  })

  it('renders Settings button text', () => {
    render(wrap(<SidebarFooter />))
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders Debug button text', () => {
    render(wrap(<SidebarFooter />))
    expect(screen.getByText('Debug')).toBeInTheDocument()
  })
})
