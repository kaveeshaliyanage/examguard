import { expect, type Page } from '@playwright/test';

/** The PIN every seeded demo exam issues (see backend DemoAccess). */
export const DEMO_PIN = '246810';

/**
 * Walks the six pre-exam steps. The browser runs with fake media devices and a silent audio clip
 * (see playwright.config.ts), so mic/camera access succeed and the room reads as quiet.
 */
export async function completePreflight(page: Page) {
  await page.getByRole('button', { name: 'Start pre-exam checks' }).click();
  await expect(page.getByRole('heading', { name: 'Pre-exam checks' })).toBeVisible();

  await page.getByRole('button', { name: 'Enter full screen' }).click();
  await expect(page.getByText('Full screen active')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText(/Connection healthy/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByLabel(/My device is plugged in/).check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Allow microphone and test' }).click();
  await expect(page.getByText(/Microphone works/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Continue' }).click();

  // Desktop Chromium has no FaceDetector, so the wizard asks the student to attest instead.
  const attested = page.getByLabel(/The camera preview shows my face/);
  const detected = page.getByText('Face detected, looking at the screen');
  await expect(attested.or(detected)).toBeVisible({ timeout: 20_000 });
  if (await attested.count()) {
    await attested.check();
  }
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Start 3-second countdown' }).click();
  await expect(page.getByAltText('Your identity photo for this attempt')).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Confirm and start the timer' }).click();
}
