import { useState, useEffect } from 'react';
import { useWebApp } from '@vkruglikov/react-telegram-web-app';
import { useQuery, useMutation } from '@tanstack/react-query';
import { initMiniApp, User } from '../api';
import { isDevelopmentBypass, MOCK_INIT_DATA } from '../dev/mockData';

export interface AuthProps {
  onAuthSuccess: (user: User, token: string) => void;
  onAuthError: (error: string) => void;
}

export function Auth({ onAuthSuccess, onAuthError }: AuthProps): JSX.Element {
  const webApp = useWebApp();
  const [isLoading, setIsLoading] = useState(false);

  // Development bypass: use mock data when enabled
  const devBypass = isDevelopmentBypass();
  const effectiveInitData = devBypass ? MOCK_INIT_DATA : webApp.initData;

  // Auto-trigger auth when init data is available
  const authMutation = useMutation({
    mutationFn: async (initData: string) => {
      if (devBypass) {
        // Return mock auth data for development
        return {
          token: 'dev-bypass-token',
          user: {
            id: 123456789,
            firstName: 'Test',
            lastName: 'User',
            username: 'testuser',
            telegramId: 123456789,
          },
          startParam: null,
          startPage: 'fleamarket',
        };
      }

      return await initMiniApp(initData);
    },
    onSuccess: data => {
      console.log('✅ Authentication successful');
      onAuthSuccess(data.user, data.token);
    },
    onError: (error: Error) => {
      console.error('❌ Authentication failed:', error);
      onAuthError(error.message);
    },
  });

  // Automatically start auth when component mounts and init data is available
  useEffect(() => {
    if (effectiveInitData && !authMutation.isPending) {
      console.log('🔐 Starting authentication...');
      setIsLoading(true);
      authMutation.mutate(effectiveInitData);
    }
  }, [effectiveInitData, authMutation]);

  // Manual retry function
  const retryAuth = () => {
    if (effectiveInitData) {
      authMutation.mutate(effectiveInitData);
    }
  };

  if (!effectiveInitData && !devBypass) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-5 text-center">
        <div className="text-2xl mb-4">📱</div>
        <h2 className="text-lg font-semibold mb-2">Open in Telegram</h2>
        <p className="text-sm text-gray-600 mb-4">
          This app must be opened through Telegram to work properly.
        </p>
        <p className="text-xs text-gray-500">
          Please use the link shared in your Telegram chat or bot.
        </p>
      </div>
    );
  }

  if (authMutation.isPending || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-5 text-center">
        <div className="text-2xl mb-4">🔐</div>
        <h2 className="text-lg font-semibold mb-2">Authenticating...</h2>
        <p className="text-sm text-gray-600">Verifying your Telegram identity</p>
        {devBypass && (
          <p className="text-xs text-orange-600 mt-2">
            🚧 Development mode: Using mock authentication
          </p>
        )}
      </div>
    );
  }

  if (authMutation.isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-5 text-center">
        <div className="text-2xl mb-4">❌</div>
        <h2 className="text-lg font-semibold mb-2">Authentication Failed</h2>
        <p className="text-sm text-gray-600 mb-4">
          {authMutation.error?.message || 'Unable to verify your Telegram identity'}
        </p>
        <button
          onClick={retryAuth}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // This state should not be reached as successful auth triggers onAuthSuccess
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-5 text-center">
      <div className="text-2xl mb-4">⏳</div>
      <p className="text-sm text-gray-600">Preparing your marketplace experience...</p>
    </div>
  );
}

export default Auth;
