import { describe, expect, it, vi } from 'vitest';
import { getUserLocale } from '@/i18n/locale';
import {
  OSM_TILE_TEMPLATE,
  TERRAIN_TILE_TEMPLATE,
  getTileUrlsForBounds
} from '../offlineMap';
import {
  TILE_SIZE,
  WAIT_FOR_NETWORK_MESSAGE,
  buildTileGrid,
  latLngToTile,
  parseAreas,
  projectToGrid,
  readLocale,
  retryWithNetworkWait,
  shellIntro,
  shellReason,
  tileUrl
} from '../../../../public/offline/offline-map.js';

const OSLO_BOUNDS = { south: 59.85, west: 10.6, north: 59.96, east: 10.9 };

/**
 * Forespørselen getUserLocale leser: språkcookien og Accept-Language. Brukes av
 * testen som holder skallets språkregel i takt med serverens.
 */
const foresporsel = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  acceptLanguage: ''
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (navn: string) =>
      navn === 'MYCELET_LOCALE' && foresporsel.cookie !== undefined ? { value: foresporsel.cookie } : undefined
  }),
  headers: async () => ({
    get: (navn: string) => (navn.toLowerCase() === 'accept-language' ? foresporsel.acceptLanguage : null)
  })
}));

/** Accept-Language slik nettleseren bygger den av navigator.languages: «sv-SE,sv;q=0.9,en;q=0.8». */
function acceptLanguage(languages: readonly string[]): string {
  return languages
    .map((tag, i) => (i === 0 ? tag : `${tag};q=${Math.max(0.1, 1 - i / 10).toFixed(1)}`))
    .join(',');
}

