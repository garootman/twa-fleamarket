/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Telegram theme colors
        'telegram-bg': 'var(--tg-theme-bg-color, #ffffff)',
        'telegram-text': 'var(--tg-theme-text-color, #000000)',
        'telegram-hint': 'var(--tg-theme-hint-color, #6c757d)',
        'telegram-link': 'var(--tg-theme-link-color, #007acc)',
        'telegram-button': 'var(--tg-theme-button-color, #007acc)',
        'telegram-button-text': 'var(--tg-theme-button-text-color, #ffffff)',
        'telegram-secondary-bg': 'var(--tg-theme-secondary-bg-color, #f8f9fa)',
      },
    },
  },
  plugins: [],
};
