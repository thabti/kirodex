import { describe, it, expect } from 'vitest'
import { cn, joinChunk } from './utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
  })

  it('merges tailwind conflicts', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('handles undefined and null', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })

  it('returns empty string for no args', () => {
    expect(cn()).toBe('')
  })
})

describe('joinChunk', () => {
  it('inserts space after period when next chunk starts with non-whitespace', () => {
    expect(joinChunk('first.', 'Let me')).toBe('first. Let me')
  })

  it('inserts space after exclamation mark', () => {
    expect(joinChunk('Done!', 'Now')).toBe('Done! Now')
  })

  it('inserts space after question mark', () => {
    expect(joinChunk('Ready?', 'Yes')).toBe('Ready? Yes')
  })

  it('inserts space after colon', () => {
    expect(joinChunk('files:', 'src/main.ts')).toBe('files: src/main.ts')
  })

  it('does not double-space when chunk already starts with space', () => {
    expect(joinChunk('first.', ' Let me')).toBe('first. Let me')
  })

  it('does not insert space for normal token streaming', () => {
    expect(joinChunk('Hel', 'lo world')).toBe('Hello world')
  })

  it('handles empty accumulated text', () => {
    expect(joinChunk('', 'Hello')).toBe('Hello')
  })

  it('handles empty chunk', () => {
    expect(joinChunk('Hello.', '')).toBe('Hello.')
  })

  it('handles both empty', () => {
    expect(joinChunk('', '')).toBe('')
  })

  it('does not insert space after period followed by newline', () => {
    expect(joinChunk('first.', '\nSecond')).toBe('first.\nSecond')
  })

  it('reproduces the original bug scenario', () => {
    let text = ''
    text = joinChunk(text, 'Let me understand the codebase structure first.')
    text = joinChunk(text, 'Let me look at the relevant source files.')
    text = joinChunk(text, 'Now let me check the settings.')
    expect(text).toBe(
      'Let me understand the codebase structure first. Let me look at the relevant source files. Now let me check the settings.'
    )
  })
})
