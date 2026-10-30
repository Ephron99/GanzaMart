import { defineConfig } from 'vitest/config';

// Server tests run in Node (no browser) and may touch the real local MySQL
// instance seeded by database/seed.sql.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // DB-touching tests are serialised so order/inventory assertions stay deterministic.
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 15000,
  },
});
