// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WAIT_FOR_NETWORK_MESSAGE } from '../../../../public/offline/offline-map.js';

/**
 * Oppstarten av offline-skallet, kjørt mot den EKTE public/offline/index.html.
 *
 * De rene funksjonene testes i offline-shell.test.ts. Denne fila finnes fordi
 * resten — hvilken overskrift som faktisk havner i siden, om forklaringen blir
 * synlig, hva knappen gjør — bare kan gå galt i samspillet mellom skriptet og
 * HTML-en. Skallet er siden brukeren står med i skogen, og en skrivefeil i
 * init() gir en blank side som ingen ser før da.
 */
// __dirname, ikke new URL(…, import.meta.url): under jsdom skriver Vite om det
// mønsteret til en http-adresse (som for bilder i en nettleser), og den kan
// ikke fs lese.
const HTML = readFileSync(resolve(__dirname, '../../../../public/offline/index.html'), 'utf8');
const DOKUMENT = new DOMParser().parseFromString(HTML, 'text/html');
const SKALL = DOKUMENT.querySelector('main')!.outerHTML;
const TITTEL = DOKUMENT.querySelector('title')!.outerHTML;

const NB_INGEN_OMRAADER = 'Du har ingen lagrede kartområder';

type Oppsett = {
  sti: string;
  paaNett: boolean;
  /** MYCELET_LOCALE-cookien. null: ingen cookie, slik de fleste svenske brukerne har det. */
  sprak?: 'nb' | 'sv' | null;
  /** navigator.languages. Standard er jsdoms egen. */
  nettleserSprak?: readonly string[];
  /** navigator.language. Standard er jsdoms egen. */
  nettleserHovedsprak?: string;
  /** Fjern #offline-reason: en eldre, cachet side som det nye skriptet kjører mot. */
  eldreSide?: boolean;
};

