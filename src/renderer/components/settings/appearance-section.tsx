import { cn } from '@/lib/utils'
import type { AppSettings } from '@/types'
import { SectionHeader, SectionLabel, SettingsCard } from './settings-shared'
import ThemeSelector from './ThemeSelector'

const FONT_SIZE_MIN = 12
const FONT_SIZE_MAX = 22

interface AppearanceSectionProps {
  draft: AppSettings
  updateDraft: (patch: Partial<AppSettings>) => void
}

export const AppearanceSection = ({ draft, updateDraft }: AppearanceSectionProps) => {
  const fontSize = draft.fontSize ?? 14

  const handleFontSizeInput = (value: string) => {
    const num = Number(value)
    if (Number.isNaN(num)) return
    updateDraft({ fontSize: Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, num)) })
  }

  return (
    <>
      <SectionHeader section="appearance" />
      <div>
        <SectionLabel title="Theme" />
        <SettingsCard>
          <div className="py-1">
            <ThemeSelector
              value={draft.theme ?? 'dark'}
              onChange={(mode) => updateDraft({ theme: mode })}
            />
          </div>
        </SettingsCard>
      </div>

      <div>
        <SectionLabel title="Font size" />
        <SettingsCard>
          <div className="py-1">
            <div className="flex items-center gap-4">
              <span className="text-[11px] font-medium text-muted-foreground tabular-nums">{FONT_SIZE_MIN}</span>
              <input
                type="range"
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                step={1}
                value={fontSize}
                onChange={(e) => updateDraft({ fontSize: Number(e.target.value) })}
                aria-label="Font size"
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border/60 accent-primary [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm"
              />
              <span className="text-[11px] font-medium text-muted-foreground tabular-nums">{FONT_SIZE_MAX}</span>
              <input
                type="number"
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                value={fontSize}
                onChange={(e) => handleFontSizeInput(e.target.value)}
                aria-label="Font size value"
                className="w-14 rounded-lg border border-input bg-background/50 px-2 py-1 text-center text-sm font-semibold tabular-nums text-primary outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="mt-3 rounded-lg border border-border/60 bg-background/50 px-4 py-3">
              <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Preview</p>
              <p className="text-foreground/80 leading-relaxed" style={{ fontSize }}>The quick brown fox jumps over the lazy dog</p>
            </div>
          </div>
        </SettingsCard>
      </div>

      <div>
        <SectionLabel title="Layout" />
        <SettingsCard>
          <div className="py-1">
            <label className="mb-1.5 block text-[12px] font-medium text-foreground/70">Sidebar position</label>
            <div className="flex gap-2">
              {(['left', 'right'] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() => updateDraft({ sidebarPosition: pos })}
                  className={cn(
                    'flex-1 rounded-lg border py-2.5 text-center text-xs font-medium capitalize transition-colors',
                    (draft.sidebarPosition ?? 'left') === pos
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
        </SettingsCard>
      </div>
    </>
  )
}
