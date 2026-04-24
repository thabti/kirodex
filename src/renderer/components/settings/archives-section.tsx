import { SectionHeader, SettingsGrid } from './settings-shared'
import { DeletedThreadsRestore } from './deleted-threads-restore'

export const ArchivesSection = () => (
  <>
    <SectionHeader section="archives" />
    <SettingsGrid label="Deleted threads" description="Restore or permanently remove">
      <DeletedThreadsRestore />
    </SettingsGrid>
  </>
)
