import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { timeZoneForLocale } from '@/i18n/config';
import { ARTSKATALOG } from '@/lib/species/__tests__/artskatalog-fixture';
import { compareSpeciesByDisplayName } from '@/lib/utils/species-name';
import { ORDBLOKK_KLASSER } from '@/components/species/Artsnavn';
import { SeasonNow, type CalendarSpecies } from '../SeasonNow';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * «I sesong nå» var én alfabetisk liste med like hvite kort: i november sto den
 * dødelige flatklokkehatten mellom falsk kantarell og frostvokssopp, bare skilt
 * ut av merket. Og fra september til februar sa siden ingenting om hva som
 * kommer.
 *
 * Testene rendrer komponenten mot hele den ekte katalogen og holder på:
 *  1. giftige og dødelige arter står i sin egen, røde blokk — aldri blant
 *     matsoppene, og aldri med «Topp-sesong»,
 *  2. «Neste ut» ser forbi vinteren, uten å love funn,
 *  3. måneden kommer fra siden (Oslo-tid), ikke fra klokka i nettleseren.
 *
 * Posisjonslaget er byttet ut: effekter kjører ikke i renderToString, men
 * modulene skal ikke dra Capacitor inn i en nodetest.
 */
vi.mock('@/lib/hooks/useGeolocation', () => ({
  getCurrentPositionIfGranted: async () => null,
  getCurrentPositionOnce: async () => {
    throw new Error('ingen posisjon i testen');
  },
  isGeolocationAvailable: () => false
}));
vi.mock('@/lib/map/husket-posisjon', () => ({
  lesHusketPosisjon: () => null,
  lagreHusketPosisjon: () => {}
}));

/** Slik siden sender lista inn: sortert på navnet leseren ser, og med bilde. */
function katalog(locale: 'nb' | 'sv'): CalendarSpecies[] {
  return [...ARTSKATALOG]
    .sort((a, b) => compareSpeciesByDisplayName(a, b, locale))
    .map((art) => ({ ...art, primary_image_url: `https://bilder.example.org/${art.id}.jpg` }));
}

function rendreRaa(month: number, locale: 'nb' | 'sv' = 'nb', species: CalendarSpecies[] = katalog(locale)) {
  return renderToString(
    <NextIntlClientProvider locale={locale} timeZone={timeZoneForLocale(locale)} messages={locale === 'sv' ? sv : nb}>
      <SeasonNow species={species} month={month} />
    </NextIntlClientProvider>
  );
}

/**
 * Artsnavnet står ord for ord i hver sin ordblokk (Artsnavn, så langt navn
 * bryter i stedet for å bli kuttet). Testene under leser navnet som tekst, så
 * blokkene skrelles av her; testen «navnet bryter» ser på dem direkte.
 */
const ORDBLOKK = new RegExp(`<span class="${ORDBLOKK_KLASSER}">([^<]*)</span>`, 'g');
function render(month: number, locale: 'nb' | 'sv' = 'nb', species: CalendarSpecies[] = katalog(locale)) {
  return rendreRaa(month, locale, species).replace(ORDBLOKK, '$1');
}

/** Siden er en rekke <article>-blokker; hver test ser på én av dem. */
function blokker(html: string): string[] {
  return html.split('<article').slice(1);
}
function blokkMed(html: string, tekst: string): string {
  const funnet = blokker(html).find((blokk) => blokk.includes(tekst));
  if (!funnet) throw new Error(`Ingen blokk inneholder «${tekst}»`);
  return funnet;
}
/** Kortene i en blokk, ett per art. */
function kort(blokk: string): string[] {
  return blokk.split('<li').slice(1);
}
function kortFor(blokk: string, artsnavn: string): string {
  const funnet = kort(blokk).find((etKort) => etKort.includes(`>${artsnavn}</p>`));
  if (!funnet) throw new Error(`Fant ikke kortet for «${artsnavn}»`);
  return funnet;
}

const ROEDT_KORT = 'border-red-200 bg-red-50';
const NOVEMBER = 11;
const overskrift = (mal: string, month: string) => mal.replace('{month}', month);

