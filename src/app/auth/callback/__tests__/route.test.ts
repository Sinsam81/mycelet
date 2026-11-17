import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * /auth/callback UTEN kode. Hit kommer både en avbrutt Google-innlogging og
 * en bekreftelseslenke som er utløpt, brukt eller erstattet av en nyere (når
 * e-posten peker på Supabases egen /verify med denne ruten som mål). Den siste
 * landet stille på forsiden, utlogget og uten et ord.
 *
 * Bare grenene uten kode testes her — de returnerer før ruten rører kapsler
 * eller Supabase.
 */

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));
vi.mock('@/lib/auth/ensure-profile', () => ({ ensureProfile: async () => ({ error: null }) }));

import { GET } from '../route';

const kall = (sok: string) => GET(new NextRequest(`https://www.mycelet.com/auth/callback${sok}`));

function maal(res: Response): string {
  const til = new URL(res.headers.get('location') ?? '');
  expect(til.origin).toBe('https://www.mycelet.com');
  return `${til.pathname}${til.search}`;
}

describe('/auth/callback uten kode', () => {
  it('utløpt eller brukt bekreftelseslenke: innloggingen med beskjed, ikke forsiden', async () => {
    // Slik Supabase sender en PKCE-lenke videre når tokenet ikke lenger gjelder.
    const res = await kall('?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(maal(res)).toBe('/auth/login?linkExpired=1');
  });

  it('en avbrutt Google-innlogging er ikke en utløpt lenke — den går dit den var på vei', async () => {
    const res = await kall('?next=%2Fmap&error=access_denied&error_description=The+user+denied+access');
    expect(maal(res)).toBe('/map');
    const annen = await kall('?error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code');
    expect(maal(annen)).toBe('/');
  });

  it('uten noe i adressen: til forsiden, som før', async () => {
    expect(maal(await kall(''))).toBe('/');
  });

  it('et utrygt mål følges aldri, heller ikke uten kode', async () => {
    expect(maal(await kall('?next=https%3A%2F%2Fond.example%2F'))).toBe('/');
  });
});
