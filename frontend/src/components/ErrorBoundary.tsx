import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean; message: string }

/** Keeps the shell alive if a route throws during render or a child crashes. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'Something went wrong',
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[vyntra] UI error', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 px-6 py-20 text-center">
        <p className="page-kicker">Recoverable error</p>
        <h1 className="page-title text-3xl">This view hit a snag</h1>
        <p className="text-base text-[var(--vyntra-muted)]">
          The rest of Vyntra is still up. Reload this page or go back to markets.
        </p>
        <p className="max-w-sm font-mono text-xs text-[var(--vyntra-faint)]">{this.state.message}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn-primary" onClick={() => window.location.assign('/')}>
            Markets
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
