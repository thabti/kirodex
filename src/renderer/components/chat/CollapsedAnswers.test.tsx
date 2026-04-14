import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CollapsedAnswers } from './CollapsedAnswers'

describe('CollapsedAnswers', () => {
  it('returns null for empty array', () => {
    const { container } = render(<CollapsedAnswers questionAnswers={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows count', () => {
    render(<CollapsedAnswers questionAnswers={[{ question: 'Q?', answer: 'A' }]} />)
    expect(screen.getByText('Answered 1 question')).toBeInTheDocument()
  })

  it('pluralizes count', () => {
    render(<CollapsedAnswers questionAnswers={[{ question: 'Q1', answer: 'A1' }, { question: 'Q2', answer: 'A2' }]} />)
    expect(screen.getByText('Answered 2 questions')).toBeInTheDocument()
  })

  it('starts expanded and collapses on click', () => {
    render(<CollapsedAnswers questionAnswers={[{ question: 'What?', answer: 'This' }]} />)
    expect(screen.getByText('What?')).toBeInTheDocument()
    expect(screen.getByText('This')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('What?')).not.toBeInTheDocument()
    expect(screen.queryByText('This')).not.toBeInTheDocument()
  })
})
