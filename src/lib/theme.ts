export type Theme = 'dark' | 'light' | 'sky'

const THEME_STORAGE_KEY = 'lancee-theme'

export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'sky') return stored
  } catch {
    // ignore storage errors
  }
  return 'dark'
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme === 'sky' ? 'light' : theme)
  if (theme === 'sky') {
    document.documentElement.setAttribute('data-theme-variant', 'sky')
  } else {
    document.documentElement.removeAttribute('data-theme-variant')
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // ignore storage errors
  }
}

export function toggleTheme(): Theme {
  const current = getStoredTheme()
  const next: Theme = current === 'dark' ? 'light' : current === 'light' ? 'sky' : 'dark'
  applyTheme(next)
  return next
}
