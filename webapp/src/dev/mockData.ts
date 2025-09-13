// Development-only mock data for bypassing Telegram auth
// This file is only used when VITE_DEV_BYPASS_AUTH=true

const mockUserData = {
  id: 123456789,
  first_name: 'Test',
  last_name: 'User',
  username: 'testuser',
  language_code: 'en',
  is_premium: false,
  allows_write_to_pm: true,
  photo_url: 'https://via.placeholder.com/150x150?text=Mock+User',
};

const mockAuthData = {
  query_id: 'TEST_QUERY_ID',
  user: mockUserData,
  auth_date: Math.floor(Date.now() / 1000),
  hash: 'test_hash_value',
};

// Create URL-encoded initData string
export const MOCK_INIT_DATA = new URLSearchParams({
  query_id: mockAuthData.query_id,
  user: JSON.stringify(mockAuthData.user),
  auth_date: mockAuthData.auth_date.toString(),
  hash: mockAuthData.hash,
}).toString();

export const MOCK_THEME_PARAMS = {
  bg_color: '#ffffff',
  text_color: '#000000',
  hint_color: '#6c757d',
  link_color: '#007acc',
  button_color: '#007acc',
  button_text_color: '#ffffff',
  secondary_bg_color: '#f8f9fa',
};

export const isDevelopmentBypass = (): boolean => {
  // Only allow bypass in development mode with explicit env variable
  return import.meta.env.MODE === 'development' && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';
};
