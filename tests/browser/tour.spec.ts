import { test, expect, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

async function openDemo(page: Page) {
  await page.goto(pathToFileURL(resolve('demo/dist/index.html')).href);
  await expect(page.getByTestId('open-DEMO-011')).toBeVisible();
}
async function start(page: Page) {
  await openDemo(page);
  await page.getByRole('button', { name: 'Tour starten', exact: true }).click();
  await page.getByLabel('Tourtempo').selectOption('1300');
}
async function geometry(page: Page, selector: string) {
  await expect
    .poll(() =>
      page.evaluate((selector) => {
        const target = document.querySelector(selector)?.getBoundingClientRect();
        const card = document.querySelector('[data-testid="tour-card"]')?.getBoundingClientRect();
        const cutout = document
          .querySelector('[data-testid="tour-cutout"]')
          ?.getBoundingClientRect();
        if (!target || !card || !cutout) return false;
        const intersects =
          card.left < target.right &&
          card.right > target.left &&
          card.top < target.bottom &&
          card.bottom > target.top;
        return (
          !intersects &&
          card.left >= 11 &&
          card.right <= innerWidth - 11 &&
          card.top >= 11 &&
          card.bottom <= innerHeight - 11 &&
          Math.abs(cutout.left - Math.max(4, target.left - 6)) < 2 &&
          Math.abs(cutout.top - Math.max(4, target.top - 6)) < 2
        );
      }, selector),
    )
    .toBe(true);
}

test('spotlight sits above native dialog; target and pause controls remain clickable', async ({
  page,
}) => {
  await start(page);
  const dialog = page.getByTestId('evaluation-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Tour pausieren' }).click();
  await geometry(page, '.reason-grid');
  await page.screenshot({ path: 'reviews/screenshots/tour-desktop.png' });
  await dialog.locator('[data-tour="reason-invoice"]').click();
  await expect(dialog.locator('[data-tour="reason-invoice"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await dialog.getByRole('button', { name: 'Tour überspringen' }).click();
  await expect(page.getByTestId('tour-layer')).toHaveCount(0);
  await expect(dialog.locator('[data-tour="reason-invoice"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(dialog.locator('[data-tour="reason-order"]')).toBeFocused();
});

test('mobile spotlight follows scrolling and viewport changes without covering the field', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await expect(page.locator('[data-tour="device"]')).toHaveValue('tuma_classic_comfort');
  await page.getByRole('button', { name: 'Tour pausieren' }).click();
  await geometry(page, '[data-tour="fault"]');
  await page.screenshot({ path: 'reviews/screenshots/tour-mobile.png' });
  await page.locator('[data-tour="fault"]').selectOption('unknown');
  await page.getByTestId('evaluation-dialog').evaluate((element) => element.scrollBy(0, 48));
  await geometry(page, '[data-tour="fault"]');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await geometry(page, '[data-tour="fault"]');
  await page.setViewportSize({ width: 390, height: 568 });
  await page.locator('[data-tour="fault"]').scrollIntoViewIfNeeded();
  await geometry(page, '[data-tour="fault"]');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'reviews/screenshots/tour-mobile-short.png' });
});

test('help supports hover travel, focus and Escape inside a guided native dialog', async ({
  page,
}) => {
  await start(page);
  await expect(page.getByTestId('evaluation-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Tour pausieren' }).click();
  const help = page.getByRole('button', { name: 'Hilfe: Hauptgrund', exact: true });
  await help.hover();
  const hint = page.getByRole('tooltip');
  await expect(hint).toBeVisible();
  await hint.hover();
  await expect(hint).toBeVisible();
  await help.focus();
  await expect(help).toHaveAttribute('aria-describedby', /.+/);
  await page.keyboard.press('Escape');
  await expect(hint).toHaveCount(0);
  await expect(page.getByTestId('tour-card')).toBeVisible();
  await expect(page.getByTestId('evaluation-dialog')).toBeVisible();
  await help.click();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.screenshot({ path: 'reviews/screenshots/tour-hint.png' });
});

test('paused mobile keyboard takeover keeps the focused Später button clear of the card', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await expect(page.getByTestId('evaluation-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Tour pausieren' }).click();
  for (let index = 0; index < 18; index++) {
    await page.keyboard.press('Tab');
    if (
      await page
        .getByRole('button', { name: 'Später', exact: true })
        .evaluate((element) => element === document.activeElement)
    )
      break;
  }
  await expect(page.getByRole('button', { name: 'Später', exact: true })).toBeFocused();
  await geometry(page, '.dialog-actions .button.subtle');
  await page.screenshot({ path: 'reviews/screenshots/tour-mobile-keyboard.png' });
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('evaluation-dialog')).toHaveCount(0);
});

test('report walkthrough applies real filters and only exports on explicit user action', async ({
  page,
}) => {
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await openDemo(page);
  await page.locator('[data-tour="role-manager"]').click();
  await page.getByRole('button', { name: 'Bericht erkunden' }).click();
  await geometry(page, '.charts-grid .chart-scroll');
  await page.screenshot({ path: 'reviews/screenshots/tour-report-desktop.png' });
  await page.getByRole('button', { name: 'Filter zeigen' }).click();
  await page.getByLabel('Von', { exact: true }).fill('2026-09-04');
  await expect(page.getByTestId('tour-card')).toContainText('2026-09-01');
  await page.getByRole('button', { name: 'Anwenden', exact: true }).click();
  await expect(page.getByTestId('total-count')).toHaveText('3');
  await expect(page.getByTestId('tour-card')).toContainText('3 Anrufe');
  await page.getByRole('button', { name: 'Zum Export', exact: true }).click();
  await geometry(page, '[data-tour="export"]');
  expect(downloads).toEqual([]);
  const downloaded = page.waitForEvent('download');
  await page.locator('[data-tour="export"]').click();
  const download = await downloaded;
  const csv = readFileSync((await download.path())!, 'utf8');
  expect(csv).toContain('00000000-0000-4000-8000-000000000011');
  expect(csv).toContain('00000000-0000-4000-8000-000000000012');
  expect(csv).not.toContain('00000000-0000-4000-8000-000000000001');
  await expect(page.getByTestId('tour-card')).toContainText('Ihr Export ist bereit');
  await page.getByRole('button', { name: 'Schliessen', exact: true }).click();
  await expect(page.getByTestId('tour-layer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bericht erkunden' })).toBeFocused();
  expect(downloads).toHaveLength(1);
});

