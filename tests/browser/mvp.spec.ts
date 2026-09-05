import { test, expect, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const seed = JSON.parse(readFileSync(new URL('../../demo/seed.json', import.meta.url), 'utf8'));

const modal = (page: Page) => page.getByTestId('evaluation-dialog');
async function baseline(page: Page, portable = false) {
  await page.goto(portable ? pathToFileURL(resolve('demo/dist/index.html')).href : '/');
  await expect(page.getByRole('heading', { name: 'Ihr Arbeitsplatz' })).toBeVisible();
  if (!portable) {
    await page.getByRole('button', { name: 'Demo zurücksetzen', exact: true }).click();
  }
  await expect(page.getByTestId('open-DEMO-011')).toBeVisible();
}
async function dwc(page: Page) {
  await modal(page).locator('[data-tour="reason-dwc_problem"]').click();
  await expect(modal(page).locator('[data-tour="submit"]')).toBeDisabled();
  await modal(page).locator('[data-tour="device"]').selectOption('tuma_classic_comfort');
  await modal(page).locator('[data-tour="fault"]').selectOption('descaling_filter');
  await modal(page).locator('[data-tour="resolution"]').selectOption('service_requested');
  await expect(modal(page).locator('[data-tour="submit"]')).toBeEnabled();
}
async function dashboard(page: Page) {
  await page.locator('[data-tour="role-manager"]').click();
  await expect(page.getByTestId('dashboard')).toBeVisible();
}

test('local first load, DWC validation, committed summary, report and snapshot export', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await baseline(page);
  await page.screenshot({ path: 'reviews/screenshots/agent-desktop.png', fullPage: true });
  await page.getByTestId('open-DEMO-011').click();
  await dwc(page);
  await page.screenshot({ path: 'reviews/screenshots/dwc-dialog.png', fullPage: true });
  await modal(page).locator('[data-tour="submit"]').click();
  await expect(modal(page).getByRole('heading', { name: 'Auswertung gespeichert!' })).toBeVisible();
  await expect(modal(page).getByText('Service angefordert', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'reviews/screenshots/confirmed-summary.png', fullPage: true });
  await modal(page).locator('[data-tour="close-summary"]').click();
  await dashboard(page);
  await expect(page.getByTestId('total-count')).toHaveText('12');
  await expect(page.getByTestId('count-dwc_problem')).toHaveText('3');
  await expect(page.getByText('11 von 12 Anrufen ausgewertet')).toBeVisible();
  await page.screenshot({ path: 'reviews/screenshots/dashboard-desktop.png', fullPage: true });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV exportieren', exact: true }).click();
  const artifact = await download;
  expect(artifact.suggestedFilename()).toContain('DWC_2026-09-01');
  expect(errors).toEqual([]);
});

