import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Melding og blokkering fra kartet, og filteret som gjør at «blokker» også
 * gjelder funnene på kartet.
 *
 * Popupen selv er prøvd i FindingPopupMelding.test.tsx, og lista over
 * blokkerte i src/lib/map/__tests__/blokkerte-brukere.test.ts. Her låses
 * KOBLINGEN i kartet — MushroomMap.tsx lastes ikke av noen test (Leaflet +
 * DOM), derfor en kildevakt.
 */
const KILDE = readFileSync(new URL('../MushroomMap.tsx', import.meta.url), 'utf8');

function mellom(start: string, slutt: string): string {
  const fra = KILDE.indexOf(start);
  expect(fra, `fant ikke «${start}»`).toBeGreaterThan(-1);
  const til = KILDE.indexOf(slutt, fra + start.length);
  expect(til, `fant ikke «${slutt}» etter «${start}»`).toBeGreaterThan(fra);
  return KILDE.slice(fra, til);
}

const lasting = mellom('const loadFindings = useCallback(async () => {', 'loadFindingsRef.current = loadFindings;');

describe('funnlaget utelater funn fra brukere leseren har blokkert', () => {
  const start = lasting.indexOf('const blokkerteLofte = filters.onlyMine ? null : blokkerte.ider();');
  const henting = lasting.indexOf("supabase.rpc('get_findings_in_bounds'");
  const venting = lasting.indexOf('const blokkerteIder = blokkerteLofte ? await blokkerteLofte : null;');
  const forsteSjekk = lasting.indexOf('gen !== findingsGenRef.current');
  const filter = lasting.indexOf('const synlige = blokkerteIder ? utenBlokkerte(findings, blokkerteIder) : findings;');
  const tegning = lasting.indexOf('funnlag.synk(filtered,');

  it('slår opp lista samtidig med funnene, og venter på den før noe tegnes', () => {
    // Startet etter hentingen ville den kostet et ekstra rundtur; tegnet før
    // den var inne ville den blokkertes funn blinket fram ved hver åpning.
    expect(start).toBeGreaterThan(-1);
    expect(henting).toBeGreaterThan(start);
    expect(venting).toBeGreaterThan(henting);
    expect(forsteSjekk).toBeGreaterThan(venting);
  });

  it('filtrerer før periodefilteret og før tegningen', () => {
    expect(filter).toBeGreaterThan(forsteSjekk);
    expect(lasting.indexOf('const filtered = synlige.filter(')).toBeGreaterThan(filter);
    expect(tegning).toBeGreaterThan(filter);
    // Det er de filtrerte funnene som tegnes — ikke lista rett fra databasen.
    expect(lasting).not.toContain('const filtered = findings.filter(');
  });

  it('«Kun mine funn» viser bare egne funn og slår ikke opp lista', () => {
    expect(lasting).toContain('const blokkerteLofte = filters.onlyMine ? null : blokkerte.ider();');
  });

  it('lista hentes med leserens egen økt — RLS gir bare egne rader', () => {
    expect(KILDE).toContain("lagBlokkerteHusk(() => createClient().from('blocked_users').select('blocked_id'))");
  });

  it('ventingen er huskens, med frist — kartet legger ikke en egen, ubegrenset venting oppå', () => {
    // Ett oppslag som ble hengende, holdt hele funnlaget tomt til nettleseren
    // ga opp forespørselen. Fristen (og at et hengende oppslag ikke huskes) er
    // prøvd i src/lib/map/__tests__/blokkerte-brukere.test.ts; her låses det
    // at lastingen venter på nettopp det løftet, og ikke på noe annet.
    expect(lasting.match(/await blokkerteLofte\b/g) ?? []).toHaveLength(1);
    expect(lasting).not.toContain('naarHentet');
    expect(KILDE).not.toMatch(/fristMs:/);
  });

  it('filteret leser huskens eget sett — en liste som kom etter fristen, men før funnene, er med', () => {
    expect(lasting).not.toMatch(/new Set\(\s*(\.\.\.)?blokkerteIder/);
    expect(lasting).not.toContain('[...blokkerteIder]');
    // Ingen venting mellom at lista er ventet på og at laget tegnes.
    expect(lasting.slice(venting + 'const blokkerteIder = blokkerteLofte ? await blokkerteLofte : null;'.length, tegning)).not.toMatch(
      /\bawait\b/
    );
  });

  it('kommer lista først etter at laget er tegnet, tas de blokkertes nåler ut av det som står der', () => {
    // Uten ny henting — samme grep som rett etter en blokkering fra kartet.
    expect(KILDE).toMatch(
      /useEffect\(\(\) => \{\s*void blokkerte\.naarHentet\(\)\.then\(\(ider\) => \{\s*for \(const id of ider\) funnlagRef\.current\?\.fjernFraBruker\(id\);\s*\}\);\s*\}, \[blokkerte\]\);/
    );
  });
});

describe('popupen får melding og blokkering bare på andres funn', () => {
  it('avgjøres av hvem som er innlogget og hvem som eier funnet', () => {
    expect(lasting).toContain('const eget = currentUserId != null && finding.user_id === currentUserId;');
    expect(lasting).toContain('const kanMelde = currentUserId != null && !eget;');
    expect(lasting).toContain('canDelete: eget,');
    expect(lasting).toContain('onReport: kanMelde ? reportFinding : undefined,');
    expect(lasting).toContain('onBlock: kanMelde && finding.user_id ? blockFindingAuthor : undefined');
  });

  it('handlingene har stabil identitet — ellers henter kartet funn på nytt ved hver gjengivelse', () => {
    expect(KILDE).toMatch(/const reportFinding = useCallback\(\s*\(findingId: string, payload: FindingReportPayload\) => reportFindingRef\.current\(findingId, payload\),\s*\[\]\s*\);/);
    expect(KILDE).toContain(
      'const blockFindingAuthor = useCallback((finding: MapFinding) => blockFindingAuthorRef.current(finding), []);'
    );
  });
});

describe('melding', () => {
  // Bare selve funksjonen, ikke kommentarene rundt.
  const melding = mellom('const handleReportFinding = useCallback(', '[forumError, sendReport, tReport]');

  it('lagres med forumets egen krok, som en melding om funnet', () => {
    expect(KILDE).toContain('const { mutateAsync: sendReport } = useReportContent();');
    expect(melding).toContain('await sendReport({ findingId, reason: payload.reason, description: payload.description });');
  });

  it('sender ingenting annet om funnet — ingen koordinater, ikke hvem som la det inn', () => {
    expect(melding).not.toMatch(/lat|lng|latitude|longitude|user_id|username/);
  });

  it('kaster videre en oversatt tekst, aldri den rå feilen', () => {
    expect(melding).toContain("throw new VisbarFeil(forumError(error, tReport('submitError')));");
    expect(melding).not.toContain('error.message');
  });
});

describe('blokkering', () => {
  const blokkering = mellom(
    'const handleBlockFindingAuthor = useCallback(',
    '[blokkerte, currentUserId, queryClient, supabase, tBlock, tBlockedUsers]'
  );

  it('skriver raden slik at et nytt forsøk på en alt blokkert bruker ikke feiler', () => {
    // blocked_users har ingen UPDATE-policy: en vanlig upsert på en rad som
    // finnes, avvises av RLS. DO NOTHING trenger bare INSERT.
    expect(blokkering).toContain("{ onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true }");
    expect(blokkering).toContain('{ blocker_id: currentUserId, blocked_id: blokkertId }');
  });

  it('blokkerer aldri uten innlogget leser, og aldri leseren selv', () => {
    expect(blokkering).toContain('if (!currentUserId || !blokkertId || blokkertId === currentUserId) {');
  });

  it('tar brukerens funn ut av laget med en gang, og henter laget på nytt', () => {
    const skriving = blokkering.indexOf(".from('blocked_users')");
    const feil = blokkering.indexOf("if (!skrevet) throw new VisbarFeil(tBlock('failed'));");
    const huskes = blokkering.indexOf('blokkerte.leggTil(blokkertId);');
    const lukkes = blokkering.indexOf('mapRef.current?.closePopup();');
    const fjernes = blokkering.indexOf('funnlagRef.current?.fjernFraBruker(blokkertId);');
    const hentes = blokkering.indexOf('void loadFindingsRef.current?.();');
    expect(skriving).toBeGreaterThan(-1);
    expect(feil).toBeGreaterThan(skriving);
    // Ingenting endres på kartet før raden faktisk er skrevet.
    for (const steg of [huskes, lukkes, fjernes, hentes]) expect(steg).toBeGreaterThan(feil);
    // Lista oppdateres FØR laget hentes på nytt, ellers tegnes funnene igjen.
    expect(hentes).toBeGreaterThan(huskes);
  });

  it('sier fra til forumet, som leser samme blokkeringsliste', () => {
    expect(blokkering).toContain('invalidateAfterBlockChange(queryClient);');
  });

  it('kaster oversatt tekst, og kvitterer med brukernavnet', () => {
    expect(blokkering).not.toContain('error.message');
    // Også et kall som KASTER (ikke bare et svar med feil) blir til teksten.
    expect(blokkering).toMatch(/\} catch \{\s*skrevet = false;\s*\}\s*if \(!skrevet\) throw new VisbarFeil\(tBlock\('failed'\)\);/);
    expect(blokkering).toContain("toast.success(tBlock('blocked', { name: finding.username?.trim() || tBlockedUsers('unknown') }));");
  });

  it('funnlaget lages sammen med klyngelaget og kastes sammen med kartet', () => {
    // fjernFraBruker er prøvd mot ekte Leaflet i funnlag.test.tsx; her låses
    // det at kartet faktisk har et lag å kalle den på.
    expect(KILDE).toContain(
      'funnlagRef.current = new Funnlag<MapFinding>(L, clusters, (funn) => createMarkerIcon(L, funn.edibility));'
    );
    expect(KILDE).toMatch(/funnlagRef\.current\?\.kast\(\);\s*funnlagRef\.current = null;/);
  });
});

describe('teksten om hva blokkering gjør', () => {
  it('lover at funnene på kartet forsvinner — og kartet filtrerer dem faktisk', () => {
    // De to hører sammen: teksten ble først endret da filteret var på plass.
    expect(nb.BlockUser.explain).toContain('funn på kartet');
    expect(sv.BlockUser.explain).toContain('fynd på kartan');
    expect(lasting).toContain('utenBlokkerte(findings, blokkerteIder)');
  });

  it('sier fortsatt det den sa før: innlegg, kommentarer, usynlig for den blokkerte, kan oppheves', () => {
    expect(nb.BlockUser.explain).toMatch(/innlegg, kommentarer og funn på kartet/);
    expect(nb.BlockUser.explain).toMatch(/får ikke vite/);
    expect(nb.BlockUser.explain).toMatch(/oppheve/);
    expect(sv.BlockUser.explain).toMatch(/inlägg, kommentarer och fynd på kartan/);
    expect(sv.BlockUser.explain).toMatch(/får inte veta/);
    expect(sv.BlockUser.explain).toMatch(/häva/);
  });
});
