import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Cada archivo de prueba crea su propia base pg-mem en memoria: no hay estado compartido.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
