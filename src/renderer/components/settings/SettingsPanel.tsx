import { useState, useEffect, useCallback, useMemo } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { IconX, IconArrowLeft, IconBrandGithub, IconSearch, IconRotate, IconCircleFilled } from '@tabler/icons-react'
import { useTaskStore } from '@/stores/taskStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { handleExternalLinkClick, handleExternalLinkKeyDown } from '@/lib/open-external'
import type { AppSettings } from '@/types'
import { applyTheme, persistTheme } from '@/lib/theme'
import { AboutDialog } from './AboutDialog'
import { NAV, NAV_GROUP_LABELS, SEARCHABLE_SETTINGS, type Section, type NavGroup } from './settings-shared'
import { AccountSection } from './account-section'
import { GeneralSection } from './general-section'
import { AppearanceSection } from './appearance-section'
import { KeymapSection } from './keymap-section'
import { AdvancedSection } from './advanced-section'
import { ArchivesSection } from './archives-section'

const defaultSettings: AppSettings = {
  kiroBin: 'kiro-cli',
  agentProfiles: [],
  fontSize: 14,
  sidebarPosition: 'left',
  analyticsEnabled: true,
}

/** Shallow compare two AppSettings objects to detect unsaved changes */
const isDirty = (draft: AppSettings, saved: AppSettings): boolean =>
  JSON.stringify(draft) !== JSON.stringify(saved)

