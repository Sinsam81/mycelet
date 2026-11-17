import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * «Lagre kartområde»: et forsøk som ikke fikk lagret én eneste flis, skal
 * aldri bli et område i lista.
 *
 * Lista legger det nye området øverst og kaster det eldste ut når den er full
 * — med flisene. På én strek dekning byttet et mislykket forsøk derfor ut et
 * ekte, nedlastet område mot et tomt, og kvitteringen sa at området var
 * lagret. Hjelperen avviser nå et slikt forsøk (testet i
 * src/lib/utils/__tests__/offlineMap-lagring.test.ts); her låses det at
 * kallstedet i kartet behandler avvisningen riktig, og at teksten er sann.
 * MushroomMap.tsx lastes ikke av noen test (Leaflet + DOM), derfor en kildevakt.
 */
const KILDE = readFileSync(new URL('../MushroomMap.tsx', import.meta.url), 'utf8');

function mellom(start: string, slutt: string): string {
  const fra = KILDE.indexOf(start);
  expect(fra, `fant ikke «${start}»`).toBeGreaterThan(-1);
  const til = KILDE.indexOf(slutt, fra + start.length);
  expect(til, `fant ikke «${slutt}» etter «${start}»`).toBeGreaterThan(fra);
  return KILDE.slice(fra, til);
}

const lagring = mellom('const saveCurrentAreaOffline = useCallback(async () => {', 'const passPeriodFilter');

describe('saveCurrentAreaOffline — null fliser gir aldri et lagret område', () => {
  it('sjekker tellingen FØR lista røres, også om hjelperen skulle slutte å kaste', () => {
    const sjekk = lagring.indexOf('if (cacheResult.cached === 0) {');
    expect(sjekk).toBeGreaterThan(-1);
    expect(sjekk).toBeGreaterThan(lagring.indexOf('await cacheMapTilesForArea('));
    for (const etter of ['saveOfflineAreas(next);', 'setOfflineAreas(next);', 'removeOfflineAreaTiles(evicted, next)']) {
      expect(lagring.indexOf(etter), etter).toBeGreaterThan(sjekk);
    }
    expect(lagring.slice(sjekk, sjekk + 140)).toMatch(/setOfflineStatus\(t\('offlineCacheFailed'\)\);\s*return;/);
  });

  it('avvisningen fra hjelperen gir feilteksten om fliser — ikke en kvittering', () => {
    const fanget = lagring.slice(lagring.indexOf('} catch (error) {'), lagring.indexOf('} finally {'));
    expect(fanget).toMatch(/error instanceof NoTilesCachedError\s*\? 'offlineCacheFailed'\s*: 'offlineSaveError'/);
    expect(fanget).not.toContain("t('offlineSaved'");
  });

  it('kvitteringen «lagret» skrives bare på veien der lista faktisk ble oppdatert', () => {
    const kvittering = lagring.indexOf("t('offlineSaved'");
    expect(kvittering).toBeGreaterThan(lagring.indexOf('saveOfflineAreas(next);'));
    expect(kvittering).toBeLessThan(lagring.indexOf('} catch (error) {'));
    // Den gamle grenen som lagret først og beklaget etterpå, er borte.
    expect(lagring).not.toContain('cacheResult.cached === 0 && cacheResult.failed > 0');
  });

  it('«lagrer …» slås av uansett utfall', () => {
    expect(lagring).toMatch(/finally \{\s*setOfflineBusy\(false\);/);
  });
});

describe('fliser som flere lagrede områder deler, slettes ikke med ett av dem', () => {
  // Regelen er testet i src/lib/utils/__tests__/offlineMap.test.ts. Her låses
  // det at begge kallstedene faktisk sender med områdene som skal beholdes —
  // uten dem sto et område igjen i lista med flisene sine slettet.
  it('utkastingen når lista er full verner områdene som blir igjen, også det som nettopp ble lagret', () => {
    expect(lagring).toContain('for (const evicted of kept.slice(8)) void removeOfflineAreaTiles(evicted, next);');
    expect(lagring.indexOf('const next = kept.slice(0, 8);')).toBeLessThan(
      lagring.indexOf('removeOfflineAreaTiles(evicted, next)')
    );
  });

  it('«Slett» verner de andre lagrede områdene', () => {
    const sletting = mellom('const deleteSavedArea = useCallback(', '[offlineAreas, refreshStorageUsage]');
    expect(sletting).toContain('if (area) await removeOfflineAreaTiles(area, offlineAreas);');
  });

  it('ingen kallsteder sletter et områdes fliser uten å si hva som skal stå igjen', () => {
    const kall = KILDE.match(/removeOfflineAreaTiles\(([^)]*)\)/g) ?? [];
    expect(kall.length).toBeGreaterThanOrEqual(2);
    for (const k of kall) expect(k, k).toMatch(/removeOfflineAreaTiles\([^,)]+, [^)]+\)/);
  });
});