describe('offline-skallet (public/offline/offline-map.js)', () => {
  it('spør etter nøyaktig de flis-URL-ene lagringen la i cachen', () => {
    // Dette er hele poenget med skallet: det skal vise fliser som ALLEREDE
    // ligger i mycelet-map-tiles-v1. Bommer den ene URL-en på den andre med ett
    // tegn — {s}-subdomenet, rekkefølgen på {x}/{y} — blir kartet tomt i skogen
    // uten at noe feiler synlig.
    for (const template of [TERRAIN_TILE_TEMPLATE, OSM_TILE_TEMPLATE]) {
      const saved = new Set(getTileUrlsForBounds(OSLO_BOUNDS, 12, template));
      const grid = buildTileGrid(OSLO_BOUNDS, 12);

      expect(grid.tiles.length).toBeGreaterThan(0);
      for (const tile of grid.tiles) {
        expect(saved, `${template} → ${tile.x}/${tile.y}`).toContain(tileUrl(template, tile.x, tile.y, 12));
      }
    }
  });

  it('bruker samme flis-matematikk som lagringen', () => {
    // Samme fasit som offlineMap.test.ts: 12/2170/1191 er flisa med Oslo i seg.
    expect(latLngToTile(59.91, 10.75, 12)).toEqual({ x: 2170, y: 1191 });
    expect(latLngToTile(57.7089, 11.9746, 12)).toEqual({ x: 2184, y: 1239 });
  });

  it('dekker hele det lagrede området', () => {
    const grid = buildTileGrid(OSLO_BOUNDS, 12);

    for (const [lat, lng] of [
      [OSLO_BOUNDS.north, OSLO_BOUNDS.west],
      [OSLO_BOUNDS.south, OSLO_BOUNDS.east]
    ] as const) {
      const point = projectToGrid(grid, lat, lng);
      expect(point.inside, `${lat},${lng} må ligge i rutenettet`).toBe(true);
    }
  });

  it('setter posisjonsprikken der brukeren faktisk står', () => {
    const grid = buildTileGrid(OSLO_BOUNDS, 12);
    const west = projectToGrid(grid, 59.91, OSLO_BOUNDS.west + 0.01);
    const east = projectToGrid(grid, 59.91, OSLO_BOUNDS.east - 0.01);
    const north = projectToGrid(grid, OSLO_BOUNDS.north - 0.01, 10.75);
    const south = projectToGrid(grid, OSLO_BOUNDS.south + 0.01, 10.75);

    // Øst er til høyre, sør er nedover. Snur et fortegn seg, peker prikken feil
    // vei i terrenget — verre enn ingen prikk.
    expect(east.x).toBeGreaterThan(west.x);
    expect(south.y).toBeGreaterThan(north.y);

    // Prikken skal treffe innenfor flisa den hører hjemme i.
    const tile = latLngToTile(59.91, 10.75, 12);
    const point = projectToGrid(grid, 59.91, 10.75);
    expect(Math.floor(point.x / TILE_SIZE) + grid.minX).toBe(tile.x);
    expect(Math.floor(point.y / TILE_SIZE) + grid.minY).toBe(tile.y);
  });

  it('vet at brukeren står utenfor kartområdet', () => {
    const grid = buildTileGrid(OSLO_BOUNDS, 12);
    // Trondheim, langt utenfor et lagret Oslo-område.
    expect(projectToGrid(grid, 63.43, 10.4).inside).toBe(false);
  });

  it('klipper svære områder ned til et rutenett vi klarer å tegne', () => {
    const heleNorden = { south: 55, west: 4, north: 71, east: 31 };
    const grid = buildTileGrid(heleNorden, 12);

    expect(grid.columns).toBeLessThanOrEqual(12);
    expect(grid.rows).toBeLessThanOrEqual(12);
    expect(grid.tiles.length).toBe(grid.columns * grid.rows);
  });

  it('overlever tull i localStorage', () => {
    expect(parseAreas(null)).toEqual([]);
    expect(parseAreas('{ikke json')).toEqual([]);
    expect(parseAreas('{"nope":1}')).toEqual([]);
    expect(parseAreas('[{"name":"uten bounds","zoom":12}]')).toEqual([]);

    const gyldig = '[{"name":"Nordmarka","zoom":12,"bounds":{"north":60,"south":59.9,"east":11,"west":10.9}}]';
    expect(parseAreas(gyldig)).toHaveLength(1);
  });

  it('velger språk som serveren: cookien først, ellers nettleserens språk', () => {
    // Språkvelgeren setter cookien, og et valg brukeren har gjort, vinner.
    expect(readLocale('MYCELET_LOCALE=sv')).toBe('sv');
    expect(readLocale('foo=1; MYCELET_LOCALE=sv; bar=2')).toBe('sv');
    expect(readLocale('MYCELET_LOCALE=nb')).toBe('nb');
    expect(readLocale('')).toBe('nb');
    // Ikke la et annet cookienavn som slutter likt lure oss.
    expect(readLocale('ANNET_LOCALE=sv')).toBe('nb');
    expect(readLocale('MYCELET_LOCALE=nb', ['sv-SE'])).toBe('nb');
    expect(readLocale('MYCELET_LOCALE=sv', ['nb-NO'])).toBe('sv');

    // Uten cookie: nettleserens språk. Slik har de fleste svenske brukerne det —
    // appen er svensk for dem fra før, så de har aldri trengt språkvelgeren.
    // Skallet sto likevel på norsk for dem, også når nettet bare var tregt.
    expect(readLocale('', ['sv-SE'])).toBe('sv');
    expect(readLocale('', ['sv-SE', 'sv', 'en-US', 'en'])).toBe('sv');
    expect(readLocale('', ['en-US', 'sv'])).toBe('sv');
    expect(readLocale('ANNET_LOCALE=nb', ['sv-SE'])).toBe('sv');
    expect(readLocale('', ['nb-NO'])).toBe('nb');
    expect(readLocale('', ['en-US', 'en'])).toBe('nb');
    // En ukjent cookieverdi ignoreres, slik isLocale gjør på serveren.
    expect(readLocale('MYCELET_LOCALE=de', ['sv-SE'])).toBe('sv');
    expect(readLocale('MYCELET_LOCALE=de', ['nb-NO'])).toBe('nb');
    // navigator.language kan mangle, og eldre nettlesere har ikke lista.
    expect(readLocale('', [undefined])).toBe('nb');
    expect(readLocale('', [])).toBe('nb');
    expect(readLocale('', null)).toBe('nb');
  });

  it('lander på samme språk som serveren for samme cookie og nettleser', async () => {
    // Skallet står i stedet for en side serveren ville ha tegnet, og skal
    // snakke samme språk som den. Derfor sammenlignes regelen med getUserLocale
    // selv, ikke med en kopi av den: endres serverens regel, feiler denne
    // testen til skallets regel er endret på samme måte.
    const nettlesere: string[][] = [
      ['sv-SE', 'sv', 'en-US', 'en'],
      ['sv'],
      ['en-US', 'en', 'sv'],
      ['fi-FI', 'sv-FI'],
      ['nb-NO', 'nb', 'en'],
      ['nb-NO', 'sv-SE'],
      ['nn-NO'],
      ['da-DK', 'en'],
      ['en-GB'],
      []
    ];

    for (const cookie of [undefined, 'nb', 'sv', 'de']) {
      for (const languages of nettlesere) {
        foresporsel.cookie = cookie;
        foresporsel.acceptLanguage = acceptLanguage(languages);
        const cookieString = cookie === undefined ? '' : `MYCELET_LOCALE=${cookie}`;

        expect(
          readLocale(cookieString, languages),
          `cookie ${cookie ?? '(ingen)'}, Accept-Language «${foresporsel.acceptLanguage}»`
        ).toBe(await getUserLocale());
      }
    }
  });
});

/**
 * Skallet precaches for ALLE, og service workeren svarer med det når en side
 * ikke kommer fram innen fristen. Før hadde det bare to tilstander — «uten
 * nett» og «Offline-kart» — valgt av navigator.onLine alene. En gratisbruker på
 * tregt nett fikk dermed «Offline-kart» og «Du har ingen lagrede kartområder»
 * i stedet for artssiden hen ba om, uten ett ord om at det var nettet som ikke
 * svarte.
 */
