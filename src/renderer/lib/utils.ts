import { type CxOptions, cx } from 'class-variance-authority'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: CxOptions) {
  return twMerge(cx(inputs))
}

/**
 * Concatenate a new streaming chunk onto accumulated text, inserting a space
 * when the accumulated text ends with sentence-ending punctuation and the
 * new chunk starts with a non-whitespace character.
 */
export function joinChunk(accumulated: string, chunk: string): string {
  if (!accumulated || !chunk) return accumulated + chunk
  const lastChar = accumulated[accumulated.length - 1]
  const firstChar = chunk[0]
  if (/[.!?:]/.test(lastChar) && /\S/.test(firstChar)) {
    return accumulated + ' ' + chunk
  }
  return accumulated + chunk
}
