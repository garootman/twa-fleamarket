import { useState, useEffect } from 'react';
import { User } from '../api';
import Header from '../components/Header';
import MePage from '../components/MePage';
import FleaMarketHome from '../components/FleaMarketHome';
import { parseTelegramUrl } from '../utils/urlUtils';

interface AppRouterProps {
  user: User;
  themeParams: Record<string, string>;
}

type Route = '/' | '/me';

function AppRouter({ user, themeParams }: AppRouterProps): JSX.Element {
  const [currentRoute, setCurrentRoute] = useState<Route>('/');

  // Simple client-side routing using hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) || '/';
      const parsed = parseTelegramUrl(hash);

      setCurrentRoute(parsed.route as Route);
    };

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Handle initial route

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (route: Route) => {
    window.location.hash = route;
  };

  const renderRoute = () => {
    switch (currentRoute) {
      case '/':
        return (
          <>
            <Header user={user} onProfileClick={() => navigate('/me')} />
            <FleaMarketHome user={user} />
          </>
        );
      case '/me':
        return <MePage user={user} onBack={() => navigate('/')} onHome={() => navigate('/')} />;
      default:
        return (
          <>
            <Header user={user} onProfileClick={() => navigate('/me')} />
            <FleaMarketHome user={user} />
          </>
        );
    }
  };

  return (
    <div
      className="w-full h-full min-h-screen"
      style={{
        backgroundColor: themeParams.bg_color || '#ffffff',
        color: themeParams.text_color || '#000000',
        width: '100vw',
        height: '100vh',
      }}
    >
      {renderRoute()}
    </div>
  );
}

export default AppRouter;
