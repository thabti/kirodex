import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockClose = vi.fn()
const mockMinimize = vi.fn()
const mockMaximize = vi.fn()
const mockUnmaximize = vi.fn()
const mockIsMaximized = vi.fn().mockResolvedValue(false)
const mockIsFullscreen = vi.fn().mockResolvedValue(false)
const mockSetFullscreen = vi.fn()

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    close: mockClose,
    minimize: mockMinimize,
    maximize: mockMaximize,
    unmaximize: mockUnmaximize,
    isMaximized: mockIsMaximized,
    isFullscreen: mockIsFullscreen,
    setFullscreen: mockSetFullscreen,
  }),
}))

vi.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

import { TitleBarToolbar } from './TitleBarToolbar'
import { TrafficLights } from './TrafficLights'
import { WindowsControls } from './WindowsControls'
import { UnifiedTitleBarMacOS } from './UnifiedTitleBarMacOS'
import { UnifiedTitleBarWindows } from './UnifiedTitleBarWindows'
import { UnifiedTitleBarLinux } from './UnifiedTitleBarLinux'
import { UnifiedTitleBar } from './index'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TitleBarToolbar', () => {
  it('renders children', () => {
    render(<TitleBarToolbar><span>center</span></TitleBarToolbar>)
    expect(screen.getByText('center')).toBeInTheDocument()
  })

  it('renders leftSlot when provided', () => {
    render(<TitleBarToolbar leftSlot={<span>left</span>} />)
    expect(screen.getByText('left')).toBeInTheDocument()
  })

  it('renders rightSlot when provided', () => {
    render(<TitleBarToolbar rightSlot={<span>right</span>} />)
    expect(screen.getByText('right')).toBeInTheDocument()
  })

  it('does not render slot containers when not provided', () => {
    const { container } = render(<TitleBarToolbar />)
    const children = container.firstElementChild?.children
    expect(children?.length).toBe(1)
  })

  it('renders all three slots together', () => {
    render(
      <TitleBarToolbar leftSlot={<span>L</span>} rightSlot={<span>R</span>}>
        <span>C</span>
      </TitleBarToolbar>,
    )
    expect(screen.getByText('L')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.getByText('R')).toBeInTheDocument()
  })

  it('has data-tauri-drag-region on root', () => {
    const { container } = render(<TitleBarToolbar />)
    expect(container.firstElementChild?.hasAttribute('data-tauri-drag-region')).toBe(true)
  })
})

describe('TrafficLights', () => {
  it('renders close, minimize, maximize buttons', () => {
    render(<TrafficLights />)
    expect(screen.getByLabelText('Close')).toBeInTheDocument()
    expect(screen.getByLabelText('Minimize')).toBeInTheDocument()
    expect(screen.getByLabelText('Maximize')).toBeInTheDocument()
  })

  it('calls close on close button click', () => {
    render(<TrafficLights />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('calls minimize on minimize button click', () => {
    render(<TrafficLights />)
    fireEvent.click(screen.getByLabelText('Minimize'))
    expect(mockMinimize).toHaveBeenCalledTimes(1)
  })

  it('calls isFullscreen on maximize click', async () => {
    render(<TrafficLights />)
    fireEvent.click(screen.getByLabelText('Maximize'))
    await vi.waitFor(() => expect(mockIsFullscreen).toHaveBeenCalledTimes(1))
  })

  it('adds window-unfocused class on blur', () => {
    const { container } = render(<TrafficLights />)
    fireEvent.blur(window)
    const group = container.querySelector('.traffic-lights-group')
    expect(group?.className).toContain('window-unfocused')
  })

  it('removes window-unfocused class on focus', () => {
    const { container } = render(<TrafficLights />)
    fireEvent.blur(window)
    fireEvent.focus(window)
    const group = container.querySelector('.traffic-lights-group')
    expect(group?.className).not.toContain('window-unfocused')
  })
})

describe('WindowsControls', () => {
  it('renders minimize, maximize, close buttons', () => {
    render(<WindowsControls />)
    expect(screen.getByLabelText('Minimize')).toBeInTheDocument()
    expect(screen.getByLabelText('Maximize')).toBeInTheDocument()
    expect(screen.getByLabelText('Close')).toBeInTheDocument()
  })

  it('calls minimize on minimize click', () => {
    render(<WindowsControls />)
    fireEvent.click(screen.getByLabelText('Minimize'))
    expect(mockMinimize).toHaveBeenCalledTimes(1)
  })

  it('calls close on close click', () => {
    render(<WindowsControls />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('calls isMaximized on maximize click', async () => {
    mockIsMaximized.mockResolvedValueOnce(false)
    render(<WindowsControls />)
    fireEvent.click(screen.getByLabelText('Maximize'))
    await vi.waitFor(() => expect(mockIsMaximized).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(mockMaximize).toHaveBeenCalledTimes(1))
  })

  it('calls unmaximize when already maximized', async () => {
    mockIsMaximized.mockResolvedValueOnce(true)
    render(<WindowsControls />)
    fireEvent.click(screen.getByLabelText('Maximize'))
    await vi.waitFor(() => expect(mockUnmaximize).toHaveBeenCalledTimes(1))
  })
})

describe('UnifiedTitleBarMacOS', () => {
  it('renders children and traffic lights', () => {
    render(<UnifiedTitleBarMacOS><span>content</span></UnifiedTitleBarMacOS>)
    expect(screen.getByText('content')).toBeInTheDocument()
    expect(screen.getByLabelText('Close')).toBeInTheDocument()
  })
})

describe('UnifiedTitleBarWindows', () => {
  it('renders children and windows controls', () => {
    render(<UnifiedTitleBarWindows><span>content</span></UnifiedTitleBarWindows>)
    expect(screen.getByText('content')).toBeInTheDocument()
    expect(screen.getByLabelText('Close')).toBeInTheDocument()
  })
})

describe('UnifiedTitleBarLinux', () => {
  it('renders children and windows controls', () => {
    render(<UnifiedTitleBarLinux><span>content</span></UnifiedTitleBarLinux>)
    expect(screen.getByText('content')).toBeInTheDocument()
    expect(screen.getByLabelText('Close')).toBeInTheDocument()
  })
})

describe('UnifiedTitleBar', () => {
  it('renders children', () => {
    render(<UnifiedTitleBar><span>toolbar content</span></UnifiedTitleBar>)
    expect(screen.getByText('toolbar content')).toBeInTheDocument()
  })

  it('renders without children', () => {
    const { container } = render(<UnifiedTitleBar />)
    expect(container.firstElementChild).toBeDefined()
  })
})
