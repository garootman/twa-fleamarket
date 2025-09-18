import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppRouter from '../AppRouter';

// Mock user data
const mockUser = {
  id: 1,
  firstName: 'Test',
  lastName: 'User',
  username: 'testuser',
  telegramId: 123456789,
};

// Mock theme params
const mockThemeParams = {
  bg_color: '#ffffff',
  text_color: '#000000',
  hint_color: '#999999',
  button_color: '#007acc',
  button_text_color: '#ffffff',
  secondary_bg_color: '#f8f9fa',
};

describe('AppRouter', () => {
  it('renders home page by default', () => {
    render(<AppRouter user={mockUser} themeParams={mockThemeParams} />);

    expect(screen.getByText('Flea Market')).toBeInTheDocument();
    expect(screen.getByText(/Coming Soon/)).toBeInTheDocument();
  });

  it('shows user initials in header', () => {
    render(<AppRouter user={mockUser} themeParams={mockThemeParams} />);

    // Should show user initials (T + U from Test User)
    expect(screen.getByText('TU')).toBeInTheDocument();
  });
});
