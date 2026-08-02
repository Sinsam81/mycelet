import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { YearTable } from '../YearTable';
import type { CalendarSpecies } from '../SeasonNow';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * «Hele året»-tabellen i kalenderen listet artene med sesongvinduer, men UTEN
 * spiselighetsmerke — og med samme grønne rute på hvit fluesopp som på
 * kantarell. Overskriften handlet om når artene «kan plukkes». For en leser
 * var hele tabellen dermed en plukkeliste med seks dødelige arter i.
 *
 * Testene under holder på tre ting:
 *  1. hver rad bærer et spiselighetsmerke i TEKST (ikke bare farge),
 *  2. giftige og dødelige arter får aldri den grønne «klar til å plukkes»-fargen,
 *  3. artsnavnet følger leserens språk (svenske navn fra databasen).
 */

const kantarell: CalendarSpecies = {
  id: 1,
  norwegian_name: 'Kantarell',
  swedish_name: 'Kantarell',
  latin_name: 'Cantharellus cibarius',
  edibility: 'edible',
  season_start: 7,
  season_end: 10,
  peak_season_start: 8,
  peak_season_end: 9,
  primary_image_url: null
};

const hvitFluesopp: CalendarSpecies = {
  id: 2,
  norwegian_name: 'Hvit fluesopp',
  swedish_name: 'Vit flugsvamp',
  latin_name: 'Amanita virosa',
  edibility: 'deadly',
  season_start: 7,
  season_end: 10,
  peak_season_start: 8,
  peak_season_end: 9,
  primary_image_url: null
};

const rodFlueSopp: CalendarSpecies = {
  id: 3,
  norwegian_name: 'Rød fluesopp',
  swedish_name: 'Röd flugsvamp',
  latin_name: 'Amanita muscaria',
  edibility: 'toxic',
  season_start: 8,
  season_end: 10,
  peak_season_start: null,
  peak_season_end: null,
  primary_image_url: null
};

function render(species: CalendarSpecies[], locale: 'nb' | 'sv' = 'nb') {
  return renderToString(
    <NextIntlClientProvider locale={locale} messages={locale === 'sv' ? sv : nb}>
      <YearTable species={species} locale={locale} currentMonth={8} />
    </NextIntlClientProvider>
  );
}

// Grønt = «klar til å plukkes». Disse to klassene er de eneste som gir grønn
// rute i tabellen, så fravær av dem er hele poenget for de farlige artene.
const GREEN_MARKERS = ['bg-forest-700', 'bg-forest-300'];

// Tegnforklaringen viser nødvendigvis ALLE fargene, også de grønne. Ruteprøvene
// må derfor se på selve radene, ikke på hele artikkelen.
function rows(html: string) {
  const start = html.indexOf('<tbody>');
  const end = html.indexOf('</tbody>');
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, end);
}

describe('spiselighetsmerke på hver rad', () => {
  it('dødelig art er merket dødelig i tekst', () => {
    expect(render([hvitFluesopp])).toContain(nb.EdibilityBadge.deadly);
  });

  it('giftig art er merket giftig i tekst', () => {
    expect(render([rodFlueSopp])).toContain(nb.EdibilityBadge.toxic);
  });

  it('spiselig art er merket spiselig i tekst', () => {
    expect(render([kantarell])).toContain(nb.EdibilityBadge.edible);
  });

  it('alle radene får merke, ikke bare den første', () => {
    const html = render([kantarell, hvitFluesopp, rodFlueSopp]);
    expect(html).toContain(nb.EdibilityBadge.edible);
    expect(html).toContain(nb.EdibilityBadge.deadly);
    expect(html).toContain(nb.EdibilityBadge.toxic);
  });
});

describe('farlige arter får aldri den grønne «kan plukkes»-fargen', () => {
  it('dødelig art har ingen grønne sesongruter', () => {
    const html = rows(render([hvitFluesopp]));
    for (const green of GREEN_MARKERS) {
      expect(html).not.toContain(green);
    }
  });

  it('dødelig art får røde sesongruter i stedet — den er fortsatt med i kalenderen', () => {
    const html = rows(render([hvitFluesopp]));
    // Toppsesong (aug–sep) og øvrig sesong (jul, okt) skal begge vises, i rødt.
    expect(html).toContain('bg-red-800');
    expect(html).toContain('bg-red-300');
  });

  it('giftig art har ingen grønne sesongruter', () => {
    const html = rows(render([rodFlueSopp]));
    for (const green of GREEN_MARKERS) {
      expect(html).not.toContain(green);
    }
  });

  it('spiselig art beholder grønt', () => {
    const html = rows(render([kantarell]));
    expect(html).toContain('bg-forest-700');
    expect(html).toContain('bg-forest-300');
  });

  it('en grønn og en dødelig art i samme tabell blandes ikke sammen', () => {
    // Radene står side om side i den ekte tabellen. Fargene må følge arten,
    // ikke tabellen.
    const html = rows(render([kantarell, hvitFluesopp]));
    const kantarellRad = html.slice(html.indexOf('/species/1'), html.indexOf('/species/2'));
    const fluesoppRad = html.slice(html.indexOf('/species/2'));
    expect(kantarellRad).toContain('bg-forest-700');
    expect(kantarellRad).not.toContain('bg-red-800');
    expect(fluesoppRad).toContain('bg-red-800');
    for (const green of GREEN_MARKERS) {
      expect(fluesoppRad).not.toContain(green);
    }
  });

  it('forklaringen på rødt står i tegnforklaringen', () => {
    expect(render([hvitFluesopp])).toContain(nb.Calendar.legendDangerous);
    expect(render([hvitFluesopp], 'sv')).toContain(sv.Calendar.legendDangerous);
  });
});

describe('overskriften lover ikke at tabellen er en plukkeliste', () => {
  it('norsk ingress sier ikke «kan plukkes», men nevner de giftige', () => {
    expect(nb.Calendar.wholeYearSubtitle).not.toMatch(/kan plukkes/i);
    expect(nb.Calendar.wholeYearSubtitle).toMatch(/giftige/i);
  });

  it('svensk ingress sier ikke «kan plockas», men nevner de giftiga', () => {
    expect(sv.Calendar.wholeYearSubtitle).not.toMatch(/kan plockas/i);
    expect(sv.Calendar.wholeYearSubtitle).toMatch(/giftiga/i);
  });
});

describe('artsnavn følger leserens språk', () => {
  it('svensk leser får det svenske navnet fra databasen', () => {
    const html = render([hvitFluesopp], 'sv');
    expect(html).toContain('Vit flugsvamp');
    expect(html).not.toContain('Hvit fluesopp');
  });

  it('svensk leser får merket på svensk', () => {
    expect(render([hvitFluesopp], 'sv')).toContain(sv.EdibilityBadge.deadly);
  });

  it('faller tilbake på norsk navn når svensk mangler', () => {
    const utenSvensk = { ...hvitFluesopp, swedish_name: null };
    expect(render([utenSvensk], 'sv')).toContain('Hvit fluesopp');
  });
});
