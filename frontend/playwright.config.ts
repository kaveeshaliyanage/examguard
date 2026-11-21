import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Chromium's fake microphone replays this silent clip so the pre-exam noise check sees a quiet
// room instead of the default test tone, which would fail the -38 dBFS threshold.
const silentAudio = fileURLToPath(new URL('./e2e/fixtures/silence.wav', import.meta.url));

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    permissions: ['camera', 'microphone'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${silentAudio}`,
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      // The full Chromium build supports the fullscreen API the pre-exam wizard requires.
      // PLAYWRIGHT_CHANNEL=chrome runs against an installed Chrome instead, which is useful
      // on machines where the browser download is blocked.
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chromium',
      },
    },
  ],
});
