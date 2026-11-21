import { expect, test, type Page } from '@playwright/test';

/**
 * Runs against the compose stack with demo data and the runner container. The seeded DEMO-103 exam
 * has a roster (student@examguard.local) and three coding questions so the sandbox is exercised
 * end to end: submit -> auto-judge -> lecturer sees per-test results.
 */

async function signInStudent(page: Page) {
  await page.goto('/student');
  await page.getByLabel('Email').fill('student@examguard.local');
  await page.getByLabel('Password').fill('Student123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome, Demo Student/ })).toBeVisible();
}

test('student submits a coding answer and the judge marks every test', async ({ page }) => {
  const candidateCode = `E2E${Date.now().toString().slice(-8)}`;

  await signInStudent(page);
  const joinCard = page.locator('form').filter({ has: page.getByLabel('Exam code') });
  await joinCard.getByLabel('Exam code').fill('DEMO-103');
  await joinCard.getByLabel('Candidate code').fill(candidateCode);
  await joinCard.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Coding \(DSA\)/ })).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole('button', { name: 'Begin exam' }).click();

  await expect(page.getByText('Question 1 of 3')).toBeVisible();
  await page
    .getByLabel('Your solution for question 1')
    .fill('a, b = map(int, input().split())\nprint(a + b)');
  await expect(page.getByText('Saved', { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Submit exam' }).click();
  await page.getByRole('button', { name: 'Submit now' }).click();
  await expect(page.getByRole('heading', { name: 'Submission received' })).toBeVisible({
    timeout: 60_000,
  });

  const staffPage = await page.context().newPage();
  await staffPage.goto('/login');
  await staffPage.getByLabel('Email').fill('lecturer@examguard.local');
  await staffPage.getByLabel('Password').fill('Lecturer123!');
  await staffPage.getByRole('button', { name: 'Sign in' }).click();
  await expect(staffPage.getByRole('heading', { name: 'Exams' })).toBeVisible();

  await staffPage.getByRole('link', { name: 'DEMO-103' }).click();
  await staffPage.getByRole('tab', { name: 'Grading' }).click();
  await expect(staffPage.getByText(candidateCode).first()).toBeVisible();
  await staffPage.getByText(candidateCode).first().click();

  await expect(staffPage.getByText('3 of 3 passed')).toBeVisible({ timeout: 30_000 });
  await staffPage.close();
});
