import { describe, it, expect } from 'vitest'
import {
  parseQuestions,
  hasQuestionBlocks,
  stripQuestionBlocks,
  findQuestionStarts,
} from './question-parser'

// ── hasQuestionBlocks ─────────────────────────────────────────

describe('hasQuestionBlocks', () => {
  it('detects bracket format [1]: ', () => {
    expect(hasQuestionBlocks('[1]: What color?')).toBe(true)
  })

  it('detects bracket format without colon [1] ', () => {
    expect(hasQuestionBlocks('[1] What color?')).toBe(true)
  })

  it('detects bold format **1. ', () => {
    expect(hasQuestionBlocks('**1. What color?**')).toBe(true)
  })

  it('returns false for plain text', () => {
    expect(hasQuestionBlocks('No questions here.')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(hasQuestionBlocks('')).toBe(false)
  })

  it('returns false for bracket without space after', () => {
    expect(hasQuestionBlocks('[1]no-space')).toBe(false)
  })

  it('detects questions embedded in longer text', () => {
    const input = 'Some preamble.\n\n[1]: First question?\na. Yes\nb. No'
    expect(hasQuestionBlocks(input)).toBe(true)
  })
})

// ── findQuestionStarts ────────────────────────────────────────

describe('findQuestionStarts', () => {
  it('finds bracket format starts', () => {
    const input = '[1]: Q1?\na. Yes\n[2]: Q2?\na. No'
    const starts = findQuestionStarts(input)
    expect(starts).toHaveLength(2)
    expect(starts[0].number).toBe('1')
    expect(starts[0].format).toBe('bracket')
    expect(starts[1].number).toBe('2')
  })

  it('finds bold format when no bracket format exists', () => {
    const input = '**1. Q1?**\na. Yes\n**2. Q2?**\na. No'
    const starts = findQuestionStarts(input)
    expect(starts).toHaveLength(2)
    expect(starts[0].format).toBe('bold')
  })

  it('prefers bracket over bold when both exist', () => {
    const input = '[1]: Q1?\n**2. Q2?**'
    const starts = findQuestionStarts(input)
    expect(starts).toHaveLength(1)
    expect(starts[0].format).toBe('bracket')
  })

  it('returns empty for no matches', () => {
    expect(findQuestionStarts('plain text')).toHaveLength(0)
  })

  it('sorts by index', () => {
    const input = 'text\n[2]: Second\nmore\n[1]: First'
    const starts = findQuestionStarts(input)
    expect(starts[0].number).toBe('2')
    expect(starts[1].number).toBe('1')
  })
})

// ── parseQuestions ─────────────────────────────────────────────

describe('parseQuestions', () => {
  it('parses single question with options', () => {
    const input = '[1]: What color?\na. Red\nb. Blue\nc. Green'
    const blocks = parseQuestions(input)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].number).toBe('1')
    expect(blocks[0].question).toBe('What color?')
    expect(blocks[0].options).toHaveLength(3)
    expect(blocks[0].options[0]).toEqual({ letter: 'a', text: 'Red' })
    expect(blocks[0].options[1]).toEqual({ letter: 'b', text: 'Blue' })
    expect(blocks[0].options[2]).toEqual({ letter: 'c', text: 'Green' })
  })

  it('parses multiple questions', () => {
    const input = '[1]: First?\na. Yes\nb. No\n[2]: Second?\na. Maybe\nb. Sure'
    const blocks = parseQuestions(input)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].question).toBe('First?')
    expect(blocks[1].question).toBe('Second?')
  })

  it('parses question without options', () => {
    const input = '[1]: What is your preferred approach?'
    const blocks = parseQuestions(input)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].question).toBe('What is your preferred approach?')
    expect(blocks[0].options).toHaveLength(0)
  })

  it('parses bold format questions', () => {
    const input = '**1. What color?**\n\na. Red\nb. Blue'
    const blocks = parseQuestions(input)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].question).toBe('What color?')
    expect(blocks[0].options).toHaveLength(2)
  })

  it('handles bracket without colon', () => {
    const input = '[1] What color?\na. Red\nb. Blue'
    const blocks = parseQuestions(input)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].question).toContain('What color?')
  })

  it('handles option format a)', () => {
    const input = '[1]: Pick one?\na) First\nb) Second'
    const blocks = parseQuestions(input)
    expect(blocks[0].options).toHaveLength(2)
    expect(blocks[0].options[0]).toEqual({ letter: 'a', text: 'First' })
  })

  it('handles option format (a)', () => {
    const input = '[1]: Pick one?\n(a) First\n(b) Second'
    const blocks = parseQuestions(input)
    expect(blocks[0].options).toHaveLength(2)
  })

  it('handles bullet-prefixed options', () => {
    const input = '[1]: Pick one?\n- a. First\n- b. Second'
    const blocks = parseQuestions(input)
    expect(blocks[0].options).toHaveLength(2)
  })

  it('strips bold from option text', () => {
    const input = '[1]: Pick?\na. **Bold label** — description'
    const blocks = parseQuestions(input)
    expect(blocks[0].options[0].text).toBe('Bold label — description')
  })

  it('returns empty for no questions', () => {
    expect(parseQuestions('Just some text.')).toHaveLength(0)
  })

  it('handles multi-line question text before options', () => {
    const input = '[1]: This is a long question\nthat spans two lines?\na. Yes\nb. No'
    const blocks = parseQuestions(input)
    expect(blocks[0].question).toBe('This is a long question that spans two lines?')
  })

  it('handles extra blank lines between question and options', () => {
    const input = '[1]: Question?\n\na. Yes\nb. No'
    const blocks = parseQuestions(input)
    expect(blocks[0].options).toHaveLength(2)
  })

  it('parses the real-world kiro format', () => {
    const input = [
      'Here are my questions before I build the plan:',
      '',
      '[1]: For "overhaul all colour" — what\'s the design direction?',
      '',
      'a. **Brighter dark mode only** — Keep the current colour tokens but bump up brightness',
      'b. **Full palette redesign** — New primary/accent colours, new background tones',
      'c. **Other** — Describe the vibe you\'re after',
      '[2]: Should the light mode also be overhauled?',
      '',
      'a. **Dark mode only** — Light mode is fine as-is',
      'b. **Both modes** — Overhaul both light and dark',
      'c. **Dark mode priority, light mode polish** — Fix dark mode first, minor tweaks to light',
      '[3]: Are there any specific reference apps or colour palettes you want to match?',
    ].join('\n')
    const blocks = parseQuestions(input)
    expect(blocks).toHaveLength(3)
    expect(blocks[0].options).toHaveLength(3)
    expect(blocks[0].options[0].text).toBe('Brighter dark mode only — Keep the current colour tokens but bump up brightness')
    expect(blocks[2].options).toHaveLength(0)
  })
})

