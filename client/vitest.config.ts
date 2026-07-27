import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@croyal/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    // Pure logic only — the Phaser renderer is verified in a real browser via
    // the CDP smoke harness, not here.
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