afterEach(() => {
  vi.useRealTimers();
});

describe('giftige arter har sin egen blokk', () => {
  it('november: de fire giftige står under egen overskrift, ikke i «I sesong nå»', () => {
    const html = render(NOVEMBER);
    const hoved = blokkMed(html, overskrift(nb.SeasonNow.inSeasonNowHeading, 'november'));
    const farlige = blokkMed(html, nb.SeasonNow.dangerousNowHeading);

    for (const giftig of ['Flatklokkehatt', 'Pantermusserong', 'Potetrøyksopp', 'Svovelsopp']) {
      expect(farlige, giftig).toContain(`>${giftig}</p>`);
      expect(hoved, giftig).not.toContain(giftig);
    }
    expect(kort(farlige)).toHaveLength(4);
    expect(kort(hoved)).toHaveLength(20);
  });

  it('hovedlista har ingen giftig- eller dødelig-merker — i noen måned', () => {
    for (let month = 1; month <= 12; month++) {
      const html = render(month);
      const hoved = blokker(html)[0];
      expect(hoved, `måned ${month}`).not.toContain(nb.EdibilityBadge.toxic);
      expect(hoved, `måned ${month}`).not.toContain(nb.EdibilityBadge.deadly);
      expect(hoved, `måned ${month}`).not.toContain(ROEDT_KORT);
    }
  });

  it('hvert kort i den farlige blokka er rødtonet og bærer merket sitt i tekst', () => {
    const farlige = blokkMed(render(NOVEMBER), nb.SeasonNow.dangerousNowHeading);
    for (const etKort of kort(farlige)) {
      expect(etKort).toContain(ROEDT_KORT);
      expect(etKort.includes(nb.EdibilityBadge.toxic) || etKort.includes(nb.EdibilityBadge.deadly)).toBe(true);
    }
    expect(kortFor(farlige, 'Flatklokkehatt')).toContain(nb.EdibilityBadge.deadly);
  });

  it('blokka sier rett ut at dette ikke er matsopp', () => {
    const farlige = blokkMed(render(NOVEMBER), nb.SeasonNow.dangerousNowHeading);
    expect(farlige).toContain(nb.SeasonNow.dangerousNowNote);
    expect(nb.SeasonNow.dangerousNowNote).toMatch(/Ikke matsopp/);
    expect(sv.SeasonNow.dangerousNowNote).toMatch(/Ingen matsvamp/);
  });

  it('aldri «Topp-sesong» på en farlig art — heller ikke i dens egen toppsesong', () => {
    // September: hvit fluesopp (dødelig) har toppsesong aug–sep i katalogen.
    const html = render(9);
    const farlige = blokkMed(html, nb.SeasonNow.dangerousNowHeading);
    expect(kort(farlige)).toHaveLength(17);
    expect(kortFor(farlige, 'Hvit fluesopp')).toContain(nb.EdibilityBadge.deadly);
    expect(farlige).not.toContain(nb.SeasonNow.peakSeason);
    // … mens matsoppene i toppsesong beholder merket.
    expect(kortFor(blokker(html)[0], 'Kantarell')).toContain(nb.SeasonNow.peakSeason);
  });

  it('ingen farlig blokk når ingen farlige arter er ute (desember)', () => {
    const html = render(12);
    expect(html).not.toContain(nb.SeasonNow.dangerousNowHeading);
    expect(kort(blokker(html)[0])).toHaveLength(4);
  });

  it('svensk leser får blokka på svensk, med svenske artsnavn', () => {
    const farlige = blokkMed(render(NOVEMBER, 'sv'), sv.SeasonNow.dangerousNowHeading);
    expect(farlige).toContain(sv.SeasonNow.dangerousNowNote);
    expect(farlige).toContain('>Gifthätting</p>');
    expect(farlige).not.toContain('Flatklokkehatt');
    expect(farlige).toContain(sv.EdibilityBadge.deadly);
  });
});

