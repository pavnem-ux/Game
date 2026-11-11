import { defineConfig } from 'vitest/config';
import { buildDefines } from './config/build-info.mjs';

export default defineConfig({
  define: { __QA_BUILD__: 'false', ...buildDefines() },
  test: {
    environment: 'node',
    include: [
      'tests/character-stats/**/*.test.ts',
      'tests/combat-core/**/*.test.ts',
      'tests/weapon-attacks/**/*.test.ts',
      'tests/status-effects/**/*.test.ts',
      'tests/enemy-ai/**/*.test.ts',
      'tests/player-survival/**/*.test.ts',
      'tests/gameplay/**/*.test.ts',
      'tests/skills/**/*.test.ts',
      'tests/engine/**/*.test.ts',
      'tests/campaign/**/*.test.ts',
      'tests/profile/**/*.test.ts',
      'tests/persistence/**/*.test.ts',
      'tests/talents/**/*.test.ts',
      'tests/equipment/**/*.test.ts',
    ],
  },
});