async function startSkallet({
  sti,
  paaNett,
  sprak = 'nb',
  nettleserSprak = ['en-US', 'en'],
  nettleserHovedsprak = 'en-US',
  eldreSide = false
}: Oppsett) {
  document.head.innerHTML = TITTEL;
  document.body.innerHTML = SKALL;
  if (eldreSide) document.getElementById('offline-reason')!.remove();

  window.history.replaceState({}, '', sti);
  if (sprak) document.cookie = `MYCELET_LOCALE=${sprak}`;
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(paaNett);
  // Alltid stubbet, også når testen ikke bryr seg om språket: testen som
  // bytter ut hele navigator arver herfra, og jsdoms egne gettere godtar bare
  // den ekte navigatoren.
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(nettleserSprak);
  vi.spyOn(window.navigator, 'language', 'get').mockReturnValue(nettleserHovedsprak);
  // Uten CacheStorage stopper skallet ved «nettleseren lagrer ikke kartfliser».
  // Med den kommer vi fram til lista over lagrede områder, som er tom her.
  vi.stubGlobal('caches', {});

  // Skriptet starter seg selv når det lastes og finner #offline-shell.
  vi.resetModules();
  await import('../../../../public/offline/offline-map.js');

  return {
    overskrift: document.getElementById('offline-heading')!,
    forklaring: document.getElementById('offline-reason'),
    tomListe: document.getElementById('area-empty')!,
    knapp: document.getElementById('retry') as HTMLButtonElement
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.cookie = 'MYCELET_LOCALE=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('offline-skallet i nettleseren', () => {
  it('har et eget, skjult avsnitt til forklaringen rett under overskriften', () => {
    document.body.innerHTML = SKALL;
    const forklaring = document.getElementById('offline-reason')!;
    expect(forklaring.hidden).toBe(true);
    expect(forklaring.previousElementSibling?.id).toBe('offline-heading');
  });

  it('sier at nettet ikke svarte når skallet står i stedet for siden brukeren ba om', async () => {
    // Gratisbruker, tregt nett, ba om en artsside. Før: «Offline-kart» og «Du
    // har ingen lagrede kartområder (krever Premium …)», uten forklaring.
    const { overskrift, forklaring, tomListe } = await startSkallet({ sti: '/species/41', paaNett: true });

    expect(overskrift.textContent).toBe('Nettet svarer ikke');
    expect(forklaring!.hidden).toBe(false);
    expect(forklaring!.textContent).toContain('Siden du ba om kom ikke fram');
    // Resten av skallet er som før — forklaringen kommer i tillegg, øverst.
    expect(tomListe.hidden).toBe(false);
    expect(tomListe.textContent).toContain(NB_INGEN_OMRAADER);
  });

  it('sier det på svensk når språket er svensk', async () => {
    const { overskrift, forklaring } = await startSkallet({ sti: '/species/41', paaNett: true, sprak: 'sv' });

    expect(overskrift.textContent).toBe('Nätet svarar inte');
    expect(forklaring!.hidden).toBe(false);
    expect(forklaring!.textContent).toContain('Sidan du bad om kom inte fram');
    expect(document.documentElement.lang).toBe('sv');
  });

  it('er svensk for en svensk nettleser uten språkcookie, slik appen er', async () => {
    // De fleste svenske brukerne har aldri rørt språkvelgeren: serveren leser
    // Accept-Language, så appen er svensk for dem uten cookien. Skallet leste
    // bare cookien, og sto derfor på norsk for dem — med «soppkontroll» i
    // sikkerhetsboksen — hver gang nettet var tregt.
    const { overskrift, forklaring, tomListe, knapp } = await startSkallet({
      sti: '/map',
      paaNett: true,
      sprak: null,
      nettleserSprak: ['sv-SE', 'sv', 'en']
    });

    // Ellers kunne en cookie fra en annen test ha gjort jobben.
    expect(document.cookie).not.toContain('MYCELET_LOCALE');
    expect(document.documentElement.lang).toBe('sv');
    expect(document.title).toBe('Mycelet — offlinekarta');
    expect(overskrift.textContent).toBe('Nätet svarar inte');
    expect(forklaring!.textContent).toContain('Sidan du bad om kom inte fram');
    expect(tomListe.textContent).toContain('Du har inga sparade kartområden');
    expect(knapp.textContent).toBe('Försök ladda appen igen');
    // Også teksten som står fast i HTML-en (data-sv), ikke bare den skriptet skriver.
    const side = document.querySelector('main')!.textContent!;
    expect(side).toContain('Ingen artsinformation utan nät');
    expect(side).toContain('svampkonsulent');
    expect(side).toContain('Sparade kartområden');
    expect(side).not.toMatch(/soppkontroll|Lagrede kartområder|Ingen artsinformasjon/);
  });

  it('bruker navigator.language når nettleseren ikke har en språkliste', async () => {
    const { overskrift } = await startSkallet({
      sti: '/species/41',
      paaNett: false,
      sprak: null,
      nettleserSprak: [],
      nettleserHovedsprak: 'sv-SE'
    });

    expect(overskrift.textContent).toBe('Du är utan nät');
    expect(document.documentElement.lang).toBe('sv');
  });

  it('lar språket brukeren har valgt i appen vinne over nettleserens', async () => {
    const { overskrift, knapp } = await startSkallet({
      sti: '/map',
      paaNett: true,
      sprak: 'nb',
      nettleserSprak: ['sv-SE', 'sv']
    });

    expect(document.documentElement.lang).toBe('nb');
    expect(document.title).toBe('Mycelet — offline-kart');
    expect(overskrift.textContent).toBe('Nettet svarer ikke');
    expect(knapp.textContent).toBe('Prøv å laste appen på nytt');
    expect(document.querySelector('main')!.textContent).toContain('Ingen artsinformasjon uten nett');
  });

  it('lar forklaringen være skjult når brukeren åpnet offline-kartet selv', async () => {
    const { overskrift, forklaring } = await startSkallet({ sti: '/offline', paaNett: true });

    expect(overskrift.textContent).toBe('Offline-kart');
    expect(forklaring!.hidden).toBe(true);
    expect(forklaring!.textContent).toBe('');
  });

  it('sier «uten nett» når enheten selv er frakoblet, uten forklaringen om tregt nett', async () => {
    const { overskrift, forklaring } = await startSkallet({ sti: '/species/41', paaNett: false });

    expect(overskrift.textContent).toBe('Du er uten nett');
    expect(forklaring!.hidden).toBe(true);
  });

  it('virker mot en eldre, cachet side som mangler forklaringsavsnittet', async () => {
    // Siden og skriptet precaches hver for seg, så det nye skriptet kan en
    // stund kjøre mot den gamle HTML-en. Da skal resten fortsatt komme opp.
    const { overskrift, forklaring, tomListe, knapp } = await startSkallet({
      sti: '/species/41',
      paaNett: true,
      eldreSide: true
    });

    expect(forklaring).toBeNull();
    expect(overskrift.textContent).toBe('Nettet svarer ikke');
    expect(knapp.textContent).toBe('Prøv å laste appen på nytt');
    expect(tomListe.textContent).toContain(NB_INGEN_OMRAADER);
  });

  it('låser knappen, sier fra til service workeren og slipper den igjen etter et minutt', async () => {
    vi.useFakeTimers();
    // jsdom kan ikke navigere, og sier fra om det på console.error når
    // location.reload() kalles. Det er nettopp kallet vi venter oss her.
    const konsollfeil = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const postMessage = vi.fn();
    vi.stubGlobal('navigator', Object.create(window.navigator, {
      serviceWorker: { value: { controller: { postMessage } } }
    }));

    const { knapp } = await startSkallet({ sti: '/species/41', paaNett: true });
    expect(knapp.getAttribute('aria-disabled')).toBeNull();

    knapp.click();

    expect(postMessage).toHaveBeenCalledWith({
      type: WAIT_FOR_NETWORK_MESSAGE,
      url: 'http://localhost:3000/species/41'
    });
    // I appen finnes det ingen lastestrek: knappen er det eneste tegnet på at
    // noe skjer.
    expect(knapp.getAttribute('aria-disabled')).toBe('true');
    expect(knapp.textContent).toBe('Venter på nettet …');
    // aria-disabled, ikke disabled: knappen skal beholde fokus for skjermleser.
    expect(knapp.disabled).toBe(false);
    expect(konsollfeil.mock.calls.flat().join(' ')).toContain('navigation');

    // Et trykk til mens den venter ville startet forespørselen forfra.
    knapp.click();
    knapp.click();
    expect(postMessage).toHaveBeenCalledTimes(1);

    // Sikkerhetsnettet: ble lastingen avbrutt, skal knappen ikke stå død.
    vi.advanceTimersByTime(60_000);
    expect(knapp.getAttribute('aria-disabled')).toBeNull();
    expect(knapp.textContent).toBe('Prøv å laste appen på nytt');

    knapp.click();
    expect(postMessage).toHaveBeenCalledTimes(2);
  });
});
