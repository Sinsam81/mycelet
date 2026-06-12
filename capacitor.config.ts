import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config — wraps the Mycelet web app as a native iOS/Android shell.
 *
 * Hosted approach: the app uses Next.js SSR + API routes, so it can't be a
 * static bundle. The native shell loads `server.url` (the deployed web app).
 * `webDir` holds the offline fallback page (capacitor-www/index.html);
 * `server.errorPath` redirects there when the remote app can't load (no
 * coverage in the forest, server down).
 *
 * TODO before App Store submission:
 *  - Add native plugins (camera, geolocation, push) so the app has real native
 *    value (App Store guideline 4.2) and isn't rejected as "just a website".
 *  - Confirm appId — this becomes the permanent iOS bundle identifier.
 */
const config: CapacitorConfig = {
  appId: 'no.mycelet.app',
  appName: 'Mycelet',
  webDir: 'capacitor-www',
  server: {
    url: 'https://www.mycelet.com',
    errorPath: 'index.html',
    cleartext: false
  },
  ios: {
    // Service workers (the offline tile cache) only run in WKWebView when the
    // domain is app-bound: WKAppBoundDomains in Info.plist + this flag.
    // NB: external links must open via the system browser (Capacitor default),
    // since in-webview navigation is then limited to the bound domains.
    limitsNavigationsToAppBoundDomains: true
  }
};

export default config;
