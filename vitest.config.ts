import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['apps/worker/tests/**/*.ts', 'apps/worker/src/**/*.test.ts'],
    exclude: ['webapp/**/*', 'node_modules/**/*'],
  },
  resolve: {
    alias: {
      '@': './apps/worker/src',
    },
  },
});