// ── stripQuestionBlocks ───────────────────────────────────────

describe('stripQuestionBlocks', () => {
  it('strips question blocks from text', () => {
    const input = 'Preamble text.\n\n[1]: Question?\na. Yes'
    expect(stripQuestionBlocks(input)).toBe('Preamble text.')
  })

  it('returns full text when no questions', () => {
    const input = 'No questions here.'
    expect(stripQuestionBlocks(input)).toBe('No questions here.')
  })

  it('strips lead-in paragraph containing "question"', () => {
    const input = 'Some context.\n\nA few questions before I start:\n\n[1]: Q?\na. Yes'
    expect(stripQuestionBlocks(input)).toBe('Some context.')
  })

  it('strips lead-in with "could you"', () => {
    const input = 'Context.\n\nCould you clarify:\n\n[1]: Q?'
    expect(stripQuestionBlocks(input)).toBe('Context.')
  })

  it('strips lead-in with "tell me"', () => {
    const input = 'Context.\n\nPlease tell me:\n\n[1]: Q?'
    expect(stripQuestionBlocks(input)).toBe('Context.')
  })

  it('strips lead-in with "let me know"', () => {
    const input = 'Context.\n\nLet me know:\n\n[1]: Q?'
    expect(stripQuestionBlocks(input)).toBe('Context.')
  })

  it('preserves text when lead-in has no keyword', () => {
    const input = 'Context.\n\nHere is more context.\n\n[1]: Q?'
    expect(stripQuestionBlocks(input)).toBe('Context.\n\nHere is more context.')
  })

  it('handles text that starts with questions', () => {
    const input = '[1]: Q?\na. Yes'
    expect(stripQuestionBlocks(input)).toBe('')
  })

  it('strips lead-in with "before we"', () => {
    const input = 'Context.\n\nBefore we start:\n\n[1]: Q?'
    expect(stripQuestionBlocks(input)).toBe('Context.')
  })

  it('strips lead-in with "clarify"', () => {
    const input = 'Context.\n\nI need to clarify a few things:\n\n[1]: Q?'
    expect(stripQuestionBlocks(input)).toBe('Context.')
  })

  it('strips lead-in with "help me understand"', () => {
    const input = 'Context.\n\nHelp me understand:\n\n[1]: Q?'
    expect(stripQuestionBlocks(input)).toBe('Context.')
  })
})

