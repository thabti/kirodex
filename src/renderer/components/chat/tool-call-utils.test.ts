import { describe, it, expect } from 'vitest'
import { isFileMutation, getToolIcon } from './tool-call-utils'
import {
  IconFilePencil, IconTrash, IconArrowsRightLeft, IconFileText,
  IconTerminal2, IconFolderSearch, IconGlobe, IconBrain, IconTool,
} from '@tabler/icons-react'

describe('isFileMutation', () => {
  it('returns true for edit kind', () => {
    expect(isFileMutation('edit')).toBe(true)
  })

  it('returns true for delete kind', () => {
    expect(isFileMutation('delete')).toBe(true)
  })

  it('returns true for move kind', () => {
    expect(isFileMutation('move')).toBe(true)
  })

  it('returns false for read kind', () => {
    expect(isFileMutation('read')).toBe(false)
  })

  it('returns false for execute kind', () => {
    expect(isFileMutation('execute')).toBe(false)
  })

  it('falls back to title matching when no kind', () => {
    expect(isFileMutation(undefined, 'Edit file')).toBe(true)
    expect(isFileMutation(undefined, 'Write to disk')).toBe(true)
    expect(isFileMutation(undefined, 'Patch code')).toBe(true)
    expect(isFileMutation(undefined, 'Delete old file')).toBe(true)
    expect(isFileMutation(undefined, 'Move to src')).toBe(true)
    expect(isFileMutation(undefined, 'Rename component')).toBe(true)
  })

  it('returns false for non-mutation titles', () => {
    expect(isFileMutation(undefined, 'Read file')).toBe(false)
    expect(isFileMutation(undefined, 'Search codebase')).toBe(false)
  })

  it('returns false when both undefined', () => {
    expect(isFileMutation(undefined, undefined)).toBe(false)
  })
})

describe('getToolIcon', () => {
  it('returns correct icon for known kinds', () => {
    expect(getToolIcon('edit')).toBe(IconFilePencil)
    expect(getToolIcon('delete')).toBe(IconTrash)
    expect(getToolIcon('move')).toBe(IconArrowsRightLeft)
    expect(getToolIcon('read')).toBe(IconFileText)
    expect(getToolIcon('execute')).toBe(IconTerminal2)
    expect(getToolIcon('think')).toBe(IconBrain)
    expect(getToolIcon('fetch')).toBe(IconGlobe)
  })

  it('falls back to title-based matching', () => {
    expect(getToolIcon(undefined, 'Run bash command')).toBe(IconTerminal2)
    expect(getToolIcon(undefined, 'Read file contents')).toBe(IconFileText)
    expect(getToolIcon(undefined, 'Write to file')).toBe(IconFilePencil)
    expect(getToolIcon(undefined, 'Search codebase')).toBe(IconFolderSearch)
    expect(getToolIcon(undefined, 'Fetch URL')).toBe(IconGlobe)
    expect(getToolIcon(undefined, 'Think about it')).toBe(IconBrain)
  })

  it('returns default icon for unknown', () => {
    expect(getToolIcon(undefined, 'something random')).toBe(IconTool)
    expect(getToolIcon(undefined, undefined)).toBe(IconTool)
  })
})
