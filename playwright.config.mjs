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
// A second server on the repository root, for the RTS determinism barrier, which loads prototipos/, site/rts/ and testes/ modules in a Worker.
process.env.SALINHA_PORTA_RAIZ ??= String(await portaLivre());
const PORTA_RAIZ = Number(process.env.SALINHA_PORTA_RAIZ);
// On Windows, python3 is usually the Microsoft Store stub; the PC test runner sets SALINHA_PYTHON=python.
const PYTHON = process.env.SALINHA_PYTHON ?? 'python3';

const ARGUMENTOS = [
  // Real local IPs instead of mDNS names, so pages of the same browser find each other quickly.
  '--disable-features=WebRtcHideLocalIpsWithMdns',
  // Pages never count as hidden, so requestAnimationFrame keeps running on every player.
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--autoplay-policy=no-user-gesture-required',
];
// Without these, headless Chromium draws canvases in software (SwiftShader), which costs nothing like a tablet's GPU
// and grows with the pixel count; with them it uses the GPU, through Metal on the Mac, like Safari on an iPad would.
// On the Windows PC the ANGLE backend comes from SALINHA_ANGLE, chosen by scripts/rtx-testes.sh after checking which one reaches the NVIDIA card.
const ANGLE = process.env.SALINHA_ANGLE ?? (process.platform === 'win32' ? 'd3d11' : 'metal');
const COM_GPU = [`--use-angle=${ANGLE}`, '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];

export default defineConfig({
  testDir: 'testes/e2e',
  testMatch: '*.spec.mjs',
  // npm run e2e runs the functional scenarios two at a time (SALINHA_PROCESSOS changes it), then the performance
  // project alone, so its numbers are not disturbed by other pages.
  workers: Number(process.env.SALINHA_PROCESSOS ?? 1),
  fullyParallel: false,
  projects: [
    { name: 'funcionais', testIgnore: /(desempenho|longo|galeria|rts-determinismo)\.spec\.mjs$/ },
    { name: 'desempenho', testMatch: /(desempenho|longo|galeria)\.spec\.mjs$/, use: { launchOptions: { args: [...ARGUMENTOS, ...COM_GPU] } } },
    // The same matches in the three engines; npm run e2e runs them with --project='rts-determinismo-*'.
    ...['chromium', 'firefox', 'webkit'].map((motor) => ({
      name: `rts-determinismo-${motor}`,
      testMatch: /rts-determinismo\.spec\.mjs$/,
      use: { browserName: motor, baseURL: `http://127.0.0.1:${PORTA_RAIZ}`, launchOptions: motor === 'chromium' ? { args: ARGUMENTOS } : {} },
    })),
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
    launchOptions: { args: ARGUMENTOS },
  },
  webServer: [
    {
      command: `${PYTHON} scripts/servidor-testes.py ${PORTA} site`,
      url: `http://127.0.0.1:${PORTA}/`,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'ignore',
    },
    {
      command: `${PYTHON} scripts/servidor-testes.py ${PORTA_RAIZ} .`,
      url: `http://127.0.0.1:${PORTA_RAIZ}/testes/e2e/`,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'ignore',
    },
  ],
});
