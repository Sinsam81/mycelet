import { test, expect } from './_setup/fixtures';
import type { Page } from '@playwright/test';
import { hasQaCreds } from './_setup/auth';

// Innlogget gjennomgang av de gated kjerneflytene. KUN lesing (ingen skriving til
// prod-databasen) — vi laster sidene og sjekker at de rendrer uten å redirecte til
// innlogging og uten ukjente JS-krasj. Skrive-flyt (poste/lagre funn) er manuelle.

test.beforeEach(async () => {
  test.skip(!hasQaCreds(), 'QA-testbruker ikke satt opp — kjør `npm run qa:setup`.');
});

/** Samler uventede JS-krasj (uncaught exceptions) på siden. */
function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function expectAuthed(page: Page, path: string) {
  await page.goto(path);
  // Innlogget skal IKKE bli sendt til /auth/login.
  await expect(page, `${path} redirectet til innlogging (sesjon virket ikke)`).not.toHaveURL(/\/auth\/login/);
}

test('profil-siden laster innlogget', async ({ page }) => {
  const errors = trackPageErrors(page);
  await expectAuthed(page, '/profile');
  await expect(page.getByRole('heading').first()).toBeVisible();
  expect(errors, `JS-krasj på /profile: ${errors.join(' | ')}`).toEqual([]);
});

test('Mine steder laster innlogget', async ({ page }) => {
  const errors = trackPageErrors(page);
  await expectAuthed(page, '/mine-steder');
  await expect(page.getByRole('heading').first()).toBeVisible();
  expect(errors, `JS-krasj på /mine-steder: ${errors.join(' | ')}`).toEqual([]);
});

test('AI-soppkjenner laster med sikkerhetsadvarsel', async ({ page }) => {
  const errors = trackPageErrors(page);
  await expectAuthed(page, '/identify');
  await expect(page.getByRole('heading').first()).toBeVisible();
  // Sikkerhetskritisk: en advarsel om å aldri spise basert på AI alene skal alltid vises.
  await expect(page.getByText(/aldri|soppkontroll|giftinformasjonen/i).first()).toBeVisible();
  expect(errors, `JS-krasj på /identify: ${errors.join(' | ')}`).toEqual([]);
});

test('kalenderen laster innlogget uten krasj', async ({ page }) => {
  const errors = trackPageErrors(page);
  await expectAuthed(page, '/calendar');
  await expect(page.getByText(/sesong/i).first()).toBeVisible();
  expect(errors, `JS-krasj på /calendar: ${errors.join(' | ')}`).toEqual([]);
});

test('forum-feeden laster uten 500 (RLS-regresjon)', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto('/forum');
  await expect(page.getByRole('heading').first()).toBeVisible();
  expect(errors, `JS-krasj på /forum: ${errors.join(' | ')}`).toEqual([]);
});

test('en forumtråd kan åpnes (Next 16 params-regresjon)', async ({ page }) => {
  await page.goto('/forum');
  const firstPost = page.locator('a[href^="/forum/"]').filter({ hasNot: page.locator('[href="/forum/new"]') }).first();
  const count = await firstPost.count();
  test.skip(count === 0, 'Ingen forumtråder å åpne (tom feed).');
  await firstPost.click();
  await expect(page).toHaveURL(/\/forum\/.+/);
  // Tråden skal faktisk vise innhold (ikke evig «laster» pga undefined postId).
  await expect(page.getByRole('heading').first()).toBeVisible();
});

test('nytt foruminnlegg-skjema laster innlogget', async ({ page }) => {
  const errors = trackPageErrors(page);
  await expectAuthed(page, '/forum/new');
  await expect(page.locator('input, textarea').first()).toBeVisible();
  expect(errors, `JS-krasj på /forum/new: ${errors.join(' | ')}`).toEqual([]);
});
