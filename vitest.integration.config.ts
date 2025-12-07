import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'integration',
    include: ['tests/integration/**/*.{test,spec}.ts'],
    testTimeout: 180000, // 3 minutes for full pipeline tests
    hookTimeout: 30000,  // 30 seconds for setup/teardown
    globals: true,
    environment: 'node',
    setupFiles: ['tests/integration/setup.ts'],
    pool: 'forks', // Isolate tests to prevent interference
    poolOptions: {
      forks: {
        singleFork: true // Run tests sequentially to avoid race conditions
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
