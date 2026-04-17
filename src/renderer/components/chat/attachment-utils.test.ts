import { describe, it, expect } from 'vitest'
import {
  getAttachmentType, getMimeType, buildAttachmentMessage,
  extractIpcAttachments,
  IMAGE_EXTENSIONS, TEXT_EXTENSIONS, MAX_ATTACHMENT_SIZE, MAX_TEXT_SIZE,
} from './attachment-utils'
import type { Attachment } from '@/types'

describe('getAttachmentType', () => {
  it.each(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])(
    'returns image for .%s',
    (ext) => expect(getAttachmentType(`file.${ext}`)).toBe('image'),
  )

  it.each(['ts', 'tsx', 'js', 'json', 'md', 'py', 'rs', 'go', 'css', 'html', 'sql', 'sh'])(
    'returns text for .%s',
    (ext) => expect(getAttachmentType(`file.${ext}`)).toBe('text'),
  )

  it('returns binary for unknown extensions', () => {
    expect(getAttachmentType('file.exe')).toBe('binary')
    expect(getAttachmentType('file.dll')).toBe('binary')
    expect(getAttachmentType('file')).toBe('binary')
  })
})

describe('getMimeType', () => {
  it.each([
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['gif', 'image/gif'],
    ['webp', 'image/webp'],
    ['svg', 'image/svg+xml'],
    ['json', 'application/json'],
    ['xml', 'application/xml'],
    ['pdf', 'application/pdf'],
    ['zip', 'application/zip'],
  ])('returns correct MIME for .%s', (ext, expected) => {
    expect(getMimeType(`file.${ext}`)).toBe(expected)
  })

  it('returns octet-stream for unknown', () => {
    expect(getMimeType('file.xyz')).toBe('application/octet-stream')
  })
})

describe('buildAttachmentMessage', () => {
  it('returns empty string for empty array', () => {
    expect(buildAttachmentMessage([])).toBe('')
  })

  it('formats image attachment with base64', () => {
    const a: Attachment = { id: '1', name: 'pic.png', path: '', type: 'image', size: 100, mimeType: 'image/png', base64Content: 'abc123' }
    const msg = buildAttachmentMessage([a])
    expect(msg).toContain('[Attached image: pic.png')
    expect(msg).toContain('<image src="data:image/png;base64,abc123"')
  })

  it('formats text attachment with code fence', () => {
    const a: Attachment = { id: '2', name: 'code.ts', path: '', type: 'text', size: 50, mimeType: 'text/plain', textContent: 'const x = 1' }
    const msg = buildAttachmentMessage([a])
    expect(msg).toContain('[Attached file: code.ts]')
    expect(msg).toContain('```ts')
    expect(msg).toContain('const x = 1')
  })

  it('formats path-only attachment', () => {
    const a: Attachment = { id: '3', name: 'data.bin', path: '/tmp/data.bin', type: 'binary', size: 200, mimeType: 'application/octet-stream' }
    const msg = buildAttachmentMessage([a])
    expect(msg).toContain('[Attached file: data.bin at /tmp/data.bin]')
  })

  it('formats binary attachment without path', () => {
    const a: Attachment = { id: '4', name: 'data.bin', path: '', type: 'binary', size: 200, mimeType: 'application/octet-stream' }
    const msg = buildAttachmentMessage([a])
    expect(msg).toContain('[Attached file: data.bin (200 bytes, binary)]')
  })
})

describe('constants', () => {
  it('IMAGE_EXTENSIONS contains expected members', () => {
    expect(IMAGE_EXTENSIONS.has('png')).toBe(true)
    expect(IMAGE_EXTENSIONS.has('jpg')).toBe(true)
    expect(IMAGE_EXTENSIONS.has('svg')).toBe(true)
  })

  it('TEXT_EXTENSIONS contains expected members', () => {
    expect(TEXT_EXTENSIONS.has('ts')).toBe(true)
    expect(TEXT_EXTENSIONS.has('rs')).toBe(true)
    expect(TEXT_EXTENSIONS.has('py')).toBe(true)
  })

  it('MAX_ATTACHMENT_SIZE is 10MB', () => {
    expect(MAX_ATTACHMENT_SIZE).toBe(10 * 1024 * 1024)
  })

  it('MAX_TEXT_SIZE is 512KB', () => {
    expect(MAX_TEXT_SIZE).toBe(512 * 1024)
  })
})

describe('extractIpcAttachments', () => {
  it('returns empty array for empty input', () => {
    expect(extractIpcAttachments([])).toEqual([])
  })

  it('extracts image attachments with base64Content', () => {
    const a: Attachment = { id: '1', name: 'pic.png', path: '', type: 'image', size: 100, mimeType: 'image/png', base64Content: 'abc123' }
    const result = extractIpcAttachments([a])
    expect(result).toEqual([{ base64: 'abc123', mimeType: 'image/png', name: 'pic.png' }])
  })

  it('excludes image attachments without base64Content', () => {
    const a: Attachment = { id: '1', name: 'pic.png', path: '/tmp/pic.png', type: 'image', size: 100, mimeType: 'image/png' }
    expect(extractIpcAttachments([a])).toEqual([])
  })

  it('excludes text and binary attachments', () => {
    const text: Attachment = { id: '1', name: 'code.ts', path: '', type: 'text', size: 50, mimeType: 'text/plain', textContent: 'const x = 1' }
    const binary: Attachment = { id: '2', name: 'data.bin', path: '', type: 'binary', size: 200, mimeType: 'application/octet-stream', base64Content: 'xyz' }
    expect(extractIpcAttachments([text, binary])).toEqual([])
  })

  it('extracts only image attachments from mixed input', () => {
    const img: Attachment = { id: '1', name: 'pic.jpg', path: '', type: 'image', size: 100, mimeType: 'image/jpeg', base64Content: 'imgdata' }
    const text: Attachment = { id: '2', name: 'readme.md', path: '', type: 'text', size: 50, mimeType: 'text/plain', textContent: '# Hi' }
    const result = extractIpcAttachments([img, text])
    expect(result).toHaveLength(1)
    expect(result[0].base64).toBe('imgdata')
  })
})
