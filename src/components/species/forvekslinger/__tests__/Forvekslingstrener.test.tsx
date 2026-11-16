// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Forvekslingstrener } from '../Forvekslingstrener';
import { Sikkerhetslinje } from '../Sikkerhetslinje';
import { TrenerInngang } from '../TrenerInngang';
import {
  FORVEKSLINGSTRENER_NOKKEL,
  byggTrenerpar,
  type ForvekslingsArtRad,
  type ForvekslingsRad,
  type Tilfeldig,
  type TrenerPar
} from '@/lib/species/forvekslingstrener';
import nb from '../../../../../messages/nb.json';
import sv from '../../../../../messages/sv.json';

/**
 * Treneren deler ut «riktig» og «feil» om giftige sopper. Testene holder på det
 * som gjør formatet forsvarlig:
 *
 *  1. hvert bilde har krediteringslinja si — før og etter svaret
 *  2. avsløringen lærer bort kjennetegnene og gjentar den faste sikkerhetslinja,
 *     enten svaret var riktig eller feil
 *  3. svensk viser aldri norsk prosa — den sier hvor teksten står
 *  4. ingenting sendes til serveren: fremdriften bor i lokal lagring, og
 *     treneren virker også når nettleseren har blokkert den
 */

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));

const fetchSpion = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  fetchSpion.mockReset();
  vi.stubGlobal('fetch', fetchSpion);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function art(
  id: number,
  norsk: string,
  svensk: string,
  latin: string,
  spiselighet: string
): ForvekslingsArtRad {
  return {
    id,
    norwegian_name: norsk,
    swedish_name: svensk,
    latin_name: latin,
    edibility: spiselighet,
    primary_image_url: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/a${id}/Art_${id}.jpg/330px-Art_${id}.jpg`,
    primary_image_photographer: `Testfotograf ${id}`,
    primary_image_license: 'CC BY-SA 3.0',
    primary_image_source_url: `https://commons.wikimedia.org/wiki/File:Art_${id}.jpg`
  };
}

const sjampinjong = art(10, 'Sjampinjong', 'Ängschampinjon', 'Agaricus campestris', 'edible');
const hvitFluesopp = art(16, 'Hvit fluesopp', 'Vit flugsvamp', 'Amanita virosa', 'deadly');
const granmatriske = art(32, 'Granmatriske', 'Granblodriska', 'Lactarius deterrimus', 'edible');
const pluggsopp = art(18, 'Pluggsopp', 'Pluggskivling', 'Paxillus involutus', 'toxic');

const LIKHET = 'Begge har hvit hatt og hvit stilk.';
const SKILLE = 'Sjampinjong har ALLTID ROSA til SJOKOLADEBRUNE skiver. Hvis skivene er hvite — ikke spis.';

const RADER: ForvekslingsRad[] = [
  {
    species_id: 10,
    look_alike_id: 16,
    danger_level: 'critical',
    similarity_description: LIKHET,
    difference_description: SKILLE,
    art: sjampinjong,
    forveksling: hvitFluesopp
  },
  {
    species_id: 32,
    look_alike_id: 18,
    danger_level: 'high',
    similarity_description: 'Begge er oransjebrune og traktformede.',
    difference_description: 'Bryt hatten: pluggsopp gir INGEN melkesaft. Ved tvil — la stå.',
    art: granmatriske,
    forveksling: pluggsopp
  }
];

const ettPar = (locale: 'nb' | 'sv' = 'nb') => byggTrenerpar(RADER.slice(0, 1), locale);
const toPar = (locale: 'nb' | 'sv' = 'nb') => byggTrenerpar(RADER, locale);

/** Gir verdiene i rekkefølge, og 0 når lista er brukt opp. */
function fast(...verdier: number[]): Tilfeldig {
  let i = 0;
  return () => verdier[i++] ?? 0;
}
/** Med ett par trekkes bare siden: under 0,5 = giftig til venstre. */
const GIFTIG_VENSTRE = () => fast(0.1);
const GIFTIG_HOYRE = () => fast(0.9);