describe('teksten når ingen fliser lot seg lagre', () => {
  const tekster = [
    ['nb', nb.MushroomMap.offlineCacheFailed],
    ['sv', sv.MushroomMap.offlineCacheFailed]
  ] as const;

  it('sier at området IKKE ble lagret — den gamle teksten sa «Området ble lagret, men uten offline-fliser»', () => {
    expect(nb.MushroomMap.offlineCacheFailed).toContain('ble ikke lagret');
    expect(sv.MushroomMap.offlineCacheFailed).toContain('sparades inte');
    for (const [sprak, tekst] of tekster) {
      expect(tekst, sprak).not.toMatch(/ble lagret, men|sparades, men/);
    }
  });

  it('sier at de lagrede områdene står urørt, og hva brukeren kan gjøre', () => {
    expect(nb.MushroomMap.offlineCacheFailed).toMatch(/urørt/);
    expect(nb.MushroomMap.offlineCacheFailed).toMatch(/bedre dekning/);
    expect(sv.MushroomMap.offlineCacheFailed).toMatch(/orörda/);
    expect(sv.MushroomMap.offlineCacheFailed).toMatch(/bättre täckning/);
  });
});

/**
 * Kvitteringen lover «klare offline» bare når det er sant.
 *
 * To veier til et lagret område med hull, begge uten et ord før:
 *  - utsnittet trengte flere fliser enn én lagring tar, og lista ble kuttet;
 *  - nettet falt ut midt i lagringen, og «30 kartfliser klare offline» nevnte
 *    ikke de 50 som manglet.
 * Reglene er prøvd i src/lib/utils/__tests__/offlineMap-lagring.test.ts og
 * offlineMap-zoomnivaer.test.ts. Her låses det at kartet bruker dem.
 */
describe('saveCurrentAreaOffline — kvitteringen er sann', () => {
  it('et for stort område gir sin egen tekst, og ingenting lagres', () => {
    const fanget = lagring.slice(lagring.indexOf('} catch (error) {'), lagring.indexOf('} finally {'));
    expect(fanget).toMatch(/error instanceof OfflineAreaTooLargeError\s*\? 'offlineAreaTooLarge'/);
    // Sjekkes før «ingen fliser»: det er to ulike råd (zoom inn / vent på dekning).
    expect(fanget.indexOf('OfflineAreaTooLargeError')).toBeLessThan(fanget.indexOf('NoTilesCachedError'));
    for (const etter of ['saveOfflineAreas(next);', 'setOfflineAreas(next);']) {
      expect(fanget).not.toContain(etter);
    }
  });

  it('sier fra når noen av flisene mangler, i stedet for å kalle området klart', () => {
    const kvittering = lagring.slice(lagring.indexOf('void refreshStorageUsage();'), lagring.indexOf('} catch (error) {'));
    expect(kvittering).toMatch(/cacheResult\.failed > 0\s*\? t\('offlineSavedPartial', \{/);
    expect(kvittering).toContain('failed: cacheResult.failed,');
    expect(kvittering).toContain('total: cacheResult.cached + cacheResult.failed');
    expect(kvittering).toMatch(/: t\('offlineSaved', \{ count: cacheResult\.cached \}\)/);
  });

  it('velger zoomnivåer med hjelperen, og husker nivået som faktisk ble lagret', () => {
    expect(lagring).toContain('const { zoom: lagretZoom, zoomLevels } = offlineZoomLevels(zoom, tileTemplate);');
    expect(lagring).toContain('zoom: lagretZoom,');
    // Den gamle regelen — alltid opp til 18, oversikten først — er borte.
    expect(lagring).not.toContain('Math.min(18, zoom + 1)');
  });

  it('kartlagene og offline-lagringen bruker de samme tallene for dypeste flisnivå', () => {
    for (const mal of ['TERRAIN_TILE_TEMPLATE', 'OSM_TILE_TEMPLATE', 'SATELLITE_TILE_TEMPLATE']) {
      expect(KILDE, mal).toContain(`maxNativeZoom: MAX_NATIVE_ZOOM[${mal}],`);
    }
    expect(KILDE).not.toMatch(/maxNativeZoom: \d+/);
  });

  it('tekstene finnes på begge språk og sier det som er sant', () => {
    // For stort: ikke lagret, zoom inn, det gamle står urørt.
    expect(nb.MushroomMap.offlineAreaTooLarge).toMatch(/for stort/);
    expect(nb.MushroomMap.offlineAreaTooLarge).toMatch(/Zoom inn/);
    expect(nb.MushroomMap.offlineAreaTooLarge).toMatch(/urørt/);
    expect(sv.MushroomMap.offlineAreaTooLarge).toMatch(/för stort/);
    expect(sv.MushroomMap.offlineAreaTooLarge).toMatch(/Zooma in/);
    expect(sv.MushroomMap.offlineAreaTooLarge).toMatch(/orörda/);
    // Delvis: lagret, men med hull — og hvor mange.
    for (const tekst of [nb.MushroomMap.offlineSavedPartial, sv.MushroomMap.offlineSavedPartial]) {
      expect(tekst).toContain('{failed}');
      expect(tekst).toContain('{total}');
      expect(tekst).not.toMatch(/klare offline|klara offline/);
    }
    expect(nb.MushroomMap.offlineSavedPartial).toMatch(/hull/);
    expect(sv.MushroomMap.offlineSavedPartial).toMatch(/hål/);
    // Den fulle kvitteringen er uendret, og er den eneste som sier «klare».
    expect(nb.MushroomMap.offlineSaved).toMatch(/klare offline/);
    expect(sv.MushroomMap.offlineSaved).toMatch(/klara offline/);
  });
});
