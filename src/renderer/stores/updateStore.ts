import { create } from 'zustand'

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

interface UpdateInfo {
  version: string
  date?: string
  body?: string
}

interface UpdateProgress {
  downloaded: number
  total: number | null
}

interface UpdateState {
  status: UpdateStatus
  updateInfo: UpdateInfo | null
  progress: UpdateProgress | null
  error: string | null
  /** Version the user dismissed (skip re-showing toast for same version) */
  dismissedVersion: string | null

  setStatus: (status: UpdateStatus) => void
  setUpdateInfo: (info: UpdateInfo | null) => void
  setProgress: (progress: UpdateProgress | null) => void
  setError: (error: string | null) => void
  dismissVersion: (version: string) => void
  reset: () => void
}

const DISMISSED_KEY = 'kirodex-update-dismissed-version'

export const useUpdateStore = create<UpdateState>((set) => ({
  status: 'idle',
  updateInfo: null,
  progress: null,
  error: null,
  dismissedVersion: (() => { try { return localStorage.getItem(DISMISSED_KEY) } catch { return null } })(),

  setStatus: (status) => set({ status }),
  setUpdateInfo: (updateInfo) => set({ updateInfo }),
  setProgress: (progress) => set({ progress }),
  setError: (error) => set({ error, status: 'error' }),
  dismissVersion: (version) => {
    try {
      localStorage.setItem(DISMISSED_KEY, version)
    } catch (err) {
      console.warn('Failed to persist dismissed version:', err)
    }
    set({ dismissedVersion: version, status: 'idle' })
  },
  reset: () => set({ status: 'idle', updateInfo: null, progress: null, error: null }),
}))
