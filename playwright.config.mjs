// End-to-end tests: every player gets its own browser context (its own page), all in headless Chromium.
// Signaling goes through the public PeerJS server, so these tests need internet access.

import { defineConfig } from '@playwright/test';

const PORTA = 8805;

export default defineConfig({
  testDir: 'testes/e2e',
  testMatch: '*.spec.mjs',
  // One test at a time: each one already runs up to 8 pages, and the performance check needs the CPU to itself.
  workers: 1,
  fullyParallel: false,
  // The free signaling server sometimes takes long to answer; a retry tells a flaky network from a broken game.
  retries: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORTA}`,
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    launchOptions: {
      args: [
        // Real local IPs instead of mDNS names, so pages of the same browser find each other quickly.
        '--disable-features=WebRtcHideLocalIpsWithMdns',
        // Pages never count as hidden, so requestAnimationFrame keeps running on every player.
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  webServer: {
    command: `python3 -m http.server ${PORTA} --bind 127.0.0.1 --directory site`,
    url: `http://127.0.0.1:${PORTA}/`,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
