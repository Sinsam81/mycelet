// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import nb from '../../../../messages/nb.json';
import { LUKKEKNAPP_KLASSER } from '@/components/ui/useDialogFokus';
import type { PredictionResponse } from '@/types/prediction';
import { HotspotPanel } from '../HotspotPanel';
import { MapFilters } from '../MapFilters';
import { PlaceForecastStrip } from '../PlaceForecastStrip';
import { TREFF_44 } from '../trykkflate';

/**
 * Kontrollene på kartet betjenes ute, med tommelen. Flere av dem var 20–28 px
 * høye og sto tett: «Nullstill» på artsbrikken 20 px, kryssene i panelene
 * 22–24 px, knappene i verktøyraden 28 px, «Slett» 4 px fra «Gå til».
 *
 * jsdom har ingen layout, så testene her låser KLASSENE som gir flatene: en
 * ekte høyde på 44 px, lukkeknappens 44 × 44, eller den usynlige flaten i
 * TREFF_44. Selve geometrien prøves i nettleseren av e2e/map-geo.e2e.ts
 * («Trykkflater på kartet»), som spør hva et trykk 21 px fra midten treffer.
 */

// __dirname, ikke new URL(…, import.meta.url): under jsdom er den ikke en fil-URL.
const MAPPE = resolve(__dirname, '..');
const les = (navn: string) => readFileSync(resolve(MAPPE, navn), 'utf8');
const KART = les('MushroomMap.tsx');

function mellom(start: string, slutt: string): string {
  const fra = KART.indexOf(start);
  expect(fra, `fant ikke «${start}»`).toBeGreaterThan(-1);
  const til = KART.indexOf(slutt, fra + start.length);
  expect(til, `fant ikke «${slutt}» etter «${start}»`).toBeGreaterThan(fra);
  return KART.slice(fra, til);
}

/** Klassene på kolonnen øverst på kartet (søk, verktøyrad og menyene under). */
function kolonne(): string {
  const treff = KART.match(/<div className="(absolute left-1\/2 top-3 [^"]+)">/);
  expect(treff, 'fant ikke kolonnen øverst på kartet').toBeTruthy();
  return treff![1];
}

function konstant(navn: string): string {
  const treff = KART.match(new RegExp(`const ${navn} =\\s*(?:\`([^\`]+)\`|'([^']+)')`));
  expect(treff, `fant ikke konstanten ${navn}`).toBeTruthy();
  return (treff![1] ?? treff![2]).replace('${TREFF_44}', TREFF_44);
}

function medTekster(node: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="nb" messages={nb as never} timeZone="Europe/Oslo">
      {node}
    </NextIntlClientProvider>
  );
}

const har44 = (klasser: string) => /\bmin-h-\[44px\]/.test(klasser) || /\bh-11\b/.test(klasser);
const harFlate = (klasser: string) => klasser.includes(TREFF_44);
/** `relative` og `absolute` sammen slår hverandre ut — da ble en kartknapp stående midt i flyten. */
const erPosisjonert = (klasser: string) => /(^|\s)(relative|absolute)(\s|$)/.test(klasser);
const posisjonsklasser = (klasser: string) => klasser.split(/\s+/).filter((k) => k === 'relative' || k === 'absolute' || k === 'fixed');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TREFF_44', () => {
  it('er en flate på minst 44 × 44 px, sentrert på elementet', () => {
    for (const klasse of [
      'after:absolute',
      'after:min-h-[44px]',
      'after:min-w-[44px]',
      'after:h-full',
      'after:w-full',
      'after:left-1/2',
      'after:top-1/2',
      'after:-translate-x-1/2',
      'after:-translate-y-1/2',
      "after:content-['']"
    ]) {
      expect(TREFF_44.split(' '), klasse).toContain(klasse);
    }
  });

  it('setter ikke selv en posisjon — flere av kontrollene er alt absolute', () => {
    expect(posisjonsklasser(TREFF_44)).toEqual([]);
  });

  it('lukkeknappen fra dialogene er en ekte 44 × 44 px knapp', () => {
    expect(LUKKEKNAPP_KLASSER).toMatch(/\bh-11\b/);
    expect(LUKKEKNAPP_KLASSER).toMatch(/\bw-11\b/);
  });
});