test('keyboard report navigation stays with target and tour; filter controls remain reachable', async ({
  page,
}) => {
  await openDemo(page);
  await page.locator('[data-tour="role-manager"]').click();
  await page.getByRole('button', { name: 'Bericht erkunden' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('tour-card')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.charts-grid .chart-scroll')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Hilfe: Zeitverlauf' })).toBeFocused();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Tour überspringen' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('tour-card')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Hilfe: Zeitraum' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Von', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Bericht erkunden' })).toBeFocused();
});

for (const action of ['pause', 'skip'])
  test(`late guided call response cannot reopen after ${action}`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Demo zurücksetzen', exact: true }).click();
    let release: (() => void) | undefined;
    let arrived = false;
    let settled = false;
    await page.route('**/api/calls/00000000-0000-4000-8000-000000000011', async (route) => {
      const response = await route.fetch();
      arrived = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.fulfill({ response });
      settled = true;
    });
    await page.getByRole('button', { name: 'Tour starten', exact: true }).click();
    await page.getByLabel('Tourtempo').selectOption('1300');
    await expect.poll(() => arrived).toBe(true);
    await page
      .getByRole('button', { name: action === 'pause' ? 'Tour pausieren' : 'Tour überspringen' })
      .click();
    release!();
    await expect.poll(() => settled).toBe(true);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.getByTestId('evaluation-dialog')).toHaveCount(0);
  });

test('backgrounding while reset is pending leaves the tour paused', async ({ page }) => {
  await page.goto('/');
  let release: (() => void) | undefined;
  let arrived = false;
  await page.route('**/api/demo/reset', async (route) => {
    const response = await route.fetch();
    arrived = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Tour starten', exact: true }).click();
  await expect.poll(() => arrived).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  release!();
  await expect(page.getByRole('button', { name: 'Fortsetzen', exact: true })).toBeEnabled();
  await expect(page.getByTestId('evaluation-dialog')).toHaveCount(0);
  await page.evaluate(() => {
    delete (document as unknown as { hidden?: boolean }).hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: 'Fortsetzen', exact: true })).toBeVisible();
});

test('tour waits for the newly applied report and completion copy does not freeze old counts', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tour starten', exact: true }).click();
  await page.getByLabel('Tourtempo').selectOption('1300');
  await expect(page.getByTestId('tour-card')).toContainText('Aus Antworten werden Zahlen', {
    timeout: 25000,
  });
  await page.getByRole('button', { name: 'Tour pausieren' }).click();
  let release: (() => void) | undefined;
  let arrived = false;
  await page.route('**/api/reports/summary?from=2027*', async (route) => {
    const response = await route.fetch();
    arrived = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({ response });
  });
  await page.getByLabel('Von', { exact: true }).fill('2027-01-01');
  await page.getByLabel('Bis', { exact: true }).fill('2027-01-02');
  await page.getByRole('button', { name: 'Anwenden', exact: true }).click();
  await expect.poll(() => arrived).toBe(true);
  await page.getByRole('button', { name: 'Fortsetzen', exact: true }).click();
  // Deliberately cross two automatic ticks with the report acknowledgement held.
  await page.waitForTimeout(2800);
  await expect(page.getByTestId('tour-card')).toContainText('Der Bericht wird geladen');
  await expect(page.getByText('Tour abgeschlossen', { exact: true })).toHaveCount(0);
  release!();
  await expect(page.getByText('Tour abgeschlossen', { exact: true })).toBeVisible();
  await expect(page.getByTestId('total-count')).toHaveText('0');
  await expect(page.locator('.tour-caption')).not.toContainText('12');
});

test('report walkthrough stays inside mobile viewport and dismisses on manual navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDemo(page);
  await page.locator('[data-tour="role-manager"]').click();
  await page.getByRole('button', { name: 'Bericht erkunden' }).click();
  await geometry(page, '.charts-grid .chart-scroll');
  await page.getByRole('button', { name: 'Filter zeigen' }).click();
  await geometry(page, '.period-filter');
  await page.screenshot({ path: 'reviews/screenshots/tour-report-mobile.png' });
  await page.locator('[data-tour="role-agent"]').click();
  await expect(page.getByTestId('tour-layer')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ihr Arbeitsplatz' })).toBeVisible();
});

test('real role changes pause call automation; reduced motion and Escape retain usable controls', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await page.locator('[data-tour="role-manager"]').click();
  await expect(page.getByRole('button', { name: 'Fortsetzen', exact: true })).toBeVisible();
  await expect(page.getByTestId('evaluation-dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tour-layer')).toHaveCount(0);
  await expect(page.getByTestId('dashboard')).toBeVisible();
  await expect(page.getByTestId('total-count')).toHaveText('12');
  await page.getByRole('button', { name: 'Bericht erkunden' }).click();
  await page.getByRole('button', { name: 'Tour überspringen', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('tour-layer')).toHaveCount(0);
});
