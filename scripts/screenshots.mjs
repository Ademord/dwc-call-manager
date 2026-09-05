import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const browser = await chromium.launch({
  channel: process.env.DWC_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
});
try {
  await mkdir('docs/images', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
  const demo = pathToFileURL(resolve('demo/dist/index.html')).href;
  await page.goto(demo);
  await page.getByTestId('open-DEMO-011').click();
  const dialog = page.getByTestId('evaluation-dialog');
  await dialog.locator('[data-tour="reason-dwc_problem"]').click();
  await dialog.locator('[data-tour="device"]').selectOption('tuma_classic_comfort');
  await dialog.locator('[data-tour="fault"]').selectOption('descaling_filter');
  await dialog.locator('[data-tour="resolution"]').selectOption('service_requested');
  await expect(dialog.locator('[data-tour="submit"]')).toBeEnabled();
  await page.screenshot({ path: 'docs/images/evaluation.png' });
  await dialog.locator('[data-tour="submit"]').click();
  await expect(dialog.getByRole('heading', { name: 'Auswertung gespeichert!' })).toBeVisible();
  await dialog.locator('[data-tour="close-summary"]').click();
  await page.locator('[data-tour="role-manager"]').click();
  await expect(page.getByText('11 von 12 Anrufen ausgewertet')).toBeVisible();
  await page.screenshot({ path: 'docs/images/dashboard.png' });

  await page.goto(demo);
  await page.getByRole('button', { name: 'Tour starten', exact: true }).click();
  await page.getByLabel('Tourtempo').selectOption('6000');
  await expect(dialog).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Tour pausieren' }).click();
  await expect(page.getByTestId('tour-card')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fortsetzen', exact: true })).toBeEnabled();
  await page.mouse.move(0, 0);
  await expect(page.getByRole('button', { name: 'Fortsetzen', exact: true })).toHaveCSS(
    'background-color',
    'rgb(46, 102, 206)',
  );
  await page.screenshot({ path: 'docs/images/guided-tour.png' });
  console.log('Created dashboard, evaluation, and guided-tour images in docs/images/.');
} finally {
  await browser.close();
}
