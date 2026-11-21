import { expect, test, type Page } from '@playwright/test';
import { completePreflight, DEMO_PIN } from './support/preflight';

/**
 * Runs against the compose stack (demo data seeded): a student joins the typed demo exam,
 * answers, submits, and a lecturer grades the essay in the queue. The stack must expose the
 * frontend on PLAYWRIGHT_BASE_URL (default http://localhost:5173).
 */

/** Joins DEMO-102 as a fresh candidate. The first request after a cold start can be slow. */
async function joinDemoExam(page: Page, candidateCode: string) {
  await page.goto('/join');
  await page.getByLabel('Exam code').fill('DEMO-102');
  await page.getByLabel('Candidate code').fill(candidateCode);
  await page.getByLabel('Exam PIN').fill(DEMO_PIN);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByRole('heading', { name: /Demo Examination/ })).toBeVisible({
    timeout: 45_000,
  });
}

test('student submits the typed demo exam and the lecturer grades it', async ({ page }) => {
  const candidateCode = `E2E${Date.now().toString().slice(-8)}`;

  await joinDemoExam(page, candidateCode);
  await completePreflight(page);

  await expect(page.getByText('Question 1 of 5')).toBeVisible();
  await page.getByRole('radio', { name: 'B. TCP' }).check();
  await expect(page.getByText('Saved', { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Submit exam' }).click();
  await page.getByRole('button', { name: 'Submit now' }).click();
  await expect(page.getByRole('heading', { name: 'Submission received' })).toBeVisible();

  const staffPage = await page.context().newPage();
  await staffPage.goto('/login');
  await staffPage.getByLabel('Email').fill('lecturer@examguard.local');
  await staffPage.getByLabel('Password').fill('Lecturer123!');
  await staffPage.getByRole('button', { name: 'Sign in' }).click();
  await expect(staffPage.getByRole('heading', { name: 'Exams' })).toBeVisible();

  await staffPage.getByRole('link', { name: 'DEMO-102' }).click();
  await staffPage.getByRole('tab', { name: 'Grading' }).click();

  await expect(staffPage.getByText(candidateCode).first()).toBeVisible();
  await staffPage.getByText(candidateCode).first().click();

  await staffPage.getByLabel(/Score for question/).last().fill('7');
  await staffPage.getByRole('button', { name: 'Save score' }).last().click();
  await expect(staffPage.getByText('Score saved.').first()).toBeVisible();

  await staffPage.close();
});

test('focus losses raise strikes and the third one terminates the attempt', async ({ page }) => {
  const candidateCode = `E2E${Date.now().toString().slice(-8)}`;

  await joinDemoExam(page, candidateCode);
  await completePreflight(page);

  await page.getByRole('radio', { name: 'B. TCP' }).check();
  await expect(page.getByText('Saved', { exact: false }).first()).toBeVisible();

  for (let strike = 1; strike <= 2; strike += 1) {
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('heading', { name: 'Focus loss recorded' })).toBeVisible();
    await expect(page.getByText(`Strike ${strike} of 3`)).toBeVisible();
    await page.getByRole('button', { name: 'Resume exam' }).click();
    await expect(page.getByRole('heading', { name: 'Focus loss recorded' })).toBeHidden();
  }

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));

  await expect(page.getByRole('heading', { name: 'Attempt terminated' })).toBeVisible();
  await expect(page.getByText('Strikes 3 / 3')).toBeVisible();
  await expect(page.getByText('Preserved answers (read only)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit exam' })).toHaveCount(0);
});

test('the student account downloads the released PDF report', async ({ page }) => {
  await page.goto('/student');
  await page.getByLabel('Email').fill('student@examguard.local');
  await page.getByLabel('Password').fill('Student123!');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: /Welcome, Demo Student/ })).toBeVisible();
  await page.getByText('DEMO-102').first().click();

  await expect(page.getByRole('heading', { name: /Demo Examination/ })).toBeVisible();
  await expect(page.getByText('Results released')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^examguard-report-\d+\.pdf$/);
});