function rendrer(par: TrenerPar[], tilfeldig: Tilfeldig = GIFTIG_VENSTRE(), locale: 'nb' | 'sv' = 'nb') {
  return render(
    <NextIntlClientProvider locale={locale} messages={(locale === 'sv' ? sv : nb) as never} timeZone="Europe/Oslo">
      <Forvekslingstrener par={par} tilfeldig={tilfeldig} />
    </NextIntlClientProvider>
  );
}

const klikk = (navn: string | RegExp) => fireEvent.click(screen.getByRole('button', { name: navn }));
const kort = () => screen.getAllByRole('figure');

describe('Forvekslingstrener — før runden', () => {
  it('viser tom-tilstanden når ingen par kan vises — ikke en øvelse uten innhold', () => {
    rendrer([]);
    expect(screen.getByRole('heading', { name: 'Ingen par å øve på akkurat nå' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('link', { name: 'Til artsbiblioteket' }).getAttribute('href')).toBe('/species');
  });

  it('forklarer øvelsen og venter på at brukeren starter', () => {
    rendrer(toPar());
    expect(screen.getByRole('heading', { name: 'Klar for en runde?' })).toBeTruthy();
    expect(screen.getByText(/Treneren har 2 par — en runde tar 2\./)).toBeTruthy();
    // Ingen fremdriftslinje før noe er svart, og ingen bilder før runden er i gang.
    expect(screen.queryByText(/Du har klart/)).toBeNull();
    expect(screen.queryAllByRole('figure')).toEqual([]);
  });

  it('sier «ett par» når treneren bare har ett', () => {
    rendrer(ettPar());
    expect(screen.getByText(/Treneren har ett par\./)).toBeTruthy();
  });
});

describe('Forvekslingstrener — spørsmålet', () => {
  it('viser to arter med navn, latinsk navn og kreditering under HVERT bilde', () => {
    rendrer(ettPar());
    klikk('Start en runde');

    expect(screen.getByRole('heading', { name: /Par 1 av 1.*Hvilken av disse to er giftsoppen\?/ })).toBeTruthy();
    const [venstre, hoyre] = kort();
    expect(kort()).toHaveLength(2);

    expect(within(venstre).getByRole('button', { name: /Hvit fluesopp.*Amanita virosa/ })).toBeTruthy();
    expect(within(hoyre).getByRole('button', { name: /Sjampinjong.*Agaricus campestris/ })).toBeTruthy();

    const kredVenstre = within(venstre).getByRole('link', { name: 'Foto: Testfotograf 16 (CC BY-SA 3.0)' });
    const kredHoyre = within(hoyre).getByRole('link', { name: 'Foto: Testfotograf 10 (CC BY-SA 3.0)' });
    expect(kredVenstre.getAttribute('href')).toBe('https://commons.wikimedia.org/wiki/File:Art_16.jpg');
    expect(kredHoyre.getAttribute('href')).toBe('https://commons.wikimedia.org/wiki/File:Art_10.jpg');

    // Bildene er artsbibliotekets egne — og hvert bilde hører til arten på kortet.
    expect(venstre.querySelector('img')?.getAttribute('src')).toBe(hvitFluesopp.primary_image_url);
    expect(hoyre.querySelector('img')?.getAttribute('src')).toBe(sjampinjong.primary_image_url);
  });

  it('lar lange artsnavn bryte i stedet for å bli kuttet av kortkanten', () => {
    // Navnene er det øvelsen ber brukeren lese, og kortet har overflow-hidden:
    // «Snøballsjampinjong» er 160 px i Fraunces 700, og kortet hadde 143 px å
    // vise det på med en 390 px bred skjerm. jsdom har ingen layout, så testen
    // låser klassene som gjør jobben — selve brytingen er målt i Chrome og
    // WebKit med den bygde skriften (se Artsnavn i komponenten).
    const snoball = art(21, 'Snøballsjampinjong', 'Snöbollschampinjon', 'Agaricus arvensis', 'conditionally_edible');
    const gronn = art(15, 'Grønn fluesopp', 'Lömsk flugsvamp', 'Amanita phalloides', 'deadly');
    const par = byggTrenerpar(
      [
        {
          species_id: 21,
          look_alike_id: 15,
          danger_level: 'critical',
          similarity_description: LIKHET,
          difference_description: SKILLE,
          art: snoball,
          forveksling: gronn
        }
      ],
      'nb'
    );
    rendrer(par);
    klikk('Start en runde');
    const [venstre, hoyre] = kort();

    // Hvert ord er sin egen blokk, aldri bredere enn linja: ordet kan deles
    // (med bindestrek der nettleseren har orddeling), men ikke stikke ut.
    const ordblokker: [HTMLElement, string[]][] = [
      [venstre, ['Grønn', 'fluesopp']],
      [hoyre, ['Snøballsjampinjong']]
    ];
    for (const [k, ordene] of ordblokker) {
      for (const ord of ordene) {
        const klasser = within(k).getByText(ord).className.split(/\s+/);
        expect(klasser, ord).toEqual(
          expect.arrayContaining(['inline-block', 'max-w-full', 'break-words', 'hyphens-auto'])
        );
      }
    }
    // Navnet er fortsatt ETT navn: mellomrommet står mellom blokkene, så både
    // teksten og knappens navn leses som før.
    expect(within(venstre).getByText('Grønn').parentElement?.textContent).toBe('Grønn fluesopp');
    expect(within(venstre).getByRole('button', { name: /Grønn fluesopp.*Amanita phalloides/ })).toBeTruthy();
    expect(within(hoyre).getByRole('button', { name: /Snøballsjampinjong.*Agaricus arvensis/ })).toBeTruthy();

    // Det latinske navnet bryter også heller enn å stikke ut …
    expect(within(venstre).getByText('Amanita phalloides').className).toContain('break-words');
    expect(within(hoyre).getByText('Agaricus arvensis').className).toContain('break-words');
    // … og ingenting på kortet over streken kutter tekst eller hindrer bryting.
    for (const k of kort()) {
      for (const el of within(k).getByRole('button').querySelectorAll('span')) {
        expect(el.className).not.toMatch(/truncate|line-clamp|whitespace-nowrap|text-ellipsis/);
      }
    }
  });

  it('røper ikke svaret før brukeren har valgt', () => {
    rendrer(ettPar());
    klikk('Start en runde');
    // Ingen spiselighetsmerker, ingen fasit, ingen kjennetegn ennå.
    expect(screen.queryByText('Dødelig giftig')).toBeNull();
    expect(screen.queryByText('Spiselig')).toBeNull();
    expect(screen.queryByText(/er giftsoppen av de to/)).toBeNull();
    expect(screen.queryByText('Slik skiller du dem:')).toBeNull();
    // Kortene er like: ingen rød ramme før svaret.
    for (const k of kort()) expect(k.className).not.toContain('red');
  });

  it('plasseringen følger trekningen — den giftige står ikke fast på én side', () => {
    rendrer(ettPar(), GIFTIG_HOYRE());
    klikk('Start en runde');
    const [venstre, hoyre] = kort();
    expect(within(venstre).getByRole('button', { name: /Sjampinjong/ })).toBeTruthy();
    expect(within(hoyre).getByRole('button', { name: /Hvit fluesopp/ })).toBeTruthy();
  });
});

describe('Forvekslingstrener — avsløringen', () => {
  it('riktig svar: sier hvem som er giftig, og lærer så bort kjennetegnene', () => {
    rendrer(ettPar());
    klikk('Start en runde');
    klikk(/Hvit fluesopp/);

    expect(screen.getByText('Riktig. Hvit fluesopp er giftsoppen av de to.')).toBeTruthy();
    expect(screen.getByText('Slik skiller du dem:').parentElement?.textContent).toContain(SKILLE);
    expect(screen.getByText('Hvorfor de forveksles:').parentElement?.textContent).toContain(LIKHET);
  });

  it('feil svar: samme fasit og samme kjennetegn — ingen blir stående uten forklaringen', () => {
    rendrer(ettPar());
    klikk('Start en runde');
    klikk(/Sjampinjong/);

    expect(screen.getByText('Ikke riktig. Hvit fluesopp er giftsoppen av de to.')).toBeTruthy();
    expect(screen.queryByText(/^Riktig\./)).toBeNull();
    expect(screen.getByText('Slik skiller du dem:').parentElement?.textContent).toContain(SKILLE);
  });

  it('gjentar den faste sikkerhetslinja rett under kjennetegnene', () => {
    rendrer(ettPar());
    klikk('Start en runde');
    expect(screen.queryByText(/Et bilde er aldri nok\./)).toBeNull();
    klikk(/Hvit fluesopp/);
    const linje = screen.getByText(/Et bilde er aldri nok\./);
    expect(linje.textContent).toContain('Kjennetegnene må sjekkes på selve soppen.');
    expect(linje.textContent).toContain('ikke en vurdering av en sopp du har funnet');
    expect(within(linje).getByRole('link', { name: 'Les sikkerhetsrådene' }).getAttribute('href')).toBe('/sikkerhet');
  });

  it('viser katalogens merke på begge kortene, markerer den giftige og hva brukeren valgte', () => {
    rendrer(ettPar());
    klikk('Start en runde');
    klikk(/Sjampinjong/);

    const [venstre, hoyre] = kort();
    expect(within(venstre).getByText('Dødelig giftig')).toBeTruthy();
    expect(within(hoyre).getByText('Spiselig')).toBeTruthy();
    expect(venstre.className).toContain('border-red-600');
    expect(hoyre.className).not.toContain('red');
    expect(within(hoyre).getByText('Ditt svar')).toBeTruthy();
    expect(within(venstre).queryByText('Ditt svar')).toBeNull();
  });

  it('beholder krediteringen under bildene etter svaret, og låser valget', () => {
    rendrer(ettPar());
    klikk('Start en runde');
    klikk(/Hvit fluesopp/);

    expect(screen.getByRole('link', { name: 'Foto: Testfotograf 16 (CC BY-SA 3.0)' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Foto: Testfotograf 10 (CC BY-SA 3.0)' })).toBeTruthy();
    for (const k of kort()) {
      expect((within(k).getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    }
    // Et trykk til på det andre kortet endrer ikke svaret.
    fireEvent.click(within(kort()[1]).getByRole('button'));
    expect(screen.getByText('Riktig. Hvit fluesopp er giftsoppen av de to.')).toBeTruthy();
  });

  it('lenker til begge artssidene', () => {
    rendrer(ettPar());
    klikk('Start en runde');
    klikk(/Hvit fluesopp/);
    expect(screen.getByRole('link', { name: 'Les alt om Hvit fluesopp →' }).getAttribute('href')).toBe('/species/16');
    expect(screen.getByRole('link', { name: 'Les alt om Sjampinjong →' }).getAttribute('href')).toBe('/species/10');
  });

  it('flytter fokus til det nye innholdet for hvert steg', () => {
    rendrer(toPar(), fast(0.9, 0.1, 0.1));
    klikk('Start en runde');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: /Par 1 av 2/ }));

    fireEvent.click(within(kort()[0]).getByRole('button'));
    expect(document.activeElement?.textContent).toMatch(/er giftsoppen av de to\./);

    klikk('Neste par');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: /Par 2 av 2/ }));

    fireEvent.click(within(kort()[0]).getByRole('button'));
    klikk('Se resultatet');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Runden er ferdig' }));
  });
});

describe('Forvekslingstrener — runden og fremdriften', () => {
  it('går gjennom parene og oppsummerer uten å love noe om soppen i skogen', () => {
    rendrer(toPar(), fast(0.9, 0.1, 0.1));
    klikk('Start en runde');

    // Første par: velg den giftige (til venstre). Andre par: velg feil.
    fireEvent.click(within(kort()[0]).getByRole('button'));
    expect(screen.getByText(/^Riktig\./)).toBeTruthy();
    klikk('Neste par');
    expect(screen.queryByText(/er giftsoppen av de to/)).toBeNull();
    fireEvent.click(within(kort()[1]).getByRole('button'));
    expect(screen.getByText(/^Ikke riktig\./)).toBeTruthy();
    klikk('Se resultatet');

    expect(screen.getByRole('heading', { name: 'Runden er ferdig' })).toBeTruthy();
    expect(screen.getByText('Du pekte ut giftsoppen i 1 av 2 par.')).toBeTruthy();
    expect(screen.getByText('Du har klart 1 av 2 par i treneren.')).toBeTruthy();
    expect(screen.getByText(/Et bilde er aldri nok\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ny runde' })).toBeTruthy();
  });

  it('lagrer fremdriften lokalt for hvert svar — riktig inn, feil ut igjen', () => {
    const lagret = () => JSON.parse(window.localStorage.getItem(FORVEKSLINGSTRENER_NOKKEL) ?? 'null');

    rendrer(ettPar());
    expect(lagret()).toBeNull();
    klikk('Start en runde');
    klikk(/Hvit fluesopp/);
    expect(lagret()).toEqual({ klarte: ['10-16'] });

    klikk('Se resultatet');
    klikk('Ny runde');
    klikk(/Sjampinjong/);
    expect(lagret()).toEqual({ klarte: [] });
  });

  it('viser lagret fremdrift ved neste besøk, og tåler en ødelagt verdi', () => {
    window.localStorage.setItem(FORVEKSLINGSTRENER_NOKKEL, JSON.stringify({ klarte: ['10-16', '999-1000'] }));
    rendrer(toPar());
    // Paret 999-1000 er ikke i treneren lenger og teller ikke.
    expect(screen.getByText('Du har klart 1 av 2 par i treneren.')).toBeTruthy();
    cleanup();

    window.localStorage.setItem(FORVEKSLINGSTRENER_NOKKEL, '{ikke json');
    rendrer(toPar());
    expect(screen.getByRole('button', { name: 'Start en runde' })).toBeTruthy();
    expect(screen.queryByText(/Du har klart/)).toBeNull();
  });

  it('tar par brukeren ikke har klart før repetisjonen', () => {
    window.localStorage.setItem(FORVEKSLINGSTRENER_NOKKEL, JSON.stringify({ klarte: ['10-16'] }));
    rendrer(toPar(), fast(0.1, 0.1));
    klikk('Start en runde');
    // 18-32 (granmatriske/pluggsopp) er ikke klart, og kommer derfor først.
    expect(screen.getByRole('button', { name: /Pluggsopp/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Hvit fluesopp/ })).toBeNull();
  });

  it('virker når nettleseren har blokkert lokal lagring', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });

    rendrer(ettPar());
    klikk('Start en runde');
    klikk(/Hvit fluesopp/);
    klikk('Se resultatet');
    // Fremdriften varer ut besøket selv om den ikke kan lagres.
    expect(screen.getByText('Du pekte ut giftsoppen i 1 av 1 par.')).toBeTruthy();
    expect(screen.getByText('Du har klart 1 av 1 par i treneren.')).toBeTruthy();
  });

  it('snakker aldri med serveren — ingen bruksdag, ingen konto', () => {
    rendrer(toPar(), fast(0.9, 0.1, 0.1));
    klikk('Start en runde');
    fireEvent.click(within(kort()[0]).getByRole('button'));
    klikk('Neste par');
    fireEvent.click(within(kort()[0]).getByRole('button'));
    klikk('Se resultatet');
    klikk('Ny runde');
    expect(fetchSpion).not.toHaveBeenCalled();
  });
});

