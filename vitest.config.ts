import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      include: ['src/sim/**', 'src/maps/**', 'src/data/**', 'src/tutorial/**', 'src/view/selection.ts', 'src/view/ui/layout.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
