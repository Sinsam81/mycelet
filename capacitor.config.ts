import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config — wraps the Mycelet web app as a native iOS/Android shell.
 *
 * Hosted approach: the app uses Next.js SSR + API routes, so it can't be a
 * static bundle. The native shell loads `server.url` (the deployed web app).
 * `webDir` is just the offline fallback page (capacitor-www/index.html).
 *
 * TODO before App Store submission:
 *  - Point server.url at the custom domain (https://mycelet.no) once connected.
 *  - Add native plugins (camera, geolocation, push) so the app has real native
 *    value (App Store guideline 4.2) and isn't rejected as "just a website".
 *  - Confirm appId — this becomes the permanent iOS bundle identifier.
 */
const config: CapacitorConfig = {
  appId: 'no.mycelet.app',
  appName: 'Mycelet',
  webDir: 'capacitor-www',
  server: {
    url: 'https://mycelet.vercel.app',
    cleartext: false
  }
};

export default config;
