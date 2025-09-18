import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WebAppProvider } from '@vkruglikov/react-telegram-web-app';
import MainPage from './MainPage';
import { Component, ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('App Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-5 text-center bg-red-50">
          <div className="text-2xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <details className="mb-4 max-w-md">
            <summary className="cursor-pointer text-sm text-gray-600">Error details</summary>
            <pre className="text-xs mt-2 p-2 bg-gray-100 rounded overflow-auto">
              {this.state.error?.message}
            </pre>
          </details>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <WebAppProvider options={{ smoothButtonsTransition: true }}>
        <QueryClientProvider client={queryClient}>
          <MainPage />
        </QueryClientProvider>
      </WebAppProvider>
    </ErrorBoundary>
  );
}

export default App;
