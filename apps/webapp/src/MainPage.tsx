import { useEffect, useState } from 'react';
import { initMiniApp } from './api';
import { useWebApp, useExpand } from '@vkruglikov/react-telegram-web-app';
import { useQuery } from '@tanstack/react-query';
import AppRouter from './router/AppRouter';
import UseTelegramPage from './components/UseTelegramPage';
import NotFoundPage from './components/NotFoundPage';
import { isDevelopmentBypass, MOCK_INIT_DATA, MOCK_THEME_PARAMS } from './dev/mockData';
import { parseTelegramUrl, isValidRoute } from './utils/urlUtils';

function MainPage(): JSX.Element {
  const webApp = useWebApp();
  const [isExpanded, expand] = useExpand();
  const [currentRoute, setCurrentRoute] = useState<string>('/');

  // Development bypass: use mock data when enabled
  const devBypass = isDevelopmentBypass();
  const effectiveInitData = devBypass ? MOCK_INIT_DATA : webApp.initData;
  const effectiveThemeParams = devBypass ? MOCK_THEME_PARAMS : webApp.themeParams;
  const effectiveBackgroundColor = devBypass ? MOCK_THEME_PARAMS.bg_color : webApp.backgroundColor;

  useEffect(() => {
    console.log('MainPage mounted, initData:', effectiveInitData ? 'available' : 'missing');
    if (devBypass) {
      console.log('🚧 Development mode: Using mock authentication data');
    }
    webApp.ready();

    // Expand the viewport to full size
    if (!isExpanded) {
      console.log('📱 Expanding Telegram Web App viewport');
      expand();
    }
  }, [webApp, effectiveInitData, devBypass, isExpanded, expand]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) || '/';
      const parsed = parseTelegramUrl(hash);

      console.log('🔍 Parsed URL:', parsed);

      // Store Telegram data for potential use
      if (parsed.tgWebAppData) {
        console.log('📱 Telegram Web App data detected in URL');
      }

      if (parsed.startParam) {
        console.log('🔗 Start parameter detected:', parsed.startParam);
      }

      setCurrentRoute(parsed.route);
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Handle initial route

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const initResult = useQuery({
    queryKey: ['initData', devBypass],
    queryFn: async () => {
      if (!effectiveInitData) {
        throw new Error('No init data available');
      }

      // If dev bypass is enabled, return mock data without calling API
      if (devBypass) {
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

      const result = await initMiniApp(effectiveInitData);
      return result;
    },
    enabled: !!effectiveInitData,
    retry: false,
  });

  const { token, user } = initResult?.data || {};

  const containerStyles = {
    backgroundColor: effectiveBackgroundColor || effectiveThemeParams?.bg_color || '#ffffff',
    color: effectiveThemeParams?.text_color || '#000000',
  };

  // Check for valid routes first, before auth
  if (!isValidRoute(currentRoute)) {
    console.log('❌ Invalid route detected:', currentRoute, 'Showing 404');
    return <NotFoundPage onGoHome={() => (window.location.hash = '/')} />;
  }

  // Show "use telegram" page if no init data (not opened through Telegram) and not in dev bypass mode
  if (!effectiveInitData && !devBypass) {
    return <UseTelegramPage />;
  }

  // Loading state
  if (initResult.isLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen p-5 text-center"
        style={containerStyles}
      >
        <div className="text-2xl mb-4">🏪</div>
        <div>Loading Flea Market...</div>
      </div>
    );
  }

  // Error state
  if (initResult.isError) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen p-5 text-center"
        style={containerStyles}
      >
        <div className="text-2xl mb-4">⚠️</div>
        <div>Error loading the app</div>
        <div
          className="text-sm mt-2"
          style={{ color: effectiveThemeParams?.hint_color || '#6c757d' }}
        >
          {(initResult.error as Error)?.message || 'Please try reloading or contact support'}
        </div>
      </div>
    );
  }

  // No token received
  if (!token || !user) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen p-5 text-center"
        style={containerStyles}
      >
        <div className="text-2xl mb-4">🔐</div>
        <div>Authentication failed</div>
        <div
          className="text-sm mt-2"
          style={{ color: effectiveThemeParams?.hint_color || '#6c757d' }}
        >
          Unable to authenticate with Telegram
        </div>
      </div>
    );
  }

  // Main app with authentication successful
  return <AppRouter user={user} themeParams={effectiveThemeParams || {}} />;
}

export default MainPage;