describe('offline-skallet: hvorfor vises det?', () => {
  it('skiller «nettet svarte ikke» fra «du åpnet offline-kartet selv»', () => {
    // Påkoblet, men på en annen adresse enn skallets egen: da er det service
    // workeren som har svart med skallet i stedet for siden.
    expect(shellReason('/species/41', true)).toBe('noResponse');
    expect(shellReason('/', true)).toBe('noResponse');
    expect(shellReason('/map', true)).toBe('noResponse');
    // En side som bare LIGNER på skallets adresse er fortsatt en annen side.
    expect(shellReason('/offline-kart', true)).toBe('noResponse');

    // Skallets egne adresser (rewrite-en i next.config.js og fila bak den).
    expect(shellReason('/offline', true)).toBe('direct');
    expect(shellReason('/offline/', true)).toBe('direct');
    expect(shellReason('/offline/index.html', true)).toBe('direct');
  });

  it('lar «uten nett» vinne når enheten selv sier den er frakoblet', () => {
    expect(shellReason('/species/41', false)).toBe('offline');
    expect(shellReason('/offline', false)).toBe('offline');
  });

  it('sier at nettet ikke svarte, og at knappen venter lenger — på norsk og svensk', () => {
    const nb = shellIntro('nb', 'noResponse');
    expect(nb.heading).toBe('Nettet svarer ikke');
    expect(nb.note).toContain('kom ikke fram');
    expect(nb.note).toContain('venter da lenger på nettet');

    const sv = shellIntro('sv', 'noResponse');
    expect(sv.heading).toBe('Nätet svarar inte');
    expect(sv.note).toContain('kom inte fram');
    expect(sv.note).toContain('väntar då längre på nätet');
    // Ekte svensk, ikke den norske teksten en gang til.
    expect(sv.note).not.toBe(nb.note);
    expect(sv.note).not.toMatch(/\bikke\b|\bsiden\b/i);
  });

  it('lover ikke lagrede kart og krever ikke Premium i forklaringen', () => {
    // Forklaringen vises også for dem som aldri har lagret et kart. Den skal
    // handle om nettet, ikke om et abonnement.
    for (const locale of ['nb', 'sv'] as const) {
      const { note } = shellIntro(locale, 'noResponse');
      expect(note).not.toMatch(/premium|sesongpass|säsongspass/i);
    }
  });

  it('beholder de to gamle overskriftene, uten forklaring', () => {
    expect(shellIntro('nb', 'offline')).toEqual({ heading: 'Du er uten nett', note: null });
    expect(shellIntro('nb', 'direct')).toEqual({ heading: 'Offline-kart', note: null });
    expect(shellIntro('sv', 'offline')).toEqual({ heading: 'Du är offline', note: null });
    expect(shellIntro('sv', 'direct')).toEqual({ heading: 'Offlinekarta', note: null });
  });
});

describe('offline-skallet: «Prøv å laste appen på nytt»', () => {
  const HREF = 'https://www.mycelet.com/species/41';

  it('sier fra til service workeren FØR siden lastes på nytt', () => {
    // Rekkefølgen er hele poenget: meldingen ber workeren vente på nettet uten
    // frist, og må være sendt før navigasjonen den gjelder starter.
    const rekkefolge: string[] = [];
    const postMessage = vi.fn(() => rekkefolge.push('melding'));
    const reload = vi.fn(() => rekkefolge.push('last på nytt'));

    retryWithNetworkWait({ serviceWorker: { controller: { postMessage } } }, HREF, reload);

    expect(postMessage).toHaveBeenCalledWith({ type: WAIT_FOR_NETWORK_MESSAGE, url: HREF });
    expect(rekkefolge).toEqual(['melding', 'last på nytt']);
  });

  it('laster på nytt selv om ingen service worker hører etter', () => {
    const utenWorker = [
      undefined,
      null,
      {},
      { serviceWorker: null },
      { serviceWorker: { controller: null } }
    ];
    for (const nav of utenWorker) {
      const reload = vi.fn();
      retryWithNetworkWait(nav, HREF, reload);
      expect(reload).toHaveBeenCalledTimes(1);
    }
  });

  it('laster på nytt selv om meldingen eller oppslaget kaster', () => {
    const reload = vi.fn();
    retryWithNetworkWait(
      {
        serviceWorker: {
          controller: {
            postMessage: () => {
              throw new Error('InvalidStateError');
            }
          }
        }
      },
      HREF,
      reload
    );
    expect(reload).toHaveBeenCalledTimes(1);

    // Der lagring er sperret kan selve oppslaget av navigator.serviceWorker kaste.
    const sperret = {
      get serviceWorker(): never {
        throw new Error('SecurityError');
      }
    };
    retryWithNetworkWait(sperret, HREF, reload);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