describe('Forvekslingstrener — svensk', () => {
  it('viser svenske navn og merker, og ALDRI den norske prosaen', () => {
    const { container } = rendrer(ettPar('sv'), GIFTIG_VENSTRE(), 'sv');
    klikk('Starta en runda');
    expect(screen.getByRole('heading', { name: /Par 1 av 1.*Vilken av de här två är giftsvampen\?/ })).toBeTruthy();
    klikk(/Vit flugsvamp/);

    expect(screen.getByText('Rätt. Vit flugsvamp är giftsvampen av de två.')).toBeTruthy();
    const [venstre, hoyre] = kort();
    expect(within(venstre).getByText('Dödligt giftig')).toBeTruthy();
    expect(within(hoyre).getByText('Ätlig')).toBeTruthy();

    const tekst = container.textContent ?? '';
    expect(tekst).not.toContain('skiver');
    expect(tekst).not.toContain('hvit hatt');
    expect(tekst).not.toContain('ikke spis');
    expect(screen.queryByText('Så skiljer du dem åt:')).toBeNull();
    expect(screen.queryByText('Varför de förväxlas:')).toBeNull();
  });

  it('sier ærlig hvor teksten står — på artssiden, foreløpig bare på norsk', () => {
    rendrer(ettPar('sv'), GIFTIG_VENSTRE(), 'sv');
    klikk('Starta en runda');
    klikk(/Ängschampinjon/);

    expect(screen.getByText('Inte rätt. Vit flugsvamp är giftsvampen av de två.')).toBeTruthy();
    const lenke = screen.getByRole('link', { name: 'artsidan för Ängschampinjon' });
    // Forvekslingskortet for paret står på artssiden til radens species_id.
    expect(lenke.getAttribute('href')).toBe('/species/10');
    expect(lenke.parentElement?.textContent).toBe(
      'Hur du skiljer dem åt står på artsidan för Ängschampinjon — än så länge bara på norska.'
    );
  });

  it('rendrer ikke norsk prosa på svensk selv om paret skulle ha den med', () => {
    // Siden bygger parene med leserens språk, så dette skal ikke kunne skje.
    // Men det var nettopp slik artssiden og AI-resultatet fikk norsk tekst i
    // den svenske flaten: visningen stolte på at dataene var riktige.
    const { container } = rendrer(ettPar('nb'), GIFTIG_VENSTRE(), 'sv');
    klikk('Starta en runda');
    klikk(/Hvit fluesopp/);

    const tekst = container.textContent ?? '';
    expect(tekst).not.toContain(SKILLE);
    expect(tekst).not.toContain(LIKHET);
    expect(screen.queryByText('Så skiljer du dem åt:')).toBeNull();
    expect(tekst).toContain('än så länge bara på norska');
  });

  it('lenker til begge artssidene og har sikkerhetslinja på svensk', () => {
    rendrer(ettPar('sv'), GIFTIG_VENSTRE(), 'sv');
    klikk('Starta en runda');
    klikk(/Vit flugsvamp/);

    expect(screen.getByRole('link', { name: 'Läs allt om Vit flugsvamp →' }).getAttribute('href')).toBe('/species/16');
    expect(screen.getByRole('link', { name: 'Läs allt om Ängschampinjon →' }).getAttribute('href')).toBe('/species/10');
    const linje = screen.getByText(/En bild räcker aldrig\./);
    expect(linje.textContent).toContain('Kännetecknen måste kontrolleras på själva svampen.');
    expect(linje.textContent).toContain('inte en bedömning av en svamp du har hittat');
    // Krediteringen er der på svensk også.
    expect(screen.getByRole('link', { name: 'Foto: Testfotograf 16 (CC BY-SA 3.0)' })).toBeTruthy();
  });
});

