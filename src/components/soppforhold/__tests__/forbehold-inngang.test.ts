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
const ogOmrade = fs.readFileSync(
  new URL('../../../app/soppforhold/[omrade]/opengraph-image.tsx', import.meta.url),
  'utf8'
);
const ogSamleside = fs.readFileSync(
  new URL('../../../app/soppforhold/opengraph-image.tsx', import.meta.url),
  'utf8'
);
const nb = JSON.parse(fs.readFileSync(new URL('../../../../messages/nb.json', import.meta.url), 'utf8'));
const sv = JSON.parse(fs.readFileSync(new URL('../../../../messages/sv.json', import.meta.url), 'utf8'));
const regioner = fs.readFileSync(
  new URL('../../../lib/prediction/tile-regions.ts', import.meta.url),
  'utf8'
);

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

/**
 * Første forsøk skrev «rundt 20 kvadratkilometer» — regnet på Bodø og Oslo
 * alene, og feil for 19 av 22 områder. Feilen gikk i overselgende retning: den
 * fikk rasteret til å virke finere oppløst enn det er, i nettopp det avsnittet
 * som finnes for å innrømme det motsatte. Den opprinnelige testen fanget den
 * ikke, fordi den bare sjekket at ordet «skogtype» var der.
 */
describe('tallene og påstandene i forbeholdet', () => {
  it('oppgir en rutestørrelse som stemmer med rutenettet', () => {
    // Regnes ut av kilden, ikke hardkodet: endres `step` for en region,
    // flytter snittet seg, og teksten skal følge etter.
    const rader = [...regioner.matchAll(
      /\{ name: '[^']+', country: '(?:NO|SE)', minLat: ([\d.]+), maxLat: ([\d.]+), minLng: [\d.]+, maxLng: [\d.]+, step: ([\d.]+) \}/g
    )];
    expect(rader.length).toBeGreaterThanOrEqual(20);

    const arealer = rader.map(([, minLat, maxLat, step]) => {
      const s = Number(step);
      const lat = (Number(minLat) + Number(maxLat)) / 2;
      return s * 111.32 * (s * 111.32 * Math.cos((lat * Math.PI) / 180));
    });
    const snitt = arealer.reduce((a, b) => a + b, 0) / arealer.length;

    const oppgitt = Number(forbehold.match(/rundt (\d+) kvadratkilometer/)?.[1]);
    expect(oppgitt, 'fant ikke tallet i den norske teksten').toBeGreaterThan(0);
    // Innenfor 25 % av det faktiske snittet. Blir avviket større, er teksten
    // en påstand vi ikke kan holde.
    expect(Math.abs(oppgitt - snitt) / snitt).toBeLessThan(0.25);

    // Samme tall på svensk — de svenske rutene er de STØRSTE (26,8–34,2 km²),
    // så et for lavt tall bommer verst nettopp der.
    expect(forbehold).toContain(`ungefär ${oppgitt} kvadratkilometer`);
  });

  it('kaller skogdataene et punktoppslag, ikke et snitt over ruta', () => {
    // Skogoppslaget er én GetFeatureInfo mot senterpikselen. Å kalle det et
    // snitt påstår at ruta er ensartet — nøyaktig det spot-area.ts avviste å
    // påstå. Feilen er lett å gjeninnføre fordi «snittet» høres beskjedent ut.
    expect(forbehold).toContain('punktoppslag');
    expect(forbehold).toContain('punktmätning');
    const kopiblokk = forbehold.slice(forbehold.indexOf('const COPY'));
    expect(kopiblokk).not.toContain('snittet av den');
    expect(kopiblokk).not.toContain('snittet av den');
  });

  it('sier det samme i BEGGE delingsbildene', () => {
    // Områdesidenes bilde ble oppdatert først, samlesidens ikke. To
    // forhåndsvisninger av samme tall, med motstridende tekst, i samme tråd.
    expect(ogOmrade).toContain('Vær, sesong og skogtype');
    expect(ogSamleside).toContain('Vær, sesong og skogtype');
    expect(ogOmrade).toContain('Väder, säsong och skogstyp');
  });

  it('sier det samme på forsiden som på /soppforhold', () => {
    // Forsidekortet beskrev det SAMME regiontallet som «vær, sesong og fukt».
    expect(nb.Home.bestRegionsDisclaimer).toContain('SKOGTYPE');
    expect(sv.Home.bestRegionsDisclaimer).toContain('SKOGSTYP');
    expect(nb.Home.bestRegionsDisclaimer).not.toContain('FUKT');
  });
});