describe('hovedlista løfter toppsesongen', () => {
  it('november: de sju i toppsesong står først, med merke', () => {
    const hoved = blokker(render(NOVEMBER))[0];
    const rekkefolge = kort(hoved);
    for (const etKort of rekkefolge.slice(0, 7)) expect(etKort).toContain(nb.SeasonNow.peakSeason);
    for (const etKort of rekkefolge.slice(7)) expect(etKort).not.toContain(nb.SeasonNow.peakSeason);
    expect(rekkefolge[0]).toContain('>Blå ridderhatt</p>');
    expect(rekkefolge[7]).toContain('>Ametystsopp</p>');
  });

  it('overskriften er den samme nøytrale som før — ikke «matsopp i sesong»', () => {
    expect(render(NOVEMBER)).toContain(overskrift(nb.SeasonNow.inSeasonNowHeading, 'november'));
    expect(nb.SeasonNow.inSeasonNowHeading).toBe('I sesong nå ({month})');
    expect(sv.SeasonNow.inSeasonNowHeading).toBe('I säsong nu ({month})');
  });
});

describe('neste ut', () => {
  it('desember: «Neste ut: april» med morklene — og den dødelige sandmorkelen sist, i rødt', () => {
    const neste = blokkMed(render(12), overskrift(nb.SeasonNow.nextUpHeading, 'april'));
    const rekkefolge = kort(neste);
    expect(rekkefolge).toHaveLength(4);
    expect(rekkefolge[3]).toContain('>Sandmorkel</p>');
    expect(rekkefolge[3]).toContain(ROEDT_KORT);
    expect(rekkefolge[3]).toContain(nb.EdibilityBadge.deadly);
    for (const etKort of rekkefolge.slice(0, 3)) expect(etKort).not.toContain(ROEDT_KORT);
    expect(neste).not.toContain(nb.SeasonNow.peakSeason);
  });

  it('sier at månedene ikke er et løfte om funn, og peker til biblioteket', () => {
    const neste = blokkMed(render(12), overskrift(nb.SeasonNow.nextUpHeading, 'april'));
    expect(neste).toContain(nb.SeasonNow.nextUpNote);
    expect(neste).toContain(nb.SeasonNow.nextUpLibraryLink);
    expect(neste).toMatch(/<a[^>]*href="\/species"/);
    expect(nb.SeasonNow.nextUpNote).toMatch(/ikke hva som står der du er/);
    // Svensk «vad som står där» leses som «hva det står skrevet der». Sopp
    // «växer» på svensk.
    expect(sv.SeasonNow.nextUpNote).toMatch(/inte vad som växer där du är/);
    expect(sv.SeasonNow.nextUpNote).not.toMatch(/vad som står/);
  });

  it('november, januar og februar får også «Neste ut: april»', () => {
    for (const month of [11, 1, 2]) {
      expect(render(month), `måned ${month}`).toContain(overskrift(nb.SeasonNow.nextUpHeading, 'april'));
    }
  });

  it('mars: april er neste måned — «Kommer snart» som før, uten forbeholdslinja', () => {
    const html = render(3);
    const snart = blokkMed(html, `>${nb.SeasonNow.comingSoon}</h2>`);
    expect(kort(snart)).toHaveLength(4);
    expect(kortFor(snart, 'Sandmorkel')).toContain(ROEDT_KORT);
    expect(html).not.toContain(overskrift(nb.SeasonNow.nextUpHeading, 'april'));
    expect(html).not.toContain(nb.SeasonNow.nextUpNote);
  });

  it('september og oktober: verken «Kommer snart» eller «Neste ut» — det er høysesong', () => {
    for (const month of [9, 10]) {
      const html = render(month);
      expect(html, `måned ${month}`).not.toContain(nb.SeasonNow.comingSoon);
      expect(html, `måned ${month}`).not.toContain('Neste ut');
    }
  });

  it('svensk: «Näst på tur: april», med svensk forbeholdslinje', () => {
    const neste = blokkMed(render(12, 'sv'), overskrift(sv.SeasonNow.nextUpHeading, 'april'));
    expect(neste).toContain(sv.SeasonNow.nextUpNote);
    expect(neste).toContain(sv.SeasonNow.nextUpLibraryLink);
    expect(neste).toContain('>Stenmurkla</p>');
  });
});