describe('Sikkerhetslinje og inngang', () => {
  function medSprak(locale: 'nb' | 'sv', barn: ReactNode) {
    return render(
      <NextIntlClientProvider locale={locale} messages={(locale === 'sv' ? sv : nb) as never} timeZone="Europe/Oslo">
        {barn}
      </NextIntlClientProvider>
    );
  }

  it('sikkerhetslinja sier de tre tingene som alltid skal med, på begge språk', () => {
    medSprak('nb', <Sikkerhetslinje />);
    const norsk = screen.getByText(/Et bilde er aldri nok\./).textContent ?? '';
    expect(norsk).toContain('Kjennetegnene må sjekkes på selve soppen.');
    expect(norsk).toContain('ikke en vurdering av en sopp du har funnet');
    expect(norsk).toContain('Ved tvil — la den stå.');
    cleanup();

    medSprak('sv', <Sikkerhetslinje />);
    const svensk = screen.getByText(/En bild räcker aldrig\./).textContent ?? '';
    expect(svensk).toContain('Kännetecknen måste kontrolleras på själva svampen.');
    expect(svensk).toContain('inte en bedömning av en svamp du har hittat');
    expect(svensk).toContain('Vid tvivel — låt den stå.');
  });

  it('inngangen fra artsbiblioteket peker på treneren, på begge språk', () => {
    medSprak('nb', <TrenerInngang />);
    expect(screen.getByRole('link', { name: /Kjenn forvekslingen/ }).getAttribute('href')).toBe('/species/forvekslinger');
    cleanup();
    medSprak('sv', <TrenerInngang />);
    expect(screen.getByRole('link', { name: /Lär känna förväxlingsarterna/ }).getAttribute('href')).toBe(
      '/species/forvekslinger'
    );
  });
});

