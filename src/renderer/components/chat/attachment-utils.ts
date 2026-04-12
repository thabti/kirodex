import { ipc } from '@/lib/ipc'
import type { Attachment, AttachmentType } from '@/types'

export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])
export const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'json', 'yaml', 'yml', 'toml', 'xml', 'csv', 'log',
  'ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'rb', 'java', 'c', 'cpp', 'h',
  'css', 'scss', 'html', 'sql', 'sh', 'bash', 'zsh', 'fish', 'env',
  'gitignore', 'dockerignore', 'editorconfig', 'prettierrc',
])
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024 // 10MB
export const MAX_TEXT_SIZE = 512 * 1024 // 512KB for inline text

export const getAttachmentType = (name: string): AttachmentType => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (TEXT_EXTENSIONS.has(ext)) return 'text'
  return 'binary'
}

export const getMimeType = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const mimeMap: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    bmp: 'image/bmp', ico: 'image/x-icon',
    json: 'application/json', xml: 'application/xml',
    pdf: 'application/pdf', zip: 'application/zip',
  }
  return mimeMap[ext] ?? 'application/octet-stream'
}

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

export const processDroppedFile = async (file: File): Promise<Attachment | null> => {
  if (file.size > MAX_ATTACHMENT_SIZE) return null
  const type = getAttachmentType(file.name)
  const attachment: Attachment = {
    id: crypto.randomUUID(),
    name: file.name,
    path: '',
    type,
    size: file.size,
    mimeType: file.type || getMimeType(file.name),
  }
  if (type === 'image') {
    const base64 = await fileToBase64(file)
    return { ...attachment, preview: `data:${attachment.mimeType};base64,${base64}`, base64Content: base64 }
  }
  if (type === 'text' && file.size <= MAX_TEXT_SIZE) {
    const text = await file.text()
    return { ...attachment, textContent: text }
  }
  const base64 = await fileToBase64(file)
  return { ...attachment, base64Content: base64 }
}

export const processNativePath = async (filePath: string): Promise<Attachment | null> => {
  const name = filePath.split('/').pop() ?? filePath
  const type = getAttachmentType(name)
  if (type === 'image') {
    const base64 = await ipc.readFileBase64(filePath)
    if (!base64) return null
    const mimeType = getMimeType(name)
    const size = Math.round(base64.length * 0.75)
    return {
      id: crypto.randomUUID(), name, path: filePath, type, size, mimeType,
      preview: `data:${mimeType};base64,${base64}`, base64Content: base64,
    }
  }
  if (type === 'text') {
    const text = await ipc.readFile(filePath)
    if (!text) return null
    if (text.length > MAX_TEXT_SIZE) return null
    return {
      id: crypto.randomUUID(), name, path: filePath, type,
      size: new Blob([text]).size, mimeType: getMimeType(name), textContent: text,
    }
  }
  const base64 = await ipc.readFileBase64(filePath)
  if (!base64) return null
  return {
    id: crypto.randomUUID(), name, path: filePath, type: 'binary',
    size: Math.round(base64.length * 0.75), mimeType: getMimeType(name), base64Content: base64,
  }
}

export const buildAttachmentMessage = (attachments: readonly Attachment[]): string => {
  if (attachments.length === 0) return ''
  const parts: string[] = []
  for (const a of attachments) {
    if (a.type === 'image' && a.base64Content) {
      parts.push(`[Attached image: ${a.name} (${a.mimeType}, ${a.size} bytes)]`)
      parts.push(`<image src="data:${a.mimeType};base64,${a.base64Content}" />`)
    } else if (a.type === 'text' && a.textContent) {
      const ext = a.name.split('.').pop() ?? ''
      parts.push(`[Attached file: ${a.name}]`)
      parts.push('```' + ext)
      parts.push(a.textContent)
      parts.push('```')
    } else if (a.path) {
      parts.push(`[Attached file: ${a.name} at ${a.path}]`)
    } else {
      parts.push(`[Attached file: ${a.name} (${a.size} bytes, binary)]`)
    }
  }
  return parts.join('\n')
}
