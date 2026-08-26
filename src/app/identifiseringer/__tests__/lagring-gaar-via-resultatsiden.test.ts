import { describe, expect, it } from 'vitest';

/**
 * Sikkerhetsinvarianter for identifiseringshistorikken.
 *
 * Kjernepåstanden: historikklista har INGEN egen lagre-funksjon. «Lagre som
 * funn» er en lenke til /identify/result?id=…, slik at bekreftelses-porten,
 * forvekslingssjekken, sikkerhetsadvarselen og artsvelgeren er nøyaktig de
 * samme uansett hvor lagringen starter.
 *
 * Hvorfor det må låses: avkrysningsboksen alene er ikke porten. Den får mening
 * av det som står rundt den. En «ett-trykks lagre»-knapp i lista ville sett ut
 * som en ren bekvemmelighet, ville passert enhver kodegjennomgang, og ville
 * stille ha flyttet bekreftelsen bort fra advarselen den bekrefter.
 *
 * Samme kildelesings-teknikk som lagre-porten.test.ts — repoet har ikke
 * komponenttest-infrastruktur.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs') as typeof import('node:fs');
const listeSide = fs.readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');
const resultatSide = fs.readFileSync(
  new URL('../../identify/result/page.tsx', import.meta.url),
  'utf8'
);

describe('historikklista lagrer aldri selv', () => {
  it('kaller ikke /api/findings', () => {
    expect(listeSide).not.toContain('/api/findings');
  });

  it('har ingen bekreftelses-avkrysning — den bor på resultatsiden', () => {
    // Fantes den her, ville den vært en KOPI av porten, og kopier drifter fra
    // hverandre. Én port, ett sted.
    expect(listeSide).not.toContain('acknowledged');
    expect(listeSide).not.toContain('type="checkbox"');
  });

  it('har ingen delingsnivå-velger — delingsnivået velges der funnet lagres', () => {
    expect(listeSide).not.toContain('delingsniva');
    expect(listeSide).not.toContain('visibility');
  });

  it('«lagre som funn» er en lenke til resultatsiden med rad-id', () => {
    expect(listeSide).toContain('href={`/identify/result?id=${rad.id}`}');
  });
});

describe('resultatsiden hydrerer fra historikken uten å svekke porten', () => {
  it('leser ?id= og henter raden fra API-et', () => {
    expect(resultatSide).toContain("searchParams.get('id')");
    expect(resultatSide).toContain('/api/identifications/');
  });

  it('hydreringsruta heter ikke noe som inneholder «/api/identify»', () => {
    // Porttesten hevder at resultatsidens kilde IKKE inneholder '/api/identify'
    // (vakta som sikrer at GPS-redningen ikke brenner en AI-kvoteenhet).
    // '/api/identifications' inneholder ikke den strengen; '/api/identify/history'
    // ville gjort det og slått ut vakta som falsk positiv. Denne testen finnes
    // for at et framtidig omdøp skal feile HER, med en forklaring.
    expect(resultatSide).not.toContain('/api/identify');
  });

  it('bekreftelsen er fortsatt umerket ved hydrering fra historikken', () => {
    // Ingen gren setter acknowledged basert på at raden er sett før.
    expect(resultatSide).toMatch(/const \[acknowledged, setAcknowledged\] = useState\(false\)/);
    expect((resultatSide.match(/setAcknowledged\(/g) ?? []).length).toBe(1);
  });

  it('en allerede lagret rad tilbyr ikke lagring på nytt', () => {
    expect(resultatSide).toContain('payload.savedFindingId');
  });
});

describe('historikken og kvotetelleren er to tabeller', () => {
  const migrasjon = fs.readFileSync(
    new URL('../../../../supabase/migrations/055_identification_history.sql', import.meta.url),
    'utf8'
  );

  it('den nye tabellen kan slettes av eieren', () => {
    // GDPR art. 17. Motstykket til neste test.
    expect(migrasjon).toMatch(/CREATE POLICY "Users delete own identifications"/);
  });

  it('rører ikke ai_identifications', () => {
    // Kvotetelleren skal FORTSATT være uten policyer. Fikk den en
    // slettepolicy — eller ble historikken lagt på den tabellen — kunne en
    // gratisbruker nullstilt dagskvoten sin og fått ubegrenset AI-bruk på vår
    // Kindwise-regning.
    expect(migrasjon).not.toMatch(/ALTER TABLE ai_identifications/);
    expect(migrasjon).not.toMatch(/POLICY[^\n]*ON ai_identifications/);
  });

  it('bildebøtta er privat', () => {
    expect(migrasjon).toContain("VALUES ('identify-history', 'identify-history', false");
    // Ingen offentlig lesepolicy — alle fire operasjonene er eier-låst.
    expect(migrasjon).not.toMatch(/FOR SELECT\s*\n\s*USING \(\s*bucket_id = 'identify-history'\s*\)/);
  });

  it('anon har ingen tilgang', () => {
    expect(migrasjon).toContain('REVOKE ALL ON identifications FROM anon;');
  });

  it('brukeren kan bare skrive koblingen til funnet', () => {
    expect(migrasjon).toContain('GRANT UPDATE (finding_id, saved_at) ON identifications TO authenticated;');
  });

  it('rettighetene REVOKES før de GRANTES — ellers begrenser kolonne-granten ingenting', () => {
    // Supabase gir automatisk GRANT ALL til authenticated på nye tabeller
    // (ALTER DEFAULT PRIVILEGES). Uten revoke først ligger den tabell-brede
    // UPDATE-en der fortsatt, og kolonne-granten er additiv — man tror man har
    // en smal rettighet mens man har alle kolonner. Denne testen finnes fordi
    // nøyaktig den feilen sto i første utkast av migrasjonen.
    const revoke = migrasjon.indexOf('REVOKE ALL ON identifications FROM authenticated;');
    // Hele setningen, ikke bare prefikset: kommentaren over den siterer
    // «GRANT UPDATE (finding_id, saved_at)», og et prefiks-søk traff den.
    const grant = migrasjon.indexOf(
      'GRANT UPDATE (finding_id, saved_at) ON identifications TO authenticated;'
    );
    expect(revoke).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(revoke);
  });
});
