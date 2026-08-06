import { Component, type ErrorInfo, type ReactNode } from 'react'

type AppErrorBoundaryState = {
  failed: boolean
}

export default class AppErrorBoundary extends Component<
  { children: ReactNode },
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application render failed', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="app-recovery" role="alert">
        <div className="app-recovery__card">
          <span className="app-recovery__eyebrow">Workspace recovery</span>
          <h1>Something interrupted this view.</h1>
          <p>
            Your saved workspace data is safe. Reload the application to restore the latest
            state, or return to the dashboard if this route is no longer available.
          </p>
          <div className="app-recovery__actions">
            <button type="button" onClick={() => window.location.reload()}>
              Reload workspace
            </button>
            <a href="/dashboard">Return to dashboard</a>
          </div>
        </div>
      </main>
    )
  }
}
