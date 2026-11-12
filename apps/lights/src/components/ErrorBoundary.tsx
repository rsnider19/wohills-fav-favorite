import { Component, type ReactNode } from 'react'

/** Shows `fallback` if a child throws while rendering, e.g. a lazy chunk (the map) that
 *  failed to download. Give it a new `key` to try again. */
export class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode; onError?: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError?.()
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
