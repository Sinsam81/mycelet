import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Funnlaget skal bare tegnes av den NYESTE hentingen.
 *
 * Flisene (tileReqRef) og de registrerte funnene (occLoadGenRef) hadde et slikt
 * vern; funnlaget manglet det. Der er følgen verst: en treg henting av alles
 * funn, startet før «Kun mine funn» ble krysset av, kunne bli ferdig etter den
 * raske hentingen av egne funn — og tegne andres funn under en avkrysning som
 * sier «mine».
 *
 * MushroomMap.tsx lastes ikke av noen test (Leaflet + DOM), så dette er en
 * kildevakt — samme grep som heat-layer-no-grid- og topSpotArea-testene. Den
 * låser REKKEFØLGEN i loadFindings, som er hele vernet.
 */
const KILDE = readFileSync(new URL('../MushroomMap.tsx', import.meta.url), 'utf8');

function loadFindingsKilde(): string {
  const start = KILDE.indexOf('const loadFindings = useCallback(async () => {');
  expect(start, 'fant ikke loadFindings').toBeGreaterThan(-1);
  const slutt = KILDE.indexOf('useEffect(() => {\n    loadFindingsRef.current = loadFindings;', start);
  expect(slutt, 'fant ikke slutten på loadFindings').toBeGreaterThan(start);
  return KILDE.slice(start, slutt);
}

describe('loadFindings — bare den nyeste hentingen får tegne', () => {
  const blokk = loadFindingsKilde();
  const nyGenerasjon = blokk.indexOf('++findingsGenRef.current');
  const tomGren = blokk.indexOf('filters.onlyMine && !currentUserId');
  const henting = blokk.indexOf("supabase.rpc('get_findings_in_bounds'");
  const sjekk = blokk.indexOf('gen !== findingsGenRef.current');
  const feilgren = blokk.indexOf('if (error) {');
  const lagsjekk = blokk.indexOf('funnlag.klynger !== clusters || clusterRef.current !== clusters');
  const bytte = blokk.indexOf('if (findingsLayerShowsRef.current !== viser) funnlag.tom();');
  const avstemming = blokk.indexOf('funnlag.synk(filtered,');

  it('tar en ny generasjon før noe annet — også før grenen som bare tømmer laget', () => {
    expect(nyGenerasjon).toBeGreaterThan(-1);
    expect(tomGren).toBeGreaterThan(nyGenerasjon);
    expect(henting).toBeGreaterThan(nyGenerasjon);
  });

  it('forkaster svaret fra en henting som er forbigått, før feilgrenen og før noe tegnes', () => {
    expect(sjekk).toBeGreaterThan(henting);
    expect(sjekk).toBeLessThan(feilgren);
    expect(avstemming).toBeGreaterThan(sjekk);
  });

  it('har ingen venting etter generasjonssjekken — to kjøringer kan ikke flette seg i laget', () => {
    // Lå det en await mellom sjekken og tegningen (Leaflet-importen gjorde det
    // en gang), kunne to overlappende kjøringer etterlate begge settene i
    // laget. Uten venting holder én sjekk.
    expect(blokk.match(/gen !== findingsGenRef\.current/g)).toHaveLength(1);
    expect(blokk.slice(sjekk)).not.toMatch(/\bawait\b/);
  });

  it('rører ikke et lag som hører til et utskiftet kart', () => {
    expect(lagsjekk).toBeGreaterThan(feilgren);
    expect(lagsjekk).toBeLessThan(bytte);
  });

  it('bygger alt på nytt når laget bytter mellom egne og fellesskapets funn', () => {
    // Samme funn står på hvert sitt punkt i de to lagene. Ingenting fra det
    // ene skal bli stående i det andre.
    expect(blokk).toContain("const viser = filters.onlyMine ? 'own' : 'shared';");
    expect(bytte).toBeGreaterThan(lagsjekk);
    expect(avstemming).toBeGreaterThan(bytte);
    expect(blokk.slice(bytte, avstemming)).toContain('findingsLayerShowsRef.current = viser;');
  });

  it('stemmer ellers av i stedet for å tømme — en åpen popup overlever at kartet henter på nytt', () => {
    // Å tømme laget lukker popupen til markøren som står åpen (prøvd mot ekte
    // Leaflet i funnlag.test.tsx). Etter at svaret er godtatt finnes det én
    // tømming igjen: den ved bytte av kilde.
    const etterFeilgren = blokk.slice(lagsjekk);
    expect(etterFeilgren).not.toContain('clearLayers');
    expect(etterFeilgren.match(/\.tom\(\)/g)).toHaveLength(1);
  });

  it('lar ikke fellesskapets funn stå under «Kun mine funn» når hentingen av egne feiler', () => {
    const feil = blokk.slice(feilgren, lagsjekk);
    expect(feil).toContain("filters.onlyMine && findingsLayerShowsRef.current === 'shared'");
    expect(feil).toContain('funnlagRef.current?.tom();');
  });

  it('viser ingenting under «Kun mine funn» før vi vet hvem brukeren er', () => {
    const gren = blokk.slice(tomGren, henting);
    expect(gren).toContain('funnlagRef.current?.tom();');
    expect(gren).toContain('findingsLayerShowsRef.current = null;');
  });
});

describe('kartinit — lasterne startes én gang', () => {
  it('venter ikke på funn og fliser en gang til rett etter at onMoveEnd har startet dem', () => {
    expect(KILDE).not.toContain('await loadFindingsRef.current();\n      await loadPredictionTilesRef.current();');
  });
});
