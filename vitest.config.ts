import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(rootDir),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [
            'components/exam/__tests__/**/*.unit.test.ts',
            'components/exam/__tests__/**/*.test.ts',
            'components/exam/__tests__/questionnaire-analysis.test.ts',
            'components/exam/__tests__/database-relationship.test.ts',
            'components/exam/__tests__/database-integrity.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['components/exam/__tests__/**/*.browser.test.tsx'],
          setupFiles: ['./components/exam/__tests__/browser.setup.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            headless: true,
            expect: {
              toMatchScreenshot: {
              resolveScreenshotPath: ({ arg, ext }) => {
                const screenshotArg = arg.startsWith('integration-test/')
                  ? arg.slice('integration-test/'.length)
                  : arg;
                const evidenceRoot = screenshotArg.startsWith('it-')
                  ? 'integration-test'
                  : screenshotArg.startsWith('system-test/')
                    ? 'system-test'
                    : /^h\d+\//.test(arg)
                      ? 'hypothesis-test'
                      : 'unit-test';
                const evidencePath = screenshotArg.startsWith('system-test/')
                  ? screenshotArg.slice('system-test/'.length)
                  : screenshotArg;
                return path.resolve(
                  rootDir,
                  'components',
                  'exam',
                  '__tests__',
                  '__screenshots__',
                  evidenceRoot,
                  `${evidencePath}${ext}`,
                );
              },
              },
            },
            viewport: {
              width: 1440,
              height: 1000,
            },
          },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['lib/**/*.ts', 'app/api/**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.config.ts'],
    },
  },
});