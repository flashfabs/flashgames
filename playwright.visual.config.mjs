// Visual regression (npm run visual): screenshots of the screens on a desktop, an iPad and a phone, compared with
// the images in testes/e2e/visual/. Kept out of npm run e2e on purpose: the screens change on purpose all the
// time, so the quality front reviews each difference and refreshes the images (npm run visual -- --update-snapshots).

import { defineConfig } from '@playwright/test';
import base from './playwright.config.mjs';

export default defineConfig({
  ...base,
  testMatch: '*.visual.mjs',
  projects: [{ name: 'visual' }],
  snapshotPathTemplate: '{testDir}/visual/{arg}{ext}',
  expect: {
    ...base.expect,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide', scale: 'css' },
  },
});
