import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Last-resort guard: an unexpected render error shows a recoverable message instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Unhandled UI error', error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="splash" role="alert">
        <h2>Something went wrong</h2>
        <p>The page hit an unexpected error. Your data is safe.</p>
        <button className="btn primary" onClick={() => { this.setState({ failed: false }); location.assign('/'); }}>Back to dashboard</button>
      </div>
    );
  }
}
