import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgentHandoffLoader } from './AgentHandoffLoader'

describe('AgentHandoffLoader', () => {
  it('announces a stable status without reading the changing timer', () => {
    render(<AgentHandoffLoader label="Sending to Kiro…" detail="4s" announcement="Kiro is working" />)
    expect(screen.getByRole('status', { name: 'Kiro is working' })).toBeInTheDocument()
    expect(screen.getByText('Sending to Kiro…')).toBeInTheDocument()
    expect(screen.getByText('4s')).toBeInTheDocument()
  })

  it('renders one animated reasoning marker without participant avatars', () => {
    const { container } = render(<AgentHandoffLoader label="Thinking…" />)
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(1)
    expect(container.querySelectorAll('[data-slot="agent-handoff-participant"]')).toHaveLength(0)
  })

  it('uses a transparent reduced-density treatment in compact timelines', () => {
    const { container } = render(<AgentHandoffLoader compact label="Synthesizing…" detail="2m 04s" />)
    const status = container.querySelector('[data-slot="agent-handoff-status"]')

    expect(status).toHaveClass('h-7', 'px-1', 'gap-1.5', 'text-muted-foreground')
    expect(status).not.toHaveClass('border', 'shadow-sm')
    expect(status?.className).not.toMatch(/\bbg-/)
  })

  it('fades only the changing label while keeping the handoff geometry stable', () => {
    const { container } = render(<AgentHandoffLoader compact label="Synthesizing…" detail="2m 04s" isLabelVisible={false} reserveLabelWidth />)
    const root = screen.getByRole('status')
    const label = container.querySelector('[data-slot="agent-handoff-label"]')
    const detail = container.querySelector('[data-slot="agent-handoff-detail"]')

    expect(root).not.toHaveClass('opacity-0')
    expect(label).toHaveClass('w-20', 'opacity-0')
    expect(detail).not.toHaveClass('opacity-0')
  })
})