export const SettingsPanel = () => {
  const open = useTaskStore((s) => s.isSettingsOpen)
  const setOpen = useTaskStore((s) => s.setSettingsOpen)
  const settingsInitialSection = useTaskStore((s) => s.settingsInitialSection)
  const { settings, saveSettings, kiroAuthChecked, checkAuth } = useSettingsStore()

  const [section, setSection] = useState<Section>('general')
  const [draft, setDraft] = useState<AppSettings>(settings)
  const [appVersion, setAppVersion] = useState('')
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const hasDirtyState = useMemo(() => isDirty(draft, settings), [draft, settings])

  useEffect(() => { getVersion().then(setAppVersion).catch(() => {}) }, [])
  useEffect(() => { if (open && !kiroAuthChecked) checkAuth() }, [open, kiroAuthChecked, checkAuth])
  useEffect(() => { setDraft(settings) }, [settings])

  useEffect(() => {
    if (open && settingsInitialSection) setSection(settingsInitialSection as Section)
  }, [open, settingsInitialSection])

  useEffect(() => {
    if (!open) return
    setSearchQuery('')
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  useEffect(() => {
    if (!open) return
    applyTheme(draft.theme ?? 'dark')
  }, [open, draft.theme])

  const handleSave = useCallback(() => {
    const mode = draft.theme ?? 'dark'
    persistTheme(mode)
    applyTheme(mode)
    saveSettings(draft)
    setOpen(false)
  }, [draft, saveSettings, setOpen])

  const handleClose = useCallback(() => {
    applyTheme(settings.theme ?? 'dark')
    setOpen(false)
  }, [settings.theme, setOpen])

  const handleRestoreDefaults = useCallback(() => {
    setDraft(defaultSettings)
  }, [])

  const updateDraft = useCallback((patch: Partial<AppSettings>) => {
    setDraft((d) => ({ ...d, ...patch }))
  }, [])

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return null
    return SEARCHABLE_SETTINGS.filter((item) => {
      const haystack = `${item.label} ${item.description} ${item.keywords}`.toLowerCase()
      return q.split(/\s+/).every((word) => haystack.includes(word))
    })
  }, [searchQuery])

  const handleSearchResultClick = useCallback((targetSection: Section) => {
    setSection(targetSection)
    setSearchQuery('')
  }, [])

  if (!open) return null

  // Group nav items for rendering with labels
  const navGroups = NAV.reduce<Array<{ group: NavGroup; items: typeof NAV }>>((acc, item) => {
    const last = acc[acc.length - 1]
    if (last && last.group === item.group) {
      last.items.push(item)
    } else {
      acc.push({ group: item.group, items: [item] })
    }
    return acc
  }, [])

  return (
    <div data-testid="settings-panel" className="fixed inset-0 z-50 flex animate-in fade-in-0 duration-150">
      <div className="absolute inset-0 bg-background/95 backdrop-blur-xl" />

      <div className="relative z-10 flex w-full">
        {/* Sidebar */}
        <nav data-testid="settings-nav" className="flex w-56 shrink-0 flex-col border-r border-border/60 px-3 pt-16 pb-4">
          <div className="mb-5 px-3">
            <h2 className="text-lg font-semibold text-foreground">Settings</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Configure Kirodex</p>
          </div>

          {/* Search */}
          <div className="relative mb-4 px-3">
            <IconSearch className="pointer-events-none absolute left-5.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search settings…"
              aria-label="Search settings"
              className="flex h-8 w-full rounded-lg border border-input bg-background/50 pl-8 pr-3 text-[12px] placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Search results dropdown */}
          {searchResults !== null && searchResults.length > 0 ? (
            <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1">
              {searchResults.map((item) => {
                const navItem = NAV.find((n) => n.id === item.section)
                return (
                  <button
                    key={`${item.section}-${item.label}`}
                    onClick={() => handleSearchResultClick(item.section)}
                    className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/50"
                  >
                    {navItem && <navItem.icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />}
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-foreground">{item.label}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{item.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            /* Grouped nav */
            <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto" role="tablist" aria-label="Settings sections">
              {navGroups.map(({ group, items }, groupIdx) => (
                <div key={group} className={cn(groupIdx > 0 && 'mt-3')}>
                  <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                    {NAV_GROUP_LABELS[group]}
                  </p>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      role="tab"
                      aria-selected={section === item.id}
                      onClick={() => setSection(item.id)}
                      className={cn(
                        'relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all',
                        section === item.id
                          ? 'bg-primary/10 text-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                      )}
                    >
                      {section === item.id && (
                        <div className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                      )}
                      <item.icon className={cn('size-4 shrink-0', section === item.id ? 'text-primary' : 'opacity-60')} />
                      <span className="text-[13px] font-medium leading-tight">{item.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="mt-auto px-3 pt-4 border-t border-border/70 space-y-2">
            <button
              onClick={handleClose}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <IconArrowLeft className="size-4" />
              Back
            </button>
            <div className="flex items-center justify-between px-3 py-1">
              <button type="button" onClick={() => setIsAboutOpen(true)} className="text-left transition-colors hover:text-foreground">
                <p className="text-[10px] text-muted-foreground">Kirodex {appVersion ? `v${appVersion}` : ''}</p>
              </button>
              <a href="https://github.com/thabti/kirodex" onClick={handleExternalLinkClick} onKeyDown={handleExternalLinkKeyDown} aria-label="Kirodex on GitHub" tabIndex={0} className="text-muted-foreground transition-colors hover:text-foreground">
                <IconBrandGithub className="size-3.5" />
              </a>
            </div>
          </div>
        </nav>

        {/* Main content */}
        <div className="flex flex-1 flex-col min-h-0">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-6">
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span>Settings</span>
              <span className="text-muted-foreground/40">/</span>
              <span className="text-foreground/80 font-medium">{searchResults !== null ? 'Search' : NAV.find((n) => n.id === section)?.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleRestoreDefaults}
                    className="flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label="Restore default settings"
                  >
                    <IconRotate className="size-3.5" />
                    Defaults
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Restore all settings to defaults</TooltipContent>
              </Tooltip>
              <button onClick={handleClose} className="rounded-lg border border-border/50 px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">Cancel</button>
              <button
                onClick={handleSave}
                data-testid="settings-save-button"
                className={cn(
                  'relative rounded-lg px-4 py-1.5 text-[12px] font-medium transition-colors',
                  hasDirtyState
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-primary/60 text-primary-foreground/70 cursor-default',
                )}
              >
                {hasDirtyState && (
                  <IconCircleFilled className="absolute -right-1 -top-1 size-2.5 text-amber-400" />
                )}
                Save changes
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={handleClose} data-testid="settings-close-button" className="ml-1 flex size-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground">
                    <IconX className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Close <kbd className="ml-1 rounded-sm bg-background/15 px-1 text-[10px]">Esc</kbd></TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="mx-auto max-w-2xl space-y-6">
              {searchResults !== null ? (
                searchResults.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <IconSearch className="size-5 text-muted-foreground/40" />
                    <p className="text-[13px] text-muted-foreground">No settings match "{searchQuery}"</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="mb-3 text-[12px] text-muted-foreground">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</p>
                    {searchResults.map((item) => {
                      const navItem = NAV.find((n) => n.id === item.section)
                      return (
                        <button
                          key={`${item.section}-${item.label}`}
                          onClick={() => handleSearchResultClick(item.section)}
                          className="flex w-full items-center gap-3 rounded-xl border border-border/50 bg-card/70 px-5 py-3.5 text-left transition-colors hover:bg-accent/50"
                        >
                          {navItem && <navItem.icon className="size-4 shrink-0 text-muted-foreground/60" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium text-foreground">{item.label}</p>
                            <p className="text-[11px] text-muted-foreground">{item.description}</p>
                          </div>
                          <span className="shrink-0 rounded-md bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{navItem?.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )
              ) : (
                <>
                  {section === 'account' && <AccountSection />}
                  {section === 'general' && <GeneralSection draft={draft} updateDraft={updateDraft} />}
                  {section === 'appearance' && <AppearanceSection draft={draft} updateDraft={updateDraft} />}
                  {section === 'keymap' && <KeymapSection />}
                  {section === 'advanced' && <AdvancedSection draft={draft} updateDraft={updateDraft} onClose={handleClose} />}
                  {section === 'archives' && <ArchivesSection />}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <AboutDialog open={isAboutOpen} onOpenChange={setIsAboutOpen} />
    </div>
  )
}
