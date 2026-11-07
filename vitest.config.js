import { defineConfig } from 'vitest/config';

// React component tests (src/**/*.test.jsx) run here in a fake browser (jsdom).
// Game-logic and backend tests run with Node's built-in runner (see "test" in package.json).
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.jsx'],
    setupFiles: ['src/test/setup.js'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.jsx'],
      reporter: ['text-summary']
    }
  }
});
