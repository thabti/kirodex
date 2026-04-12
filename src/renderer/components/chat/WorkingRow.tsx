import { memo, useState, useRef, useEffect } from 'react'

const LOADING_WORDS = [
  'Thinking',
  'Reasoning',
  'Analyzing',
  'Planning',
  'Processing',
  'Reflecting',
  'Considering',
  'Evaluating',
  'Synthesizing',
  'Crafting',
]

export const WorkingRow = memo(function WorkingRow() {
  const [idx, setIdx] = useState(() =>
    Math.floor(Math.random() * LOADING_WORDS.length),
  )
  const [visible, setVisible] = useState(true)
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const cycle = () => {
      setVisible(false)
      fadeRef.current = setTimeout(() => {
        setIdx((i) => (i + 1) % LOADING_WORDS.length)
        setVisible(true)
      }, 300)
    }
    const t = setInterval(cycle, 2200)
    return () => {
      clearInterval(t)
      if (fadeRef.current) clearTimeout(fadeRef.current)
    }
  }, [])

  return (
    <div className="py-2 select-none" data-timeline-row-kind="working">
      <div className="flex items-center gap-2">
        <span
          className="text-[13px] text-muted-foreground/50 transition-opacity duration-300"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {LOADING_WORDS[idx]}&hellip;
        </span>
      </div>
    </div>
  )
})