describe('artsnavnet bryter i stedet for å bli kuttet', () => {
  it('ingen «truncate» på navnet, og hvert ord er en ordblokk', () => {
    // «Bleklodden steinsopp» ble «Bleklodden steins…» på en 320 px skjerm.
    const blokk = blokkMed(rendreRaa(9), overskrift(nb.SeasonNow.inSeasonNowHeading, nb.SeasonNow.monthSeptember));
    const etKort = kort(blokk).find((k) => k.includes('alt="Bleklodden steinsopp"'));
    expect(etKort).toBeDefined();
    const navn = /<p class="([^"]*)">(.*?)<\/p>/.exec(etKort ?? '');
    expect(navn?.[1]).not.toContain('truncate');
    expect(navn?.[2]).toBe(
      `<span class="${ORDBLOKK_KLASSER}">Bleklodden</span> <span class="${ORDBLOKK_KLASSER}">steinsopp</span>`
    );
  });
});

describe('bildene lastes først når kortet nærmer seg skjermen', () => {
  it('hvert bilde har loading="lazy" og decoding="async" — september har over 70 kort', () => {
    const bilder = render(9).match(/<img[^>]*>/g) ?? [];
    expect(bilder.length).toBeGreaterThan(70);
    for (const img of bilder) {
      expect(img).toContain('loading="lazy"');
      expect(img).toContain('decoding="async"');
    }
  });

  it('raden ber Commons om 330 px-utgaven, ikke 500 — ruta er 56 px bred', () => {
    const commons = (bredde: number, fil: string) =>
      `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${fil}/${bredde}px-${fil}`;
    const arter = katalog('nb').map((art, i) => ({
      ...art,
      primary_image_url:
        i % 3 === 0 ? commons(500, `Art${art.id}.jpg`) : i % 3 === 1 ? commons(330, `Art${art.id}.jpg`) : `https://bilder.example.org/${art.id}.jpg`
    }));
    const bilder = (render(9, 'nb', arter).match(/<img[^>]*>/g) ?? []).map((img) => /src="([^"]+)"/.exec(img)?.[1] ?? '');
    expect(bilder.length).toBeGreaterThan(70);
    for (const src of bilder) {
      if (src.includes('upload.wikimedia.org')) expect(src).toMatch(/\/330px-Art\d+\.jpg$/);
      else expect(src).toMatch(/^https:\/\/bilder\.example\.org\/\d+\.jpg$/);
    }
    expect(bilder.some((src) => src.includes('upload.wikimedia.org'))).toBe(true);
  });

  it('en art uten bilde får ikke noe <img> i det hele tatt', () => {
    const utenBilde = katalog('nb').map((art) => ({ ...art, primary_image_url: null }));
    expect(render(12, 'nb', utenBilde)).not.toContain('<img');
  });
});

describe('måneden kommer fra siden, ikke fra klokka', () => {
  it('rendrer desember selv om klokka i miljøet står i juli', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
    const html = render(12);
    expect(html).toContain(overskrift(nb.SeasonNow.inSeasonNowHeading, 'desember'));
    expect(html).not.toContain('juli');
    expect(kort(blokker(html)[0])).toHaveLength(4);
  });
});

describe('tomt', () => {
  it('uten arter: «ingen i sesong», ingen farlig blokk og ingen «neste ut»', () => {
    const html = render(12, 'nb', []);
    expect(html).toContain(nb.SeasonNow.noneInSeason);
    expect(blokker(html)).toHaveLength(1);
  });

  it('bare en farlig art i sesong: ikke «ingen i sesong» — den står i sin blokk', () => {
    const baregiftig = katalog('nb').filter((art) => art.norwegian_name === 'Flatklokkehatt');
    const html = render(NOVEMBER, 'nb', baregiftig);
    expect(html).not.toContain(nb.SeasonNow.noneInSeason);
    expect(blokkMed(html, nb.SeasonNow.dangerousNowHeading)).toContain('>Flatklokkehatt</p>');
  });
});
