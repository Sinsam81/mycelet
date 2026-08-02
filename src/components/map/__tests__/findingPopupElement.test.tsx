import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { findingPopupElement } from '../findingPopupElement';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * KALLSTEDET, IKKE BARE KOMPONENTEN.
 *
 * FindingPopup.test.tsx fastholder at komponenten KASTER uten provider. Det er
 * halve garantien: den andre halvdelen — at kartet faktisk wrapper den — lå
 * inline i MushroomMap.tsx, som ingen test laster (Leaflet + DOM). Fjernet noen
 * wrappingen der, ble hverken `npm run test` eller Playwright rød, selv om
 * nøyaktig den slettingen ga alle brukere en tom hvit boks i fem uker.
 *
 * Byggingen bor nå i findingPopupElement, og testene under rendrer det treet.
 * Tas provideren ut derfra, kaster renderToString og disse blir røde.
 */

const finding = {
  id: 'test-1',
  user_id: 'bruker-1',
  username: 'sopper',
  species_id: 1,
  norwegian_name: 'Kantarell',
  latin_name: 'Cantharellus cibarius',
  edibility: 'edible',
  display_lat: 59.9,
  display_lng: 10.7,
  thumbnail_url: null,
  verification_status: 'unverified',
  found_at: '2026-08-15T10:00:00Z',
  quantity: null,
  notes: null,
  is_zone_finding: false,
  zone_label: null,
  zone_precision_km: null
} as never;

describe('findingPopupElement', () => {
  it('gir en popup med innhold — ikke en tom boks', () => {
    const html = renderToString(
      findingPopupElement({ finding, locale: 'nb', messages: nb as unknown as Record<string, unknown> })
    );
    expect(html).toContain('Kantarell');
    expect(html).toContain('Cantharellus cibarius');
    expect(html.length).toBeGreaterThan(100);
  });

  it('virker for svenske lesere også — det var her feilen kom inn', () => {
    const html = renderToString(
      findingPopupElement({
        finding,
        displayName: 'Kantarell',
        locale: 'sv',
        messages: sv as unknown as Record<string, unknown>
      })
    );
    expect(html).toContain('Kantarell');
    expect(html.length).toBeGreaterThan(100);
  });

  it('bruker det lokaliserte artsnavnet kartet sender inn', () => {
    const html = renderToString(
      findingPopupElement({
        finding,
        displayName: 'Karljohan',
        locale: 'sv',
        messages: sv as unknown as Record<string, unknown>
      })
    );
    expect(html).toContain('Karljohan');
  });
});