describe('verktøyraden øverst på kartet', () => {
  it('knappene er 36 px høye med en flate på 44 px, og radene står 8 px fra hverandre', () => {
    const knapp = konstant('VERKTOYKNAPP');
    expect(knapp).toMatch(/\bpy-2\.5\b/); // 16 px linje + 2 × 10 px = 36 px
    expect(knapp).toMatch(/\btext-xs\b/);
    expect(harFlate(knapp)).toBe(true);
    expect(posisjonsklasser(knapp)).toEqual(['relative']);
    // 36 + 8 = 44: flatene møtes uten å overlappe.
    expect(KART).toContain('<div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2">');
    expect(kolonne()).toMatch(/\bflex-col items-center gap-2$/);
  });

  it('kolonnen ligger over pillen og de runde knappene, og menyene i den ruller på et lavt kart', () => {
    // Målt i nettleseren på et 450 px høyt kart: funnfilteret rakk ned til
    // pillen nederst, som lå over det — «Siste 10 år» lot seg ikke trykke på.
    const klasser = kolonne().split(' ');
    expect(klasser).toContain('z-[1001]');
    expect(klasser).toContain('max-h-[calc(100%-1.5rem)]');
    for (const id of ['map-more-tools', 'map-occ-filters']) {
      const panel = KART.match(new RegExp(`<div id="${id}" className="([^"]+)"`))?.[1].split(' ') ?? [];
      expect(panel, id).toEqual(expect.arrayContaining(['min-h-0', 'overflow-y-auto']));
    }
  });

  it('alle knappene i raden bruker den', () => {
    const rad = mellom('<div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2">', '{toolsOpen ? (');
    const knapper = rad.match(/<button\b[^]*?>\n/g) ?? [];
    expect(knapper.length).toBe(4);
    for (const knapp of knapper) expect(knapp).toContain('${VERKTOYKNAPP}');
  });

  it('GPX står ikke lenger som femte knapp — den ligger i «Mer», bare når det finnes områder å ta med', () => {
    const rad = mellom('<div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2">', '{toolsOpen ? (');
    expect(rad).not.toContain('eksporterTopSpotsGpx');
    const meny = mellom('<div id="map-more-tools"', '{gpxTekst ? <GpxKopierModal');
    expect(meny).toMatch(/\{topSpots\?\.length && !topLoading \? \([^]*?eksporterTopSpotsGpx\(\);[^]*?t\('gpxTopSpotsHeading'\)/);
    // Det synlige navnet er med i det opplest navnet (WCAG 2.5.3).
    expect(nb.MushroomMap.gpxTopSpotsLabel.toLowerCase()).toContain(nb.MushroomMap.gpxTopSpotsHeading.toLowerCase());
  });

  it('«Nullstill» på artsbrikken og «Avslutt» på turbrikken har flate på 44 px', () => {
    for (const [start, slutt] of [
      ['{selectedSpeciesName ? (', "{t('reset')}"],
      ['{FLAGS.tripMode && tripActive ? (', "{t('endTrip')}"]
    ]) {
      const klasser = mellom(start, slutt).match(/<button[^]*?className=\{`([^`]+)`\}/)?.[1] ?? '';
      expect(klasser, start).toContain('${TREFF_44}');
      expect(posisjonsklasser(klasser), start).toEqual(['relative']);
    }
  });

  it('søkefeltet får flaten sin fra etiketten rundt — et <input> kan ikke ha ::after', () => {
    const sok = mellom('<label className="-my-1 block py-1">', '</label>');
    expect(sok).toContain('value={speciesSearch}');
    expect(sok).toMatch(/className="h-9 w-full /); // 36 px + 2 × 4 px polstring i etiketten
  });

  it('forslagene under søkefeltet er 44 px høye rader', () => {
    const forslag = mellom('{speciesSuggestions.length > 0 || placeSuggestions.length > 0 ? (', '{searchedPlace ? (');
    const rader = forslag.match(/<button\b[^]*?className="([^"]+)"/g) ?? [];
    expect(rader.length).toBe(2);
    for (const rad of rader) expect(har44(rad)).toBe(true);
  });

  it('Premium-låsen har flate på 44 px', () => {
    const klasser = mellom("topAccess === 'free_limited' && topSpots ? (", "t('seeAll12Premium')").match(/className=\{`([^`]+)`\}/)?.[1] ?? '';
    expect(klasser).toContain('${TREFF_44}');
    expect(posisjonsklasser(klasser)).toEqual(['relative']);
  });
});

describe('panelene på kartet', () => {
  it('radene i «Mer»-menyen er 44 px høye', () => {
    expect(har44(konstant('MENYRAD'))).toBe(true);
    const meny = mellom('<div id="map-more-tools"', '{gpxTekst ? <GpxKopierModal');
    const rader = meny.match(/<button\b[^]*?>\n/g) ?? [];
    // Krysset + bilder + offline-kart + GPX + tur.
    expect(rader.length).toBe(5);
    expect(rader.filter((r) => r.includes('MENYRAD')).length).toBe(4);
    expect(rader.filter((r) => r.includes('LUKKEKNAPP_KLASSER')).length).toBe(1);
    // Lenka til prissiden er ikke en knapp: blokk med polstring, 16 + 2 × 14 px.
    expect(meny).toMatch(/<Link href="\/pricing" className="block rounded-lg px-2 py-3\.5 text-xs /);
  });

  it('valgene i funnfilteret er 36 px høye med flate på 44 px, og radene står 8 px fra hverandre', () => {
    const valg = konstant('FILTERVALG');
    expect(valg).toMatch(/\bpy-2\.5\b/);
    expect(harFlate(valg)).toBe(true);
    expect(posisjonsklasser(valg)).toEqual(['relative']);
    const panel = mellom('<div id="map-occ-filters"', '{/* The prediction verdict');
    const knapper = panel.match(/<button\b[^]*?>\n/g) ?? [];
    expect(knapper.filter((k) => k.includes('${FILTERVALG}')).length).toBe(3);
    expect(panel.match(/gap-y-2/g)?.length).toBe(2);
    expect(panel.match(/pb-2/g)?.length).toBe(2);
    // Ingen innrykk på radene: med px-1 falt det tredje årsvalget ned på egen linje.
    expect(panel).not.toMatch(/className="[^"]*\bpx-1\b/);
  });

  it('knappene i offline-panelet er 44 px høye, og «Slett» står ikke lenger 4 px fra «Gå til»', () => {
    expect(har44(konstant('PANELKNAPP'))).toBe(true);
    const panel = mellom('{offlineOpen ? (', "{t('offlineShellHint')}");
    expect(panel.match(/\$\{PANELKNAPP\}/g)?.length).toBe(4);
    expect(panel).toContain('<div className="mt-1 flex flex-wrap gap-2">');
    const lagre = mellom('onClick={() => void saveCurrentAreaOffline()}', '<Download');
    expect(har44(lagre)).toBe(true);
  });

  it('ingen kryss i kartkomponentene er den gamle 22–24 px knappen', () => {
    for (const navn of readdirSync(MAPPE).filter((n) => /\.tsx$/.test(n))) {
      expect(les(navn), navn).not.toMatch(/className="[^"]*\brounded-full p-1\b[^"]*"/);
    }
    expect(KART.match(/className=\{LUKKEKNAPP_KLASSER\}/g)?.length).toBe(3);
  });

  it('krysset i en Leaflet-popup får 10 px flate på hver side når popupen åpnes', () => {
    expect(KART).toContain("const POPUPKRYSS_TREFF = ['after:absolute', 'after:-inset-2.5', \"after:content-['']\"];");
    expect(KART).toContain('kryss.classList.add(...POPUPKRYSS_TREFF);');
  });

  it('Leaflets zoomknapper tegnes 36 px og får flate til 44 × 44 — hver sin vei, de står kant i kant', () => {
    const liste = (navn: string) => {
      const treff = KART.match(new RegExp(`const ${navn} = \\[(.+?)\\];\\n`));
      expect(treff, navn).toBeTruthy();
      return [...treff![1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]);
    };
    const felles = liste('ZOOMKNAPP');
    // 36 px i hver retning (Leaflets egne 30 px er mer spesifikke, derfor !),
    // og 4 px flate til hver side.
    expect(felles).toEqual(expect.arrayContaining(['relative', '!h-9', '!w-9', '!leading-9', 'after:absolute', 'after:-inset-x-1']));
    // «Inn» vokser 8 px oppover, «ut» 8 px nedover — aldri mot hverandre.
    expect(liste('ZOOMKNAPP_INN')).toEqual(['after:-top-2', 'after:bottom-0']);
    expect(liste('ZOOMKNAPP_UT')).toEqual(['after:top-0', 'after:-bottom-2']);
    expect(KART).toContain("zoomflate?.querySelector('.leaflet-control-zoom-in')?.classList.add(...ZOOMKNAPP, ...ZOOMKNAPP_INN);");
    expect(KART).toContain("zoomflate?.querySelector('.leaflet-control-zoom-out')?.classList.add(...ZOOMKNAPP, ...ZOOMKNAPP_UT);");
  });

  it('offline-panelet står under verktøyraden, som nå er høyere', () => {
    expect(mellom('{offlineOpen ? (', 'overflow-y-auto')).toContain('top-36 z-[1050] max-h-[calc(100%-10rem)]');
  });
});

describe('MapFilters', () => {
  const filtre = { speciesId: 3, period: 'month' as const, onlyMine: false };
  const tegn = () =>
    medTekster(<MapFilters filters={filtre} onChange={() => {}} speciesName="Kantarell" onClearSpecies={() => {}} />);

  it('knappen som åpner arket har flate på 44 px uten å miste plassen sin', () => {
    tegn();
    const knapp = screen.getByRole('button', { name: /Filtre/ });
    expect(harFlate(knapp.className)).toBe(true);
    expect(posisjonsklasser(knapp.className)).toEqual(['absolute']);
  });

  it('arket: kryss, «Nullstill art», periode og «Kun mine funn» er alle 44 px', () => {
    tegn();
    fireEvent.click(screen.getByRole('button', { name: /Filtre/ }));

    expect(screen.getByRole('button', { name: 'Lukk filtre' }).className).toBe(LUKKEKNAPP_KLASSER);

    const nullstill = screen.getByRole('button', { name: 'Nullstill art' });
    expect(harFlate(nullstill.className)).toBe(true);
    expect(erPosisjonert(nullstill.className)).toBe(true);
    // Raden er selv 44 px, så flaten blir inne i den og når ikke krysset over.
    expect(har44(nullstill.parentElement!.className)).toBe(true);

    expect(har44(screen.getByLabelText('Periode').className)).toBe(true);
    expect(har44(screen.getByRole('checkbox', { name: 'Kun mine funn' }).closest('label')!.className)).toBe(true);
  });
});

describe('HotspotPanel', () => {
  const data = {
    score: 57,
    condition: 'good',
    weather: { temperature: 12, humidity: 80, rain3dMm: 6 },
    counts: { findingsInArea: 0, recent30d: 0, recent365d: 0 },
    hotspots: [],
    leadingSpecies: { id: 1, norwegianName: 'Kantarell', swedishName: null, displayName: 'Kantarell' }
  } as unknown as PredictionResponse;
  const tegn = () => medTekster(<HotspotPanel speciesId={null} data={data} isLoading={false} error={false} />);

  it('pillen stopper før posisjonsknappen, og artsnavnet er det som gir etter', () => {
    tegn();
    const pille = screen.getByRole('button', { name: /Kantarell/ });
    // Knappen står 4rem inn fra høyre kant og pillen 0,75rem inn fra venstre:
    // med høyst «100% − 5rem» slutter pillen 4 px før knappen.
    expect(pille.className).toContain('max-w-[calc(100%-5rem)]');
    expect(pille.className).not.toContain('max-w-[calc(100%-1.5rem)]');
    expect(pille.className.split(' ')).toEqual(expect.arrayContaining(['left-3', 'bottom-20']));
    expect(KART).toContain('className="absolute bottom-20 right-4 z-[1000] flex h-12 w-12 ');
    expect(screen.getByText('Kantarell').className).toContain('truncate');
    expect(screen.getByText('57/100').className).toContain('shrink-0');
  });

  it('pillen har flate på 44 px uten å miste plassen sin', () => {
    tegn();
    const pille = screen.getByRole('button', { name: /Kantarell/ });
    expect(harFlate(pille.className)).toBe(true);
    expect(posisjonsklasser(pille.className)).toEqual(['absolute']);
  });

  it('åpent panel: krysset er 44 × 44, og «tekniske detaljer» har 44 px med ekte polstring', () => {
    tegn();
    fireEvent.click(screen.getByRole('button', { name: /Kantarell/ }));
    const lukk = screen.getByRole('button', { name: 'Lukk' });
    expect(lukk.className).toBe(LUKKEKNAPP_KLASSER);
    // Det åpne panelet når opp i verktøyraden på en liten skjerm, og skal
    // ligge over den — ellers havner krysset under knappene der.
    const panel = lukk.closest('.absolute')!;
    expect(panel.className.split(' ')).toContain('z-[1002]');

    const detaljer = screen.getByRole('button', { name: 'Vis tekniske detaljer' });
    // 16 px over + 16,5 px linje + 12 px under. Negativ marg holder teksten der den sto.
    for (const klasse of ['pt-4', 'pb-3', '-mt-2', '-mb-3']) expect(detaljer.className.split(' ')).toContain(klasse);
    // Ikke en ::after-flate: nederst i en rulleflate ville den gjort panelet rullbart.
    expect(detaljer.className).not.toContain('after:');
    expect(detaljer.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(detaljer);
    expect(screen.getByRole('button', { name: 'Skjul tekniske detaljer' }).getAttribute('aria-expanded')).toBe('true');
  });
});

describe('PlaceForecastStrip', () => {
  it('krysset — den eneste veien ut av det søkte stedet — er 44 × 44 px', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ days: [] }), { status: 200 }))
    );
    const onClear = vi.fn();
    medTekster(<PlaceForecastStrip place={{ name: 'Hamar', lat: 60.79, lng: 11.07 }} onClear={onClear} />);
    const kryss = screen.getByRole('button', { name: 'Nullstill' });
    expect(kryss.className).toBe(LUKKEKNAPP_KLASSER);
    fireEvent.click(kryss);
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('AddFindingSheet', () => {
  const ARK = les('AddFindingSheet.tsx');

  it('typevelgeren, artsforslagene og «fjern bilde» har 44 px', () => {
    expect(ARK.match(/relative flex-1 rounded-md px-3 py-2 text-sm font-medium transition \$\{TREFF_44\}/g)?.length).toBe(2);
    expect(ARK).toContain('className="flex min-h-[44px] w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50"');
    expect(ARK).toContain('className={`relative text-xs font-medium text-red-700 hover:underline ${TREFF_44}`}');
  });

  it('«søk etter posisjonen på nytt» tar ikke trykk fra posisjonsvalget rett over', () => {
    const knapp = ARK.slice(ARK.indexOf('onClick={sokPaaNytt}'), ARK.indexOf("{t('positionRetry')}"));
    // 8 px opp (mellomrommet), 16 px tekst, 20 px ned = 44 px.
    expect(knapp).toContain('after:-top-2');
    expect(knapp).toContain('after:-bottom-5');
    expect(knapp).not.toContain('after:top-1/2');
  });
});
