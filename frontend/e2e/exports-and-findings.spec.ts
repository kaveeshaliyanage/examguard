import { expect, test, type Page } from '@playwright/test';

/** Runs against the compose stack with demo data seeded (SEED_DEMO_DATA=true). */

async function signInStaff(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Exams' })).toBeVisible();
}

test('lecturer downloads the exam report as CSV and PDF', async ({ page }) => {
  await signInStaff(page, 'lecturer@examguard.local', 'Lecturer123!');
  await page.getByRole('link', { name: 'DEMO-102' }).click();
  await expect(page.getByRole('heading', { name: /Demo Examination/ })).toBeVisible();

  const csv = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: 'CSV spreadsheet' }).click();
  expect((await csv).suggestedFilename()).toMatch(/^DEMO-102-report\.csv$/);

  const pdf = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: 'PDF report' }).click();
  expect((await pdf).suggestedFilename()).toMatch(/^DEMO-102-report\.pdf$/);
});

test('admin reviews findings and downloads the overview PDF', async ({ page }) => {
  await signInStaff(page, 'admin@examguard.local', 'Admin123!');

  // Analysis is an explicit staff action, so the seeded attempts need one run before
  // the cross-exam queue has rows. The AI service does the work behind this call.
  const login = await page.request.post('/api/auth/login', {
    data: { email: 'admin@examguard.local', password: 'Admin123!' },
  });
  const { token } = (await login.json()) as { token: string };
  const headers = { Authorization: `Bearer ${token}` };
  const exams = (await (
    await page.request.get('/api/exams', { headers })
  ).json()) as Array<{ id: number; code: string }>;
  const demo = exams.find((exam) => exam.code === 'DEMO-101');
  expect(demo).toBeTruthy();
  await page.request.post(`/api/exams/${demo!.id}/analysis-runs`, { headers, timeout: 120_000 });

  await page.goto('/admin');
  const table = page.getByRole('table', { name: 'Review findings across exams' });
  await expect(table).toBeVisible({ timeout: 30_000 });

  const overview = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download overview PDF' }).click();
  expect((await overview).suggestedFilename()).toBe('examguard-overview.pdf');

  // The band filter narrows the same table; HIGH findings exist in the demo data.
  await page.getByRole('combobox', { name: /^Band/ }).click();
  await page.getByRole('option', { name: 'HIGH' }).click();
  const firstFinding = table.getByRole('row', { name: /DEMO-101/ }).first();
  await expect(firstFinding).toBeVisible();

  await firstFinding.click();
  await expect(page).toHaveURL(/\/findings\/\d+$/);
});
