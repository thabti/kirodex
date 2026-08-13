export type AppPlatform = 'macos' | 'windows' | 'linux'

export const detectPlatform = (): AppPlatform => {
  if (typeof navigator === 'undefined') return 'linux'

  const platform = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`.toLowerCase()
  if (/mac|iphone|ipad|ipod/.test(platform)) return 'macos'
  if (platform.includes('win')) return 'windows'
  return 'linux'
}

export const APP_PLATFORM = detectPlatform()
export const IS_MACOS = APP_PLATFORM === 'macos'
export const MODIFIER_KEY_LABEL = IS_MACOS ? '⌘' : 'Ctrl+'
