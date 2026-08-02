import { describe, expect, it } from 'vitest';
import { PROTECTED_PATHS, isProtectedPath } from '../middleware';

/**
 * Fasit for hvilke sider en utlogget besøkende ikke skal se.
 *
 * /forum/moderation og /forum/reports manglet i lista og svarte 200 utlogget —
 * moderasjonskonsollen med «Marker som løst / Avvis» og en lenke inn i
 * admin-området lå åpen for hvem som helst.
 */
describe('gating av ruter i middleware', () => {
  it('krever innlogging på moderasjon og egne rapporter', () => {
    expect(isProtectedPath('/forum/moderation')).toBe(true);
    expect(isProtectedPath('/forum/reports')).toBe(true);
  });

  it('holder på de rutene som allerede var beskyttet', () => {
    for (const path of ['/profile', '/forum/new', '/map', '/admin', '/mine-steder']) {
      expect(isProtectedPath(path), path).toBe(true);
    }
    // Undersider arves — /admin dekker hele admin-området.
    expect(isProtectedPath('/admin/forum-trust')).toBe(true);
    expect(isProtectedPath('/admin/audit-log')).toBe(true);
  });

  it('lar det offentlige forumet være offentlig', () => {
    expect(isProtectedPath('/forum')).toBe(false);
    expect(isProtectedPath('/forum/3f1b0c2e-1111-2222-3333-444455556666')).toBe(false);
  });

  it('stenger ikke sider som bare begynner likt', () => {
    // Prefiksmatchen må gå på segment, ikke på tegn: en fremtidig /mapporten
    // eller /profilering skal ikke bli utilgjengelig ved et uhell.
    expect(isProtectedPath('/mapporten')).toBe(false);
    expect(isProtectedPath('/profilering')).toBe(false);
    expect(isProtectedPath('/species')).toBe(false);
    expect(isProtectedPath('/pricing')).toBe(false);
    expect(isProtectedPath('/')).toBe(false);
  });

  it('lista har ingen dubletter', () => {
    expect(new Set(PROTECTED_PATHS).size).toBe(PROTECTED_PATHS.length);
  });
});
