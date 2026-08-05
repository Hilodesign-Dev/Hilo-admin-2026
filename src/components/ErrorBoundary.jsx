import React from 'react'
import { _logError } from '../lib/logger'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(err) {
    return { hasError: true, error: err }
  }

  componentDidCatch(err, info) {
    _logError('react', err.message, err.stack + '\n' + (info?.componentStack || ''))
  }

  render() {
    if (!this.state.hasError) return this.props.children
    const err = this.state.error
    return (
      <div style={{ padding: '40px', fontFamily: 'system-ui', maxWidth: '600px', margin: '40px auto' }}>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '24px' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️ Something went wrong</div>
          <div style={{ color: '#991b1b', fontWeight: 600, marginBottom: '8px' }}>{err?.message || 'Unknown error'}</div>
          <div style={{ color: '#6b7280', fontSize: '13px', marginBottom: '16px' }}>This error has been logged. Reload to continue.</div>
          <button onClick={() => window.location.reload()}
            style={{ background: '#d4a843', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontWeight: 600 }}>
            Reload App
          </button>
          <details style={{ marginTop: '16px' }}>
            <summary style={{ cursor: 'pointer', color: '#6b7280', fontSize: '12px' }}>Error details (for debugging)</summary>
            <pre style={{ fontSize: '11px', marginTop: '8px', color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {err?.stack}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
