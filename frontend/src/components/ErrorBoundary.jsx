/**
 * ErrorBoundary Component - Catch React rendering errors
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 */

import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('❌ React Error Boundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          margin: '2rem auto',
          maxWidth: '800px',
          background: '#fff3cd',
          border: '2px solid #ffc107',
          borderRadius: '8px',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <h2 style={{ color: '#856404', marginTop: 0 }}>⚠️ Something went wrong</h2>
          <p style={{ marginBottom: '1rem' }}>
            An error occurred while rendering this component. This is usually caused by:
          </p>
          <ul style={{ marginBottom: '1.5rem' }}>
            <li>Invalid data format (Date objects, undefined values)</li>
            <li>Browser cache showing old code</li>
            <li>Missing required fields</li>
          </ul>
          
          <details style={{ marginBottom: '1.5rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Technical Details (click to expand)
            </summary>
            <div style={{ 
              padding: '1rem', 
              background: '#fff', 
              borderRadius: '4px',
              overflow: 'auto',
              maxHeight: '300px'
            }}>
              <p><strong>Error:</strong></p>
              <pre style={{ 
                background: '#f8f9fa', 
                padding: '0.5rem', 
                borderRadius: '4px',
                overflow: 'auto'
              }}>
                {this.state.error && this.state.error.toString()}
              </pre>
              <p><strong>Stack Trace:</strong></p>
              <pre style={{ 
                background: '#f8f9fa', 
                padding: '0.5rem', 
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '0.85em'
              }}>
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </div>
          </details>
          
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                window.location.reload();
              }}
              style={{
                padding: '0.5rem 1rem',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Reload Page
            </button>
            <button 
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              style={{
                padding: '0.5rem 1rem',
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Clear Cache & Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

