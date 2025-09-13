import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock the entire Telegram WebApp hook
vi.mock('@vkruglikov/react-telegram-web-app', () => ({
  useWebApp: () => ({
    ready: vi.fn(),
    initData: 'mock-init-data',
    backgroundColor: '#ffffff',
    themeParams: {
      bg_color: '#ffffff',
      text_color: '#000000',
      hint_color: '#999999',
      button_color: '#007acc',
      button_text_color: '#ffffff',
      secondary_bg_color: '#f8f9fa',
    },
  }),
  useExpand: () => [false, vi.fn()], // [isExpanded, expand]
  BackButton: vi.fn().mockImplementation(() => null),
  MainButton: vi.fn().mockImplementation(() => null),
}));

// Mock API functions
vi.mock('../api', () => ({
  initMiniApp: vi.fn().mockResolvedValue({
    token: 'mock-token',
    startParam: null,
    startPage: 'home',
    user: {
      id: 1,
      firstName: 'Test',
      lastName: 'User',
      username: 'testuser',
      telegramId: 123456789,
    },
  }),
  getMe: vi.fn(),
  // Calendar functions removed
}));

// Mock window.Telegram for tests
Object.defineProperty(window, 'Telegram', {
  value: {
    WebApp: {
      close: vi.fn(),
      ready: vi.fn(),
      initData: 'mock-init-data',
      backgroundColor: '#ffffff',
      themeParams: {
        bg_color: '#ffffff',
        text_color: '#000000',
        hint_color: '#999999',
        button_color: '#007acc',
        button_text_color: '#ffffff',
        secondary_bg_color: '#f8f9fa',
      },
    },
  },
  writable: true,
});
