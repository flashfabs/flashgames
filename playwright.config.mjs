// End-to-end tests: every player gets its own browser context (its own page), all in headless Chromium.
// Signaling goes through the public PeerJS server, so these tests need internet access.

import net from 'node:net';
import { defineConfig } from '@playwright/test';

// A free port, chosen once by the runner and inherited by the workers through the environment, so several
// worktrees can run the suite at the same time. SALINHA_PORTA fixes it.
function portaLivre() {
  return new Promise((resolve, reject) => {
    const servidor = net.createServer();
    servidor.on('error', reject);
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      servidor.close(() => resolve(port));
    });
  });
}

process.env.SALINHA_PORTA ??= String(await portaLivre());
const PORTA = Number(process.env.SALINHA_PORTA);

export default defineConfig({
  testDir: 'testes/e2e',
  testMatch: '*.spec.mjs',
  // npm run e2e runs the functional scenarios two at a time (SALINHA_PROCESSOS changes it), then the performance
  // project alone, so its numbers are not disturbed by other pages.
  workers: Number(process.env.SALINHA_PROCESSOS ?? 1),
  fullyParallel: false,
  projects: [
    { name: 'funcionais', testIgnore: /desempenho\.spec\.mjs$/ },
    { name: 'desempenho', testMatch: /desempenho\.spec\.mjs$/ },
  ],
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
