import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  // Update state when an error is thrown
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  // Log error details or send to a monitoring service
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });

    // Example: Send error details to an external monitoring service
    // sendErrorToService({ error, errorInfo });
  }

  // Reset the error state if needed (e.g., on a button click)
  resetError = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-red-100 text-red-700 rounded-lg shadow-md">
          <h2 className="text-xl font-bold mb-4">Something went wrong</h2>
          <p className="mb-4">
            We encountered an unexpected error. Please try refreshing the page or contact support if the problem persists.
          </p>
          {this.state.error && (
            <details className="text-sm whitespace-pre-wrap">
              <summary className="cursor-pointer text-red-500 underline">
                Error details
              </summary>
              {this.state.error.toString()}
              <br />
              {this.state.errorInfo?.componentStack}
            </details>
          )}
          <button
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg shadow hover:bg-blue-600"
            onClick={this.resetError}
          >
            Retry
          </button>
        </div>
      );
    }

    // Render children if no error occurred
    return this.props.children;
  }
}

export default ErrorBoundary;
