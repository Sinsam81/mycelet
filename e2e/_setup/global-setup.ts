import { request, type FullConfig } from '@playwright/test';

// Next dev compiles routes AND middleware lazily on first request. Without a
// warm-up, the first parallel hits race the compiler — protected routes can be
// served before the auth middleware exists (false "no redirect"), and first
// clicks time out. This pings every key route once so the suite tests warm code,
// not the compiler. Harmless against prod (just a few GETs).

const ROUTES = [
  '/',
  '/species',
  '/pricing',
  '/calendar',
  '/sikkerhet',
  '/datakilder',
  '/personvern',
  '/auth/login',
  '/auth/forgot',
  '/auth/register',
  '/profile', // protected → warms middleware
  '/map',
  '/mine-steder',
  '/forum',
  '/forum/new',
  '/admin',
  '/api/health?fast=1'
];

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) return;

  const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });

  // Wait for the server to answer at all (dev server may still be booting).
  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      const res = await ctx.get('/api/health?fast=1', { timeout: 10_000 });
      if (res.status() > 0) break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      console.warn('⚠ global-setup: serveren svarte ikke innen 90s — fortsetter likevel.');
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Warm each route (redirect: manual so protected routes don't follow to login).
  await Promise.all(
    ROUTES.map((path) =>
      ctx.get(path, { maxRedirects: 0, timeout: 30_000 }).catch(() => undefined)
    )
  );

  await ctx.dispose();
}
