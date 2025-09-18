import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MainPage from '../../MainPage';
import { isDevelopmentBypass, MOCK_INIT_DATA, MOCK_THEME_PARAMS } from '../mockData';

// Mock the useWebApp hook
vi.mock('@vkruglikov/react-telegram-web-app', () => ({
  useWebApp: vi.fn(() => ({
    ready: vi.fn(),
    initData: null, // Simulate no Telegram initData
    backgroundColor: null,
    themeParams: null,
  })),
  useExpand: () => [false, vi.fn()], // [isExpanded, expand]
}));

// Mock the API call
vi.mock('../../api', () => ({
  initMiniApp: vi.fn(() =>
    Promise.resolve({
      token: 'mock-token-123',
      user: {
        id: 123456789,
        firstName: 'Test',
        lastName: 'User',
        username: 'testuser',
        telegramId: 123456789,
      },
      startParam: null,
      startPage: 'fleamarket',
    })
  ),
}));

describe('Development Auth Bypass', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('isDevelopmentBypass function', () => {
    const originalMode = import.meta.env.MODE;
    const originalBypass = import.meta.env.VITE_DEV_BYPASS_AUTH;

    afterEach(() => {
      // Restore original values
      import.meta.env.MODE = originalMode;
      import.meta.env.VITE_DEV_BYPASS_AUTH = originalBypass;
    });

    it('should return false in production mode', () => {
      import.meta.env.MODE = 'production';
      import.meta.env.VITE_DEV_BYPASS_AUTH = 'true';

      expect(isDevelopmentBypass()).toBe(false);
    });

    it('should return false when bypass is disabled', () => {
      import.meta.env.MODE = 'development';
      import.meta.env.VITE_DEV_BYPASS_AUTH = 'false';

      expect(isDevelopmentBypass()).toBe(false);
    });

    it('should return true when in development and bypass enabled', () => {
      import.meta.env.MODE = 'development';
      import.meta.env.VITE_DEV_BYPASS_AUTH = 'true';

      expect(isDevelopmentBypass()).toBe(true);
    });
  });

  describe('Mock data integrity', () => {
    it('should have valid mock initData', () => {
      expect(MOCK_INIT_DATA).toBeTruthy();
      expect(typeof MOCK_INIT_DATA).toBe('string');
      expect(MOCK_INIT_DATA).toContain('user=');
      expect(MOCK_INIT_DATA).toContain('auth_date=');
      expect(MOCK_INIT_DATA).toContain('hash=');
    });

    it('should have valid mock theme params', () => {
      expect(MOCK_THEME_PARAMS).toBeTruthy();
      expect(MOCK_THEME_PARAMS.bg_color).toBe('#ffffff');
      expect(MOCK_THEME_PARAMS.text_color).toBe('#000000');
      expect(MOCK_THEME_PARAMS.button_color).toBeTruthy();
    });
  });

  describe('MainPage with bypass enabled', () => {
    beforeEach(() => {
      // Enable bypass for these tests
      import.meta.env.MODE = 'development';
      import.meta.env.VITE_DEV_BYPASS_AUTH = 'true';
    });

    it('should show development bypass message in console', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      render(
        <QueryClientProvider client={queryClient}>
          <MainPage />
        </QueryClientProvider>
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        '🚧 Development mode: Using mock authentication data'
      );

      consoleSpy.mockRestore();
    });

    it('should load the app successfully with mock data', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MainPage />
        </QueryClientProvider>
      );

      // Should show loading initially
      expect(screen.getByText('Loading Flea Market...')).toBeInTheDocument();

      // Wait for the app to load with mock authentication
      await waitFor(
        () => {
          // Should not show "Use Telegram" page
          expect(screen.queryByText(/use telegram to continue/i)).not.toBeInTheDocument();
          // Should not show auth failed
          expect(screen.queryByText('Authentication failed')).not.toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should not show UseTelegramPage when bypass is enabled', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MainPage />
        </QueryClientProvider>
      );

      expect(screen.queryByText(/use telegram to continue/i)).not.toBeInTheDocument();
    });
  });

  describe('MainPage with bypass disabled', () => {
    beforeEach(() => {
      // Disable bypass for these tests
      import.meta.env.MODE = 'development';
      import.meta.env.VITE_DEV_BYPASS_AUTH = 'false';
    });

    it('should show UseTelegramPage when no initData and bypass disabled', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MainPage />
        </QueryClientProvider>
      );

      expect(screen.getByText(/use telegram to continue/i)).toBeInTheDocument();
    });
  });

  describe('Production safety', () => {
    beforeEach(() => {
      // Simulate production environment
      import.meta.env.MODE = 'production';
      import.meta.env.VITE_DEV_BYPASS_AUTH = 'true'; // Even if someone tries to enable it
    });

    it('should never bypass auth in production mode', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MainPage />
        </QueryClientProvider>
      );

      // Should show "Use Telegram" page because bypass is disabled in production
      expect(screen.getByText(/use telegram to continue/i)).toBeInTheDocument();
    });
  });
});
