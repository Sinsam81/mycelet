import { describe, expect, it } from 'vitest';

/**
 * Sikkerhetsinvarianter for lagringsflyten på AI-resultatsiden.
 *
 * Bekreftelses-porten («Jeg forstår at dette ikke er en spiselighetsgaranti…»)
 * er dokumentert som juridisk kritisk i CODEX-HANDOVER («do not weaken»), men
 * hadde INGEN testdekning — en friksjonsreduserende endring kunne fjernet
 * `disabled={!acknowledged}` uten at noen test feilet. Disse låser den, med
 * samme kildelesings-teknikk som edibility-asymmetry.test.ts (repoet har ikke
 * komponenttest-infrastruktur).
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs') as typeof import('node:fs');
const source = fs.readFileSync(new URL('../result/page.tsx', import.meta.url), 'utf8');

describe('bekreftelses-porten på AI-resultatsiden', () => {
  it('lagre-knappen er død til brukeren aktivt har bekreftet', () => {
    expect(source).toMatch(/disabled=\{!acknowledged \|\| fetchingPosition\}/);
  });

  it('porten holder også inne i handleSave — nye kallsteder kan ikke gå utenom', () => {
    // Forsvar i dybden: disabled-attributtet stopper bare DENNE knappen.
    expect(source).toMatch(/if \(!acknowledged\) return;/);
  });

  it('bekreftelsen starter alltid umerket — hvert funn krever en AKTIV bekreftelse', () => {
    expect(source).toMatch(/const \[acknowledged, setAcknowledged\] = useState\(false\)/);
    expect(source).not.toMatch(/defaultChecked/);
    expect(source).toContain('checked={acknowledged}');
  });

  it('setAcknowledged kalles fra NØYAKTIG ett sted: avkrysningsboksen', () => {
    // En motstander-runde beviste at de forrige påstandene kunne omgås med
    // `useEffect(() => setAcknowledged(true), [])` — alle testene forble
    // grønne mens porten var nøytralisert. Kallsted-tellingen fanger enhver
    // ekstra setter (effekt, lagringsavledet init, snarvei): dukker det opp
    // et kall til, MÅ noen bevisst oppdatere denne testen og forklare seg.
    const kall = source.match(/setAcknowledged\(/g) ?? [];
    expect(kall).toHaveLength(1);
    expect(source).toContain('setAcknowledged(e.target.checked)');
  });

  it('handleSave har nøyaktig to forekomster: definisjonen og den ene knappen', () => {
    expect(source.match(/handleSave/g)).toHaveLength(2);
  });

  it('bekreftelsen huskes aldri — et husket kryss er passiv boilerplate, ikke en bekreftelse', () => {
    // Delingsnivået HAR lov til å huskes (delingsniva.ts); bekreftelsen har
    // det ikke. Kallsted-tellingen over er hovedvernet (den fanger også
    // lagringsavledet init); disse fanger i tillegg direkte lagring av
    // bekreftelsen i SAMME uttrykk. En bredere nærhets-regex traff den
    // legitime payload-lastingen fra sessionStorage rett under useState-linja.
    expect(source).not.toMatch(/lagreDelingsniva\w*\([^)]*[Aa]cknowledg/);
    expect(source).not.toMatch(/setItem\([^)]*[Aa]cknowledg/);
    expect(source).not.toMatch(/writeLocal\([^)]*[Aa]cknowledg/);
  });

  it('GPS-redningen henter posisjon på nytt — aldri en ny AI-identifisering', () => {
    // «Ta nytt bilde»-blindveien kostet en AI-kvoteenhet. Redningsknappen
    // skal bruke geolokasjon direkte og aldri kalle identify-API-et.
    expect(source).toContain('getCurrentPositionOnce');
    expect(source).not.toContain('/api/identify');
  });

  it('etter lagring lander brukeren der funnet faktisk synes', () => {
    // Uten ?mine=1 er et privat funn usynlig i standardlaget, og «lagret!»
    // etterfulgt av et kart uten funnet leses som at lagringen feilet.
    expect(source).toContain("router.push('/map?mine=1')");
  });

  it('delingsnivå-velgeren er fortsatt synlig med alle tre valg', () => {
    // Lærdommen fra personvernfunn #92: valget skal aldri skje i det stille.
    for (const del of ["t('sharingLevel')", 'sharingPublic', 'sharingApproximate', 'sharingPrivate']) {
      expect(source).toContain(del);
    }
  });

  it('har GPS-tekstene i begge språk', () => {
    for (const locale of ['nb', 'sv'] as const) {
      const messages = JSON.parse(
        fs.readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8')
      );
      const ns = messages.IdentifyResult;
      // Ærlighetskravet: notisen må si at posisjonen er der brukeren STÅR.
      expect(ns.missingGpsNotice).toMatch(locale === 'nb' ? /der du står/ : /där du står/);
      expect(ns.fetchLocation.length).toBeGreaterThan(3);
      expect(ns.locationFailed.length).toBeGreaterThan(10);
    }
  });
});
