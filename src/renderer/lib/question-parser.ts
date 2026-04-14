export interface QuestionOption {
  letter: string
  text: string
}

export interface QuestionBlock {
  number: string
  question: string
  options: QuestionOption[]
}

const QUESTION_START = /^\s*\[(\d+)\]:?\s*/gm
const QUESTION_START_BOLD = /^\s*\*\*(\d+)\.\s+/gm
// Matches options: "a. text", "- a. text", "  - a. **text**", "a) text", "- a) text", "(a) text"
// Case-insensitive letter match, normalized to lowercase in code
const OPTION_LINE = /^\s*(?:[-•*]\s+)?(?:\()?([a-zA-Z])(?:\)|\.|:)\s+(.+)$/

/** URL-like pattern right after `[N]:` — skip markdown link references */
const URL_AFTER_BRACKET = /^\s*https?:\/\/|^\s*\/\/|^\s*www\./

const LEAD_IN_KEYWORDS = [
  'question',
  'could you',
  'tell me',
  'let me know',
  'before we',
  'clarify',
  'understand',
  'few things',
  'i need to know',
  'help me understand',
] as const

export function findQuestionStarts(
  text: string,
): { index: number; number: string; format: 'bracket' | 'bold' }[] {
  const starts: { index: number; number: string; format: 'bracket' | 'bold' }[] = []
  let m: RegExpExecArray | null
  const re1 = new RegExp(QUESTION_START.source, 'gm')
  while ((m = re1.exec(text)) !== null) {
    // Skip markdown link references like [1]: https://example.com
    const afterMatch = text.slice(m.index + m[0].length)
    if (URL_AFTER_BRACKET.test(afterMatch)) continue
    starts.push({ index: m.index, number: m[1], format: 'bracket' })
  }
  if (starts.length === 0) {
    const re2 = new RegExp(QUESTION_START_BOLD.source, 'gm')
    while ((m = re2.exec(text)) !== null) {
      starts.push({ index: m.index, number: m[1], format: 'bold' })
    }
  }
  return starts.sort((a, b) => a.index - b.index)
}

export function parseQuestions(text: string): QuestionBlock[] {
  const blocks: QuestionBlock[] = []
  const starts = findQuestionStarts(text)
  if (starts.length === 0) return []
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]
    const end = i + 1 < starts.length ? starts[i + 1].index : text.length
    let sectionStart: number
    if (start.format === 'bracket') {
      const afterBracket = text.indexOf(']', start.index) + 1
      const colon = text.indexOf(':', afterBracket)
      sectionStart = colon >= 0 && colon < afterBracket + 3 ? colon + 1 : afterBracket
    } else {
      // Bold format: extract question text between **N. and closing **
      const lineEnd = text.indexOf('\n', start.index)
      const lineEndPos = lineEnd >= 0 ? lineEnd : end
      const afterPrefix = text.indexOf(' ', start.index + 4)
      const closeBold = text.indexOf('**', afterPrefix)
      if (closeBold >= 0 && closeBold < lineEndPos) {
        // Question text is between the prefix space and closing **
        // sectionStart points after closing ** so options are parsed from next lines
        sectionStart = closeBold + 2
      } else {
        sectionStart = afterPrefix
      }
    }
    const section = text.slice(sectionStart, end).trim()
    const lines = section.split('\n')
    const questionLines: string[] = []
    const options: QuestionOption[] = []
    // For bold format, extract question from the first line between markers
    if (start.format === 'bold') {
      const firstLine = text.slice(start.index, text.indexOf('\n', start.index) >= 0 ? text.indexOf('\n', start.index) : end)
      const innerMatch = firstLine.match(/\*\*\d+\.\s+(.+?)\*\*/)
      if (innerMatch) {
        questionLines.push(innerMatch[1].trim())
      }
    }
    for (const line of lines) {
      const optMatch = line.match(OPTION_LINE)
      if (optMatch) {
        options.push({
          letter: optMatch[1].toLowerCase(),
          text: optMatch[2].replace(/\*\*/g, '').trim(),
        })
      } else if (options.length === 0) {
        const trimmed = line.trim().replace(/\*\*/g, '')
        if (trimmed) questionLines.push(trimmed)
      } else {
        // Multi-line option continuation: non-option, non-blank line after an option
        const trimmed = line.trim()
        if (trimmed && options.length > 0) {
          options[options.length - 1].text += ' ' + trimmed.replace(/\*\*/g, '')
        }
      }
    }
    const question = questionLines.join(' ')
    if (question) blocks.push({ number: start.number, question, options })
  }
  return blocks
}

export function hasQuestionBlocks(text: string): boolean {
  // Quick check before running the full findQuestionStarts (which filters URLs)
  const hasBracket = /\[\d+\]:?\s/.test(text)
  const hasBold = /\*\*\d+\.\s+/.test(text)
  if (!hasBracket && !hasBold) return false
  // Use findQuestionStarts to filter out false positives (URL references)
  return findQuestionStarts(text).length > 0
}

export function stripQuestionBlocks(text: string): string {
  const starts = findQuestionStarts(text)
  if (starts.length === 0) return text
  let cutPoint = starts[0].index
  const before = text.slice(0, cutPoint)
  const lastNewline = before.lastIndexOf('\n\n')
  if (lastNewline >= 0) {
    const lastParagraph = before.slice(lastNewline).toLowerCase()
    const hasLeadIn = LEAD_IN_KEYWORDS.some((kw) => lastParagraph.includes(kw))
    if (hasLeadIn) {
      cutPoint = lastNewline
    }
  }
  return text.slice(0, cutPoint).trim()
}
