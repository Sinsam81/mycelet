import { describe, expect, it } from 'vitest';

/**
 * Ærlighetsavsnittet på /soppforhold må ramse opp de samme inngangene som
 * scoren faktisk bruker.
 *
 * Feilen dette vokter mot sto publisert på alle 22 områdesidene, i
 * delingsbildet og i soppvarsel-e-posten: teksten sa at tallet var «vær og
 * sesong for området» og listet regn, markfuktighet, temperatur, luftfuktighet
 * og sesong. Men cell-score.ts ganger i tillegg med `habitatFit` (0,7–1,8,
 * ut fra om treslaget matcher artens partnere), `hostGate`, bonitet, volum og
 * høyde over havet.
 *
 * Retningen på feilen er verdt å merke seg: teksten UNDERdrev modellen. Det er
 * den trygge retningen å ta feil i, men den gjorde neste setning — «det sier
 * ingenting om skogen der du står» — til en selvmotsigelse for enhver som
 * visste hva som gikk inn. Og et forbehold som ikke henger sammen, er et
 * forbehold folk slutter å tro på.
 *
 * Testen leser begge kildene, samme teknikk som edibility-asymmetry.test.ts:
 * bruker modellen skogdata, må teksten si det.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs') as typeof import('node:fs');

const cellScore = fs.readFileSync(new URL('../../../lib/prediction/cell-score.ts', import.meta.url), 'utf8');
const forbehold = fs.readFileSync(new URL('../Forbehold.tsx', import.meta.url), 'utf8');
const epost = fs.readFileSync(new URL('../../../lib/alerts/email.ts', import.meta.url), 'utf8');

describe('forbeholdet på /soppforhold', () => {
  it('bekrefter premisset: scoren bruker faktisk skogdata', () => {
    // Ryker denne, er ikke testene under lenger relevante — da er teksten
    // «vær og sesong» blitt riktig igjen, og skal skrives tilbake.
    expect(cellScore).toContain('habitatFit');
    expect(cellScore).toContain('hostGate');
    expect(cellScore).toMatch(/baseSpeciesScore \* habitatFit \* hostGate/);
  });

  it('nevner skogen blant inngangene, på begge språk', () => {
    expect(forbehold).toContain('vær, sesong og skogtype for området');
    expect(forbehold).toContain('väder, säsong och skogstyp för området');
    expect(forbehold).toMatch(/treslaget i området passer dem/);
    expect(forbehold).toMatch(/trädslaget i området passar dem/);
  });

  it('holder fast på at et områdetall ikke kjenner stedet ditt', () => {
    // Presiseringen er hele grunnen til at avsnittet finnes. Den skal stå selv
    // om opplistingen over vokser.
    expect(forbehold).toContain('ingenting om skogen der du står');
    expect(forbehold).toContain('ingenting om skogen där du står');
    expect(forbehold).toContain('trygt å spise');
    expect(forbehold).toContain('säkert att äta');
  });

  it('sier ikke lenger «vær og sesong» alene noe sted i forbeholdet', () => {
    // Ukestripa har fortsatt lov til å si det (region-week.ts) — den ER bare
    // vær og sesong. Forbeholdet handler om det andre tallet.
    const kopiblokk = forbehold.slice(forbehold.indexOf('const COPY'));
    expect(kopiblokk).not.toContain("'vær og sesong for området'");
    expect(kopiblokk).not.toContain("'väder och säsong för området'");
  });

  it('holder varsel-e-posten i takt med siden — den beskriver samme tall', () => {
    expect(epost).toContain('vær, sesong og skogtype for området');
    expect(epost).toContain('väder, säsong och skogstyp för området');
  });
});
