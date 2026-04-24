import { IconLogin, IconLogout } from '@tabler/icons-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { SectionHeader, SettingsCard, SettingRow, SettingsGrid } from './settings-shared'

export const AccountSection = () => {
  const { kiroAuth, logout, openLogin } = useSettingsStore()

  return (
    <>
      <SectionHeader section="account" />
      <SettingsGrid label="Authentication" description="Kiro account status">
        <SettingsCard>
          {kiroAuth ? (
            <SettingRow
              label={kiroAuth.email ?? 'Authenticated'}
              description={`${kiroAuth.accountType}${kiroAuth.region ? ` · ${kiroAuth.region}` : ''}`}
            >
              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-1.5 rounded-md border border-destructive/30 px-2.5 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <IconLogout className="size-3" />
                Sign out
              </button>
            </SettingRow>
          ) : (
            <SettingRow
              label="Not signed in"
              description="Sign in to access Kiro features."
            >
              <button
                type="button"
                onClick={openLogin}
                className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <IconLogin className="size-3" />
                Sign in
              </button>
            </SettingRow>
          )}
        </SettingsCard>
      </SettingsGrid>
    </>
  )
}
