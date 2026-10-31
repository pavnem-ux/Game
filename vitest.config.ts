import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'tests/character-stats/**/*.test.ts',
      'tests/combat-core/**/*.test.ts',
      'tests/weapon-attacks/**/*.test.ts',
      'tests/status-effects/**/*.test.ts',
      'tests/enemy-ai/**/*.test.ts',
    ],
  },
});