describe('ordlyden i treneren', () => {
  const tekster = (katalog: typeof nb) => Object.entries(katalog.Forvekslingstrener);

  it('spør etter giftsoppen — den andre arten kan selv være «giftig rå»', () => {
    // Morklene, rødnende fluesopp og hulriske er «Spiselig — giftig rå». Spurte
    // treneren «hvilken er giftig?», ville begge kortene vært et forsvarlig
    // svar, og fasiten ville motsagt merket ved siden av.
    const rodnende = art(55, 'Rødnende fluesopp', 'Rodnande flugsvamp', 'Amanita rubescens', 'conditionally_edible');
    const panter = art(53, 'Panterfluesopp', 'Panterflugsvamp', 'Amanita pantherina', 'toxic');
    const par = byggTrenerpar(
      [
        {
          species_id: 55,
          look_alike_id: 53,
          danger_level: 'high',
          similarity_description: 'Begge er brune fluesopper med flekker.',
          difference_description: 'Rødnende fluesopp RØDNER i kjøttet ved skade. Ved tvil — la den stå.',
          art: rodnende,
          forveksling: panter
        }
      ],
      'nb'
    );
    rendrer(par, GIFTIG_VENSTRE());
    klikk('Start en runde');
    expect(screen.getByRole('heading', { name: /Hvilken av disse to er giftsoppen\?/ })).toBeTruthy();
    klikk(/Panterfluesopp/);

    expect(screen.getByText('Riktig. Panterfluesopp er giftsoppen av de to.')).toBeTruthy();
    expect(within(kort()[1]).getByText('Spiselig — giftig rå')).toBeTruthy();

    for (const nokkel of ['sporsmal', 'sporsmalHjelp', 'riktig', 'feil', 'ferdigResultat'] as const) {
      expect(nb.Forvekslingstrener[nokkel], `nb: ${nokkel}`).toContain('giftsoppen');
      expect(sv.Forvekslingstrener[nokkel], `sv: ${nokkel}`).toContain('giftsvampen');
    }
  });

  it('lover aldri at noe er trygt eller kan spises', () => {
    // Treneren peker ut den giftige. Den sier aldri noe om den andre arten
    // utover merket fra katalogen — og aldri noe om en sopp brukeren har funnet.
    const forbudt = /(^|[^a-zæøåäö])(trygg|trygt|trygge|ufarlig|säker|säkert|säkra|ofarlig|spiselig|ätlig|ätbar|matsopp|matsvamp)([^a-zæøåäö]|$)/i;
    for (const [sprak, katalog] of [
      ['nb', nb],
      ['sv', sv]
    ] as const) {
      for (const [nokkel, verdi] of tekster(katalog)) {
        expect(verdi, `${sprak}: Forvekslingstrener.${nokkel}`).not.toMatch(forbudt);
      }
    }
  });

  it('den svenske teksten lover ikke kjennetegn i selve øvelsen', () => {
    // Prosaen finnes ikke på svensk. Introen og metabeskrivelsen skal derfor
    // peke til artssidene, ikke love at øvelsen viser hvordan artene skilles.
    expect(sv.Forvekslingstrener.metaDescription).toContain('artsidorna');
    expect(sv.Forvekslingstrener.kjennetegnPaArtssiden).toContain('bara på norska');
    expect(sv.Forvekslingstrener.intro).not.toMatch(/skilj/);
  });
});