test('portable file has no external requests; manual correction and reset use real records', async ({
  page,
}) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) external.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await baseline(page, true);
  await page.getByTestId('open-DEMO-011').click();
  await modal(page).locator('[data-tour="reason-invoice"]').click();
  await modal(page).locator('[data-tour="submit"]').click();
  await expect(modal(page).getByRole('heading', { name: 'Auswertung gespeichert!' })).toBeVisible();
  await modal(page).locator('[data-tour="close-summary"]').click();
  await dashboard(page);
  await expect(page.getByTestId('count-invoice')).toHaveText('4');
  await page.getByRole('button', { name: 'Demo zurücksetzen', exact: true }).click();
  await expect(page.getByTestId('open-DEMO-011')).toBeVisible();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('guided tour completes through actual handlers and replay is deterministic', async ({
  page,
}) => {
  await baseline(page, true);
  await page.getByRole('button', { name: 'Tour starten', exact: true }).click();
  await expect(page.getByText('Tour abgeschlossen', { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByTestId('count-dwc_problem')).toHaveText('3');
  await expect(page.getByText('11 von 12 Anrufen ausgewertet')).toBeVisible();
  await page.getByRole('button', { name: 'Demo zurücksetzen', exact: true }).click();
  await dashboard(page);
  await expect(page.getByTestId('count-dwc_problem')).toHaveText('2');
});

test('tour pauses for a manual reason and resumes after manual save without duplicate submission', async ({
  page,
}) => {
  await baseline(page, true);
  await page.getByRole('button', { name: 'Tour starten', exact: true }).click();
  await expect(modal(page)).toBeVisible();
  await modal(page).getByRole('button', { name: 'Tour pausieren' }).click();
  await modal(page).locator('[data-tour="reason-invoice"]').click();
  await modal(page).locator('[data-tour="submit"]').click();
  await expect(modal(page).getByRole('heading', { name: 'Auswertung gespeichert!' })).toBeVisible();
  await modal(page).getByRole('button', { name: 'Fortsetzen', exact: true }).click();
  await expect(page.getByText('Tour abgeschlossen', { exact: true })).toBeVisible({
    timeout: 22000,
  });
  await expect(page.getByTestId('count-invoice')).toHaveText('4');
  await expect(page.getByTestId('count-dwc_problem')).toHaveText('2');
});

for (const fault of ['before', 'after'])
  test(`submit ${fault} failure retains inputs and retry makes one revision`, async ({ page }) => {
    await baseline(page);
    await page.getByRole('button', { name: 'Demo & Daten', exact: true }).click();
    await page.getByLabel('Nächste Speicherung').selectOption(fault);
    await page.getByRole('button', { name: /Arbeitsplatz/ }).click();
    await page.getByTestId('open-DEMO-011').click();
    await dwc(page);
    await modal(page).locator('[data-tour="submit"]').click();
    await expect(modal(page).getByRole('alert')).toBeVisible();
    await expect(modal(page).getByRole('heading', { name: 'Auswertung gespeichert!' })).toHaveCount(
      0,
    );
    await expect(
      modal(page).getByRole('button', { name: 'Aktuellen Stand prüfen, Eingaben behalten' }),
    ).toHaveCount(0);
    await modal(page).locator('[data-tour="submit"]').click();
    await expect(
      modal(page).getByRole('heading', { name: 'Auswertung gespeichert!' }),
    ).toBeVisible();
    const call = await page.evaluate(
      async (id) => (await fetch(`/api/calls/${id}`)).json(),
      seed.guidedCallId,
    );
    expect(call.evaluation.revision).toBe(1);
    expect(call.history).toHaveLength(1);
  });

test('acknowledged partial draft survives real browser reload and reports stay unchanged', async ({
  page,
}) => {
  await baseline(page);
  await page.getByTestId('open-DEMO-011').click();
  await modal(page).locator('[data-tour="reason-dwc_problem"]').click();
  await modal(page).locator('[data-tour="device"]').selectOption('unknown');
  await expect(modal(page).getByText('Entwurf gespeichert', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByTestId('open-DEMO-011').click();
  await expect(modal(page).locator('[data-tour="device"]')).toHaveValue('unknown');
  await expect(modal(page).locator('[data-tour="submit"]')).toBeDisabled();
  await modal(page).getByRole('button', { name: 'Später', exact: true }).click();
  await dashboard(page);
  await expect(page.getByTestId('count-dwc_problem')).toHaveText('2');
});

test('empty dates, narrow layout and keyboard dialog close remain usable', async ({ page }) => {
  await baseline(page, true);
  await dashboard(page);
  await page.getByLabel('Von', { exact: true }).fill('2025-01-01');
  await page.getByLabel('Bis', { exact: true }).fill('2025-01-02');
  await page.getByRole('button', { name: 'Anwenden', exact: true }).click();
  await expect(page.getByTestId('total-count')).toHaveText('0');
  await expect(page.getByTestId('count-dwc_problem')).toHaveText('0');
  await page.getByRole('button', { name: 'Demo-Zeitraum', exact: true }).click();
  await expect(page.getByTestId('total-count')).toHaveText('12');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'reviews/screenshots/dashboard-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.locator('[data-tour="role-agent"]').click();
  await page.getByTestId('open-DEMO-011').click();
  await page.keyboard.press('Escape');
  await expect(modal(page)).toHaveCount(0);
});

test('queued drafts stay visibly unconfirmed until the final response and recover after failure', async ({
  page,
}) => {
  await baseline(page);
  await page.getByTestId('open-DEMO-011').click();
  const held: import('@playwright/test').Route[] = [];
  await page.route('**/api/calls/*/draft', (route) => {
    held.push(route);
  });
  await modal(page).locator('[data-tour="reason-dwc_problem"]').click();
  await expect.poll(() => held.length).toBe(1);
  await modal(page).locator('[data-tour="device"]').selectOption('unknown');
  await held[0].continue();
  await expect.poll(() => held.length).toBe(2);
  await expect(modal(page).getByText('Entwurf wird gespeichert …', { exact: true })).toBeVisible();
  await expect(modal(page).getByRole('button', { name: 'Später', exact: true })).toBeDisabled();
  await held[1].abort('failed');
  await expect(modal(page).getByText('Entwurf nicht bestätigt', { exact: true })).toBeVisible();
  await page.unroute('**/api/calls/*/draft');
  await modal(page).getByRole('button', { name: 'Entwurf erneut übertragen' }).click();
  await expect(modal(page).getByText('Entwurf gespeichert', { exact: true })).toBeVisible();
  const call = await page.evaluate(
    async (id) => (await fetch(`/api/calls/${id}`)).json(),
    seed.guidedCallId,
  );
  expect(call.draft.value.device).toBe('unknown');
  expect(call.evaluation).toBeNull();
});

test('late open-call response cannot reopen a dialog after reset', async ({ page }) => {
  await baseline(page);
  let release: (() => void) | undefined;
  let arrived = false;
  let released = false;
  await page.route(`**/api/calls/${seed.guidedCallId}`, async (route) => {
    const response = await route.fetch();
    arrived = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({ response });
    released = true;
  });
  await page.getByTestId('open-DEMO-011').click();
  await expect.poll(() => arrived).toBe(true);
  await page.getByRole('button', { name: 'Demo zurücksetzen', exact: true }).click();
  await expect(page.getByTestId('open-DEMO-011')).toBeVisible();
  release!();
  await expect.poll(() => released).toBe(true);
  await expect(modal(page)).toHaveCount(0);
});

test('portable HTTP artifact has no API or external resource dependency and skip preserves draft', async ({
  page,
}) => {
  const unexpected: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4320' || url.pathname.startsWith('/api/'))
      unexpected.push(request.url());
  });
  await page.goto('/demo.html');
  await page.getByRole('button', { name: 'Tour starten', exact: true }).click();
  await expect(modal(page)).toBeVisible();
  await modal(page).getByRole('button', { name: 'Tour pausieren' }).click();
  await modal(page).locator('[data-tour="reason-invoice"]').click();
  await modal(page).getByRole('button', { name: 'Tour überspringen' }).click();
  await expect(modal(page).locator('[data-tour="reason-invoice"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(modal(page)).toHaveAttribute('data-saved', 'false');
  await modal(page).getByRole('button', { name: 'Später', exact: true }).click();
  await page.getByTestId('open-DEMO-011').click();
  await expect(modal(page).locator('[data-tour="reason-invoice"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(unexpected).toEqual([]);
});

test('resuming after an earlier DWC choice is cleared pauses with guidance instead of stalling', async ({
  page,
}) => {
  await baseline(page, true);
  await page.getByRole('button', { name: 'Tour starten', exact: true }).click();
  await expect(modal(page).locator('[data-tour="device"]')).toHaveValue('tuma_classic_comfort', {
    timeout: 10000,
  });
  await modal(page).getByRole('button', { name: 'Tour pausieren' }).click();
  await modal(page).locator('[data-tour="reason-invoice"]').click();
  await modal(page).locator('[data-tour="reason-dwc_problem"]').click();
  await modal(page).getByRole('button', { name: 'Fortsetzen', exact: true }).click();
  await expect(modal(page).getByText(/Eine frühere DWC-Angabe wurde geändert/)).toBeVisible();
  await expect(modal(page).locator('[data-tour="device"]')).toHaveValue('');
  await modal(page).locator('[data-tour="device"]').selectOption('unknown');
  await modal(page).locator('[data-tour="fault"]').selectOption('unknown');
  await modal(page).locator('[data-tour="resolution"]').selectOption('unknown');
  await modal(page).getByRole('button', { name: 'Fortsetzen', exact: true }).click();
  await expect(page.getByText('Tour abgeschlossen', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByTestId('count-dwc_problem')).toHaveText('3');
});

for (const phase of ['before', 'after'])
  test(`draft ${phase} failure followed by another writer requires explicit review before rebasing`, async ({
    page,
  }) => {
    await baseline(page);
    await page.getByTestId('open-DEMO-011').click();
    await page.route(
      '**/api/calls/*/draft',
      async (route) => {
        if (phase === 'after') await route.fetch();
        await route.abort('failed');
      },
      { times: 1 },
    );
    await modal(page).locator('[data-tour="reason-order"]').click();
    await expect(modal(page).getByText('Entwurf nicht bestätigt', { exact: true })).toBeVisible();
    await page.evaluate(async (id) => {
      const call = await (await fetch(`/api/calls/${id}`)).json();
      const result = await fetch(`/api/calls/${id}/draft`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-DWC-Local': '1',
          'If-Match': `"${call.recordVersion}"`,
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          catalogVersion: 1,
          reason: 'invoice',
          device: null,
          fault: null,
          resolution: null,
        }),
      });
      if (!result.ok) throw new Error('Concurrent fixture draft failed');
    }, seed.guidedCallId);
    await modal(page).getByRole('button', { name: 'Entwurf erneut übertragen' }).click();
    await expect(modal(page).getByText('Neuerer Stand vorhanden', { exact: true })).toBeVisible();
    await expect(modal(page).getByText(/Zuletzt gelesener Stand: Rechnung/)).toBeVisible();
    await expect(modal(page).locator('[data-tour="submit"]')).toBeDisabled();
    const call = await page.evaluate(
      async (id) => (await fetch(`/api/calls/${id}`)).json(),
      seed.guidedCallId,
    );
    expect(call.draft.value.reason).toBe('invoice');
    expect(call.evaluation).toBeNull();
    await modal(page)
      .getByRole('button', { name: 'Aktuellen Stand prüfen, Eingaben behalten' })
      .click();
    await expect(modal(page).locator('[data-tour="submit"]')).toBeEnabled();
  });
