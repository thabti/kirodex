import { Component, type ErrorInfo, type ReactNode } from 'react'
import { IconAlertCircle, IconRotate } from '@tabler/icons-react'

interface Props {
  children: ReactNode
  /** Optional fallback — if omitted a default recovery UI is shown */
  fallback?: ReactNode
}

interface State {
  error: Error | null
  retryCount: number
}

const MAX_RETRIES = 3
const RETRY_WINDOW_MS = 5000

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retryCount: 0 }
  private lastErrorTime = 0

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const now = Date.now()
    // Reset retry count if enough time has passed
    if (now - this.lastErrorTime > RETRY_WINDOW_MS) {
      this.setState({ retryCount: 1 })
    } else {
      this.setState((s) => ({ retryCount: s.retryCount + 1 }))
    }
    this.lastErrorTime = now
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  private handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback !== undefined) return this.props.fallback

      const isLooping = this.state.retryCount >= MAX_RETRIES

      return (
        <div data-testid="error-boundary-section" className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
          <IconAlertCircle className="h-8 w-8 text-destructive/70" />
          <div>
            <p className="text-sm font-medium text-foreground">Something went wrong</p>
            <p data-testid="error-boundary-message" className="mt-1 max-w-sm text-xs text-muted-foreground">
              {this.state.error.message || 'An unexpected error occurred.'}
            </p>
          </div>
          {isLooping ? (
            <p className="mt-1 max-w-xs text-xs text-muted-foreground/60">
              This component keeps crashing. Reload the window to recover.
            </p>
          ) : (
            <button
              onClick={this.handleReset}
              data-testid="error-boundary-retry-button"
              className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
            >
              <IconRotate className="h-3 w-3" />
              Try again
            </button>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