// ── Edge cases (hardened parser) ──────────────────────────────

describe('edge cases', () => {
  it('does not match markdown link references as questions', () => {
    const input = 'See [1]: https://example.com for details.'
    expect(hasQuestionBlocks(input)).toBe(false)
    expect(parseQuestions(input)).toHaveLength(0)
  })

  it('does not match [1]: //cdn.example.com as a question', () => {
    const input = '[1]: //cdn.example.com/image.png'
    expect(hasQuestionBlocks(input)).toBe(false)
  })

  it('does not match [1]: www.example.com as a question', () => {
    const input = '[1]: www.example.com'
    expect(hasQuestionBlocks(input)).toBe(false)
  })

  it('handles uppercase option letters', () => {
    const input = '[1]: Pick one?\nA. First\nB. Second\nC. Third'
    const blocks = parseQuestions(input)
    expect(blocks[0].options).toHaveLength(3)
    expect(blocks[0].options[0]).toEqual({ letter: 'a', text: 'First' })
    expect(blocks[0].options[2]).toEqual({ letter: 'c', text: 'Third' })
  })

  it('handles mixed case option letters', () => {
    const input = '[1]: Pick?\na. lower\nB. Upper'
    const blocks = parseQuestions(input)
    expect(blocks[0].options).toHaveLength(2)
    expect(blocks[0].options[1].letter).toBe('b')
  })

  it('handles multi-line option text continuation', () => {
    const input = '[1]: Pick?\na. This is a long option that\n   continues on the next line\nb. Short'
    const blocks = parseQuestions(input)
    expect(blocks[0].options).toHaveLength(2)
    expect(blocks[0].options[0].text).toBe('This is a long option that continues on the next line')
    expect(blocks[0].options[1].text).toBe('Short')
  })

  it('skips URL references but still finds real questions', () => {
    const input = 'References:\n[1]: https://example.com\n[2]: http://other.com\n\n[3]: What do you think?\na. Good\nb. Bad'
    const blocks = parseQuestions(input)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].number).toBe('3')
    expect(blocks[0].question).toBe('What do you think?')
  })

  it('stripQuestionBlocks preserves URL references', () => {
    const input = 'Some text.\n\n[1]: https://example.com\n[2]: http://other.com'
    expect(stripQuestionBlocks(input)).toBe(input)
  })

  it('handles bold format with question text between markers', () => {
    const input = '**1. What is your preferred stack?**\na. React\nb. Vue\nc. Angular'
    const blocks = parseQuestions(input)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].question).toBe('What is your preferred stack?')
    expect(blocks[0].options).toHaveLength(3)
  })

  it('handles questions with no trailing newline', () => {
    const input = '[1]: Only question?'
    const blocks = parseQuestions(input)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].question).toBe('Only question?')
  })
})
