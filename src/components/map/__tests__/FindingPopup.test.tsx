import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { FindingPopup } from '../FindingPopup';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Kartet rendrer denne komponenten i en LØSREVET React-rot: Leaflet eier
 * popup-elementet, så `createRoot()` lager et helt nytt tre ved siden av appens.
 * React-kontekst krysser ikke rot-grenser.
 *
 * Fra 26. juni til 1. august manglet NextIntlClientProvider rundt den roten.
 * FindingPopup kaster på sin første linje uten den, og React lot roten stå tom
 * — hvert klikk på en soppmarkør ga en tom hvit boks for ALLE brukere, ikke
 * bare svenske.
 *
 * Testene under fastholder begge halvdeler: at komponenten faktisk kaster uten
 * provider (så ingen «forenkler» bort wrappingen i MushroomMap), og at den
 * rendrer riktig med den.
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
  zone_precision_km: null,
  location_name: null,
  primary_image_url: null
} as never;

const render = (node: React.ReactElement, locale: 'nb' | 'sv' = 'nb') =>
  renderToString(
    <NextIntlClientProvider locale={locale} messages={locale === 'sv' ? sv : nb}>
      {node}
    </NextIntlClientProvider>
  );

describe('kravet om provider', () => {
  it('kaster uten NextIntlClientProvider — derfor MÅ MushroomMap wrappe popup-roten', () => {
    // Meldingsteksten er ikke låst her: den er tom i produksjonsbygg av
    // use-intl, og ordlyden i dev endrer seg mellom versjoner. Det som betyr
    // noe er at den kaster i det hele tatt.
    expect(() => renderToString(<FindingPopup finding={finding} />)).toThrow();
  });

  it('rendrer med provider', () => {
    expect(render(<FindingPopup finding={finding} />)).toContain('Kantarell');
  });
});

describe('innholdet brukeren faktisk skal se', () => {
  const html = render(<FindingPopup finding={finding} />);

  it('artsnavn', () => expect(html).toContain('Kantarell'));
  it('latinsk navn', () => expect(html).toContain('Cantharellus cibarius'));
  it('hvem som fant den', () => expect(html).toContain('sopper'));
  it('lenke videre', () => expect(html).toContain('/forum/new?findingId=test-1'));

  it('ingenting av dette kom med før fiksen', () => {
    // Sammenligningen som gjør de fire over meningsfulle: uten provider fantes
    // det ikke noe HTML i det hele tatt.
    let uten = '';
    try {
      uten = renderToString(<FindingPopup finding={finding} />);
    } catch {
      uten = '';
    }
    expect(uten).toBe('');
    expect(html.length).toBeGreaterThan(100);
  });
});

describe('artsnavnet følger leserens språk', () => {
  it('displayName vinner over det norske navnet fra viewet', () => {
    // public_findings gir alltid norwegian_name. Kartet sender inn det
    // lokaliserte navnet i stedet.
    const html = render(<FindingPopup finding={finding} displayName="Kantarell (sv)" />, 'sv');
    expect(html).toContain('Kantarell (sv)');
  });

  it('faller tilbake på det norske navnet når arten ikke er slått opp', () => {
    expect(render(<FindingPopup finding={finding} />)).toContain('Kantarell');
  });

  it('sier «ukjent art» når det ikke finnes noe navn', () => {
    const utenArt = { ...(finding as object), species_id: null, norwegian_name: null } as never;
    const html = render(<FindingPopup finding={utenArt} />);
    expect(html).toContain(nb.FindingPopup.unknownSpecies);
  });

  it('bruker samme navn i bildets alt-tekst', () => {
    const medBilde = { ...(finding as object), thumbnail_url: 'https://example.test/a.jpg' } as never;
    const html = render(<FindingPopup finding={medBilde} displayName="Karljohan" />, 'sv');
    expect(html).toContain('alt="Karljohan"');
  });
});

describe('artspåstanden er ikke en bestemmelse', () => {
  // Markørfargen settes av artskatalogens spiselighet (grønn = edible), og
  // kartintroen lærer brukeren nettopp det. Uten en tekst som sier at arten
  // bare er OPPGITT, leses en feilbestemt hvit fluesopp lagret som
  // sjampinjong som en grønn, godkjent matsopp for alle andre.
  it('merker ubekreftede funn som oppgitt art — på begge språk', () => {
    expect(render(<FindingPopup finding={finding} />)).toContain(nb.FindingPopup.unverifiedClaim);
    expect(render(<FindingPopup finding={finding} />, 'sv')).toContain(sv.FindingPopup.unverifiedClaim);
  });

  it('lar merket falle bort når funnet faktisk er verifisert', () => {
    const verifisert = { ...(finding as object), verification_status: 'verified' } as never;
    expect(render(<FindingPopup finding={verifisert} />)).not.toContain(nb.FindingPopup.unverifiedClaim);
  });

  it('merker også funn uten verification_status i det hele tatt', () => {
    const utenStatus = { ...(finding as object), verification_status: null } as never;
    expect(render(<FindingPopup finding={utenStatus} />)).toContain(nb.FindingPopup.unverifiedClaim);
  });
});

describe('sonefunn', () => {
  it('merkes som omtrentlig', () => {
    const sone = { ...(finding as object), is_zone_finding: true, zone_precision_km: 5 } as never;
    expect(render(<FindingPopup finding={sone} />)).toContain('5');
  });
});
