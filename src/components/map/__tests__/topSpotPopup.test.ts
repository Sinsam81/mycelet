import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { buildTopSpotPopupHtml } from '../topSpotPopup';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Teksten er halve påstanden.
 *
 * «Topp 1» rangerer steder valideringen ikke klarer å skille, og «Fant du sopp
 * her?» spør om et punkt når vi bare vet noe om en rute på flere kilometer.
 * Testene bruker de EKTE meldingsfilene — det er de brukeren leser.
 */
function translator(locale: 'nb' | 'sv') {
  const messages = (locale === 'nb' ? nb : sv) as unknown as Record<string, unknown>;
  const t = createTranslator({ locale, messages, namespace: 'MushroomMap' });
  return t as unknown as (key: string, values?: Record<string, string | number>) => string;
}

const SPOT = { lat: 59.84, lng: 10.65, score: 62 };

function popup(locale: 'nb' | 'sv', overrides: Partial<Parameters<typeof buildTopSpotPopupHtml>[0]> = {}) {
  return buildTopSpotPopupHtml({
    spot: SPOT,
    distanceKm: 3.2,
    directionLabel: 'sør',
    radiusM: 714,
    t: translator(locale),
    ...overrides
  });
}

describe('buildTopSpotPopupHtml', () => {
  it('rangerer ikke områdene', () => {
    const html = popup('nb');
    expect(html).not.toContain('Topp 1');
    expect(html).not.toMatch(/Topp \d/);
    expect(html).toContain('Lovende område');
  });

  it('spør om området, ikke om punktet', () => {
    expect(popup('nb')).toContain('Fant du sopp i dette området?');
    expect(popup('sv')).toContain('Hittade du svamp i det här området?');
  });

  it('sier hva sirkelen er, med bredden fra rutenettet', () => {
    // 714 m radius ⇒ ~1,4 km bredt område.
    const html = popup('nb');
    expect(html).toContain('søkeområdet');
    // Komma, ikke punktum: resten av rapporten skriver «1,1 km» og «0,71»
    // gjennom Intl, og blandet tegnsetting i én tekst ser maskinskrevet ut.
    expect(html).toContain('1,4 km');
    expect(html, 'norsk tekst skal ikke ha engelsk desimaltegn').not.toContain('1.4 km');
    expect(html).toContain('flekkvis');
    expect(popup('sv')).toContain('sökområdet');
    expect(popup('sv')).toContain('fläckvis');
  });

  it('runder av brede områder til hele km', () => {
    expect(popup('nb', { radiusM: 5000 })).toContain('10 km');
  });

  it('navigerer til området — ikke «hit»', () => {
    expect(popup('nb')).toContain('naviger til området');
    expect(popup('nb')).not.toContain('naviger hit');
    expect(popup('sv')).toContain('navigera till området');
  });

  it('beholder verdikten fra modellen som overskrift når den finnes', () => {
    const html = popup('nb', { spot: { ...SPOT, verdict: 'Gode forhold i granskog' } });
    expect(html).toContain('Gode forhold i granskog');
    expect(html).not.toContain('Lovende område');
  });

  it('beholder tilbakemeldingssløyfa (data-attributtene kartet binder på)', () => {
    const html = popup('nb', { speciesId: 42 });
    expect(html).toContain('data-spot-feedback');
    expect(html).toContain(`data-lat="${SPOT.lat}"`);
    expect(html).toContain('data-species="42"');
    expect(html).toContain('data-fb="yes"');
    expect(html).toContain('data-fb="no"');
  });

  it('sier «i dette området» også i premium-oppfordringen', () => {
    expect(popup('nb', { limited: true })).toContain('dette området');
    expect(popup('sv', { limited: true })).toContain('det här området');
  });

  it('navngir arter som noe som står i området', () => {
    const html = popup('nb', { spot: { ...SPOT, topSpecies: ['Kantarell'] } });
    expect(html).toContain('dette området');
    expect(html).toContain('Kantarell');
  });
});
