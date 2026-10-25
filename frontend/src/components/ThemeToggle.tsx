import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../lib/theme'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius)] border border-[var(--vyntra-border-strong)] bg-[var(--vyntra-card)] text-[var(--vyntra-fg)] transition hover:bg-[var(--vyntra-hover)] ${className}`}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? <Sun className="h-4 w-4 text-[var(--vyntra-accent-2)]" /> : <Moon className="h-4 w-4 text-[var(--vyntra-primary)]" />}
    </button>
  )
}
