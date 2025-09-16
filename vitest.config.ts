import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.ts'],
    exclude: ['webapp/**/*', 'node_modules/**/*'],
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
});
