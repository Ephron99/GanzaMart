import { Component } from 'react';

/**
 * A class component is the only way to declare an error boundary (React has no hook for
 * it). It catches a render error thrown anywhere in its children and shows a recoverable
 * message instead of unmounting the entire app to a blank page.
 *
 * Without this, one buggy panel (e.g. a response whose shape changed) takes down every
 * route. With it, the shopper sees an apology + a reload button, and the rest of the
 * storefront chrome stays intact.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log to the console so the failure is visible in dev tools during development.
    console.error('Ganza Mart caught a render error:', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="state" role="alert" style={{ margin: 'var(--space-6) 0' }}>
          <div className="state__icon" aria-hidden="true">⚠️</div>
          <h3>This section hit a problem</h3>
          <p>{String(this.state.error.message || 'Something went wrong while rendering this page.')}</p>
          <button type="button" className="btn btn--teal" onClick={this.reset}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
