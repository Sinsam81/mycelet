import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DelingsnivaValg } from '../delingsniva';
import {
  DELING_KARANTENE_TIMER,
  SONE_OMGJORING_AAPEN,
  brukerJitter,
  delingsnivaFor,
  kanBliSone,
  kreverKarantene,
  planleggFunnEndring,
  tidligstNyAapning,
  type Endringsplan,
  type FunnForEndring
} from '../delingsendring';
import { parseFindingPatch, type FindingPatch } from '../request';

/**
 * Planleggeren avgjør to ting om en endring av et lagret funn: hva som skal
 * skrives, og om den legger ut noe nytt som må vente.
 *
 * Det den vokter mot er gjennomsnitts-angrepet migrasjon 042 beskriver: hver
 * gang et funn går fra privat (eller sone) til omtrentlig, trekkes et NYTT
 * tilfeldig punkt, og nok slike punkter peker mot det ekte stedet.
 *
 * Og mot sone-ruta: den røpet funnets eksakte breddegrad til migrasjon 075, og
 * flere rutestørrelser for samme funn snevrer inn øst–vest også etter den.
 * Regnestykkene står i sonerute-migrasjon.test.ts.
 */

const TIME = 60 * 60 * 1000;
/** Fast klokke — testene skal ikke avhenge av dagens dato. */
const NAA = Date.parse('2026-11-10T12:00:00.000Z');
const forTimer = (timer: number) => new Date(NAA - timer * TIME).toISOString();

function rad(over: Partial<FunnForEndring> = {}): FunnForEndring {
  return {
    visibility: 'private',
    is_zone_finding: false,
    zone_label: null,
    zone_precision_km: 5,
    species_id: 3,
    species_name_override: null,
    notes: 'Under den store grana',
    created_at: '2026-09-01T08:00:00.000000+00:00',
    updated_at: '2026-09-01T08:00:00.000000+00:00',
    ...over
  };
}

const RADER: Record<DelingsnivaValg, Partial<FunnForEndring>> = {
  private: { visibility: 'private' },
  approximate: { visibility: 'approximate' },
  zone: { visibility: 'approximate', is_zone_finding: true, zone_label: 'Nordmarka', zone_precision_km: 5 },
  public: { visibility: 'public' }
};

const PATCHER: Record<DelingsnivaValg, Record<string, unknown>> = {
  private: { visibility: 'private' },
  approximate: { visibility: 'approximate' },
  zone: { visibility: 'approximate', isZoneFinding: true, zoneLabel: 'Nordmarka', zonePrecisionKm: 5 },
  public: { visibility: 'public' }
};

/** Patchen går gjennom den ekte parseren, så testene følger det ruta faktisk gir planleggeren. */
function patch(body: Record<string, unknown>): FindingPatch {
  const result = parseFindingPatch(body);
  if (!result.success) throw new Error(`ugyldig patch i testen: ${result.code}`);
  return result.data;
}

const NIVAAER: DelingsnivaValg[] = ['private', 'zone', 'approximate', 'public'];

/**
 * Planleggeren med omgjøring til sone ÅPEN, om ikke annet er sagt — slik den
 * står når migrasjon 075 er bekreftet kjørt. Det stengte utfallet, som er det
 * som gjelder til da, har sine egne tester lenger ned.
 */
const planlegg = (
  row: FunnForEndring,
  endring: FindingPatch,
  naaMs: number = NAA,
  soneOmgjoringAapen = true
): Endringsplan => planleggFunnEndring(row, endring, naaMs, soneOmgjoringAapen);

/** Begge stillingene bryteren kan stå i. */
const BRYTER = [
  ['åpen', true],
  ['stengt', false]
] as const;

describe('delingsnivaFor — samme grener som public_findings', () => {
  it('leser de fire nivåene', () => {
    expect(delingsnivaFor({ visibility: 'private', is_zone_finding: false })).toBe('private');
    expect(delingsnivaFor({ visibility: 'approximate', is_zone_finding: false })).toBe('approximate');
    expect(delingsnivaFor({ visibility: 'approximate', is_zone_finding: true })).toBe('zone');
    expect(delingsnivaFor({ visibility: 'public', is_zone_finding: false })).toBe('public');
  });

  it('lar privat vinne over et soneflagg som ble stående', () => {
    expect(delingsnivaFor({ visibility: 'private', is_zone_finding: true })).toBe('private');
  });

  it('regner et offentlig sone-funn som sone — viewet viser ruta, ikke punktet', () => {
    expect(delingsnivaFor({ visibility: 'public', is_zone_finding: true })).toBe('zone');
  });

  it('regner en ukjent synlighet som privat — viewet slipper den heller ikke ut', () => {
    expect(delingsnivaFor({ visibility: 'hemmelig', is_zone_finding: false })).toBe('private');
    expect(delingsnivaFor({ visibility: '', is_zone_finding: null })).toBe('private');
  });

  it('sier at bare omtrentlige funn uten sone har et tilfeldig punkt', () => {
    expect(NIVAAER.filter((n) => brukerJitter(rad(RADER[n])))).toEqual(['approximate']);
  });
});

describe('tidligstNyAapning', () => {
  it('har ingen karantene for et funn som aldri er endret', () => {
    expect(tidligstNyAapning(rad(), NAA)).toBeNull();
    expect(tidligstNyAapning({ created_at: forTimer(0.01), updated_at: forTimer(0.01) }, NAA)).toBeNull();
    expect(tidligstNyAapning({ created_at: forTimer(1), updated_at: null }, NAA)).toBeNull();
  });

  it('regner fra siste endring og et døgn fram', () => {
    const endret = forTimer(2);
    expect(tidligstNyAapning(rad({ updated_at: endret }), NAA)).toBe(Date.parse(endret) + DELING_KARANTENE_TIMER * TIME);
  });

  it('er over når døgnet er gått', () => {
    expect(tidligstNyAapning(rad({ updated_at: forTimer(DELING_KARANTENE_TIMER) }), NAA)).toBeNull();
    expect(tidligstNyAapning(rad({ updated_at: forTimer(DELING_KARANTENE_TIMER - 0.001) }), NAA)).not.toBeNull();
  });

  it('skiller «aldri endret» fra «endret» på tidspunktet, ikke på skrivemåten', () => {
    // Samme øyeblikk, to tidssoner.
    expect(
      tidligstNyAapning({ created_at: '2026-11-10T11:00:00+00:00', updated_at: '2026-11-10T12:00:00+01:00' }, NAA)
    ).toBeNull();
  });
});

/**
 * Hele overgangstabellen. Rad = nivået funnet står på, kolonne = nivået det
 * skal til. «venter» = endringen legger ut noe nytt og er karantenebelagt.
 */
describe('kreverKarantene — hele tabellen', () => {
  const VENTER: Record<DelingsnivaValg, DelingsnivaValg[]> = {
    // Fra privat legger både et tilfeldig og et eksakt punkt ut noe nytt.
    private: ['approximate', 'public'],
    // Fra sone også: ruta er grovere enn begge.
    zone: ['approximate', 'public'],
    // Fra omtrentlig er bare det eksakte punktet nytt.
    approximate: ['public'],
    // Fra offentlig er alt en innstramming.
    public: []
  };

  for (const fra of NIVAAER) {
    for (const til of NIVAAER) {
      const venter = VENTER[fra].includes(til);
      it(`${fra} → ${til}: ${venter ? 'venter' : 'går alltid'}`, () => {
        expect(kreverKarantene(fra, til)).toBe(venter);
      });
    }
  }

  /**
   * Sone er ikke karantenebelagt: med låst størrelse har et funn én rute, og
   * den samme ruta en gang til forteller ingenting nytt. OM funnet kan bli
   * sone, er et annet spørsmål — det svarer kanBliSone på.
   */
  it('lar privat og sone gå utenom karantenen, uansett hvor funnet kommer fra', () => {
    for (const fra of NIVAAER) {
      expect(kreverKarantene(fra, 'private')).toBe(false);
      expect(kreverKarantene(fra, 'zone')).toBe(false);
    }
  });
});

describe('kanBliSone', () => {
  it('lar et funn som alt er sone, bli stående som sone — uansett bryter', () => {
    expect(kanBliSone('zone', false)).toBe(true);
    expect(kanBliSone('zone', true)).toBe(true);
  });

  it('slipper ingen andre til før omgjøringen er åpnet', () => {
    for (const fra of ['private', 'approximate', 'public'] as const) {
      expect(kanBliSone(fra, false), fra).toBe(false);
      expect(kanBliSone(fra, true), fra).toBe(true);
    }
  });
});

describe('planleggFunnEndring — karantenen', () => {
  const nyligEndret = { updated_at: forTimer(1) };

  for (const [stilling, aapen] of BRYTER) {
    for (const fra of NIVAAER) {
      for (const til of NIVAAER) {
        if (fra === til) continue;
        // Stengt bryter stopper omgjøringen til sone før karantenen blir spurt.
        const stengt = til === 'zone' && !aapen;
        const venter = kreverKarantene(fra, til);
        const nylig = stengt ? 'sone-stengt' : venter ? 'karantene' : 'skriv';

        it(`${fra} → ${til} på et nylig endret funn gir «${nylig}» (omgjøring ${stilling})`, () => {
          const plan = planlegg(rad({ ...RADER[fra], ...nyligEndret }), patch(PATCHER[til]), NAA, aapen);
          expect(plan.type).toBe(nylig);
        });

        it(`${fra} → ${til} på et funn som aldri er endret gir «${stengt ? 'sone-stengt' : 'skriv'}» (omgjøring ${stilling})`, () => {
          const plan = planlegg(rad(RADER[fra]), patch(PATCHER[til]), NAA, aapen);
          expect(plan.type).toBe(stengt ? 'sone-stengt' : 'skriv');
        });
      }
    }
  }

  it('oppgir når delingen kan åpnes igjen', () => {
    const plan = planlegg(rad(nyligEndret), patch({ visibility: 'approximate' }), NAA);
    expect(plan).toEqual({ type: 'karantene', tidligstMs: NAA + 23 * TIME });
  });

  it('stopper hele endringen, også notatet som fulgte med', () => {
    const plan = planlegg(rad(nyligEndret), patch({ visibility: 'approximate', notes: 'Nytt' }), NAA);
    expect(plan.type).toBe('karantene');
  });

  it('bryr seg ikke om karantenen når delingen ikke endres', () => {
    const plan = planlegg(rad({ ...RADER.approximate, ...nyligEndret }), patch({ notes: 'Nytt' }), NAA);
    expect(plan).toMatchObject({ type: 'skriv', verdier: { notes: 'Nytt' }, restempler: false, nyttJitter: false });
  });

  /**
   * Regnestykket bak regelen: N tilfeldige punkter i en skive på 500 m har et
   * gjennomsnitt som ligger ca. 354/√N meter fra sentrum. Uten brems gir ti
   * runder på ett minutt et sted innenfor ~110 m; med den gir de ett punkt.
   */
  it('gir høyst ÉN åpning når eieren veksler fram og tilbake ti ganger', () => {
    let naa = NAA;
    let funn = rad();
    let aapninger = 0;

    for (let runde = 0; runde < 10; runde += 1) {
      for (const til of ['approximate', 'private'] as const) {
        const plan = planlegg(funn, patch(PATCHER[til]), naa);
        if (plan.type === 'skriv') {
          if (plan.nyttJitter) aapninger += 1;
          // Slik triggeren findings_updated_at etterlater raden.
          funn = { ...funn, ...plan.verdier, updated_at: new Date(naa).toISOString() };
        }
        naa += 3_000;
      }
    }

    expect(aapninger).toBe(1);
    expect(funn.visibility).toBe('private');
  });

  it('gir høyst én åpning i døgnet også for den som venter mellom hver', () => {
    let naa = NAA;
    let funn = rad();
    let aapninger = 0;

    // Sju døgn, ett forsøk i timen på å åpne og ett på å lukke.
    for (let time = 0; time < 7 * 24; time += 1) {
      for (const til of ['approximate', 'private'] as const) {
        const plan = planlegg(funn, patch(PATCHER[til]), naa);
        if (plan.type === 'skriv') {
          if (plan.nyttJitter) aapninger += 1;
          funn = { ...funn, ...plan.verdier, updated_at: new Date(naa).toISOString() };
        }
        naa += TIME / 2;
      }
    }

    expect(aapninger).toBeLessThanOrEqual(7);
  });

  /**
   * Veien rundt som ikke finnes: det siste steget (offentlig → omtrentlig) er
   * en innstramming og går alltid, så det er det FØRSTE som må stoppes.
   */
  it('stenger omveien privat → offentlig → omtrentlig', () => {
    const forste = planlegg(rad(nyligEndret), patch({ visibility: 'public' }), NAA);
    expect(forste.type).toBe('karantene');
  });
});

/**
 * Samme regel, sett fra DATABASEN. Planleggerens egne merker (restempler,
 * nyttJitter) er regnskap; det som teller, er hva triggeren i migrasjon 042
 * gjør med det som skrives. Modellen under er triggeren, linje for linje — og
 * testen går gjennom alle radene en findings-tabell kan inneholde, også de
 * rare (soneflagg på et privat eller offentlig funn), mot alle patcher.
 */
describe('planleggFunnEndring — mot triggeren i 042', () => {
  type Vist = 'ingen' | 'rute' | 'tilfeldig' | 'eksakt';
  type Kolonner = Pick<FunnForEndring, 'visibility' | 'is_zone_finding' | 'zone_precision_km'>;

  /** Det set_display_location stempler for en rad. */
  const stempel = (r: Kolonner): Vist =>
    r.visibility === 'private'
      ? 'ingen'
      : r.is_zone_finding === true
        ? 'rute'
        : r.visibility === 'approximate'
          ? 'tilfeldig'
          : 'eksakt';

  /** Vakten: uten endring i de tre kolonnene står display_* urørt. */
  const stemplesPaaNytt = (gammel: Kolonner, ny: Kolonner) =>
    gammel.visibility !== ny.visibility ||
    (gammel.is_zone_finding === true) !== (ny.is_zone_finding === true) ||
    gammel.zone_precision_km !== ny.zone_precision_km;

  const ALLE_RADER: Partial<FunnForEndring>[] = [];
  for (const visibility of ['private', 'approximate', 'public']) {
    for (const is_zone_finding of [false, true, null]) {
      for (const zone_precision_km of [1, 5, 12]) {
        ALLE_RADER.push({ visibility, is_zone_finding, zone_precision_km, zone_label: is_zone_finding ? 'Nordmarka' : null });
      }
    }
  }

  const ALLE_PATCHER: Record<string, unknown>[] = [
    { visibility: 'private' },
    { visibility: 'approximate' },
    { visibility: 'public' },
    { visibility: 'approximate', isZoneFinding: false, zoneLabel: null, zonePrecisionKm: 5 },
    { visibility: 'approximate', isZoneFinding: true, zoneLabel: 'Nordmarka' },
    { visibility: 'approximate', isZoneFinding: true, zoneLabel: 'Nordmarka', zonePrecisionKm: 1 },
    { visibility: 'approximate', isZoneFinding: true, zoneLabel: 'Marka', zonePrecisionKm: 12 },
    { notes: 'Nytt notat' },
    { speciesId: 9, speciesNameOverride: 'Piggsopp' },
    { visibility: 'approximate', notes: 'Nytt notat' },
    { visibility: 'public', notes: null }
  ];

  it('legger aldri ut et nytt tilfeldig eller eksakt punkt for et funn som nylig er endret', () => {
    let skrevet = 0;
    for (const over of ALLE_RADER) {
      const gammel = rad({ ...over, updated_at: forTimer(1) });
      for (const body of ALLE_PATCHER) {
        const plan = planlegg(gammel, patch(body), NAA);
        if (plan.type !== 'skriv') continue;
        skrevet += 1;

        const ny = { ...gammel, ...plan.verdier };
        if (!stemplesPaaNytt(gammel, ny)) continue;
        const foer = stempel(gammel);
        const etter = stempel(ny);
        const beskrivelse = `${JSON.stringify(over)} + ${JSON.stringify(body)}`;

        // Det eksakte punktet legges bare «ut» når det alt lå ute.
        if (etter === 'eksakt') expect(foer, beskrivelse).toBe('eksakt');
        // Et nytt tilfeldig punkt er bare lov som innstramming fra det eksakte.
        if (etter === 'tilfeldig') expect(foer, beskrivelse).toBe('eksakt');
      }
    }
    // Vakt mot at testen består fordi ingenting ble skrevet.
    expect(skrevet).toBeGreaterThan(100);
  });

  /**
   * Den ene endringen som ALLTID skal virke: verken karantenen, bryteren eller
   * en rutestørrelse som fulgte med i patchen, får stå i veien for å skjule et
   * sted.
   */
  it('lar privat gå gjennom for hver eneste rad, også nylig endrede, uansett bryter', () => {
    for (const [, aapen] of BRYTER) {
      for (const over of ALLE_RADER) {
        const gammel = rad({ ...over, updated_at: forTimer(1) });
        for (const body of [{ visibility: 'private' }, { visibility: 'private', zonePrecisionKm: 9 }]) {
          const plan = planlegg(gammel, patch(body), NAA, aapen);
          const beskrivelse = `${JSON.stringify(over)} + ${JSON.stringify(body)}`;
          expect(['skriv', 'uendret'], beskrivelse).toContain(plan.type);
          if (plan.type === 'skriv') expect(stempel({ ...gammel, ...plan.verdier }), beskrivelse).toBe('ingen');
        }
      }
    }
  });

  it('lar sone gå utenom karantenen for hver eneste rad når omgjøringen er åpen — i radens egen størrelse', () => {
    for (const over of ALLE_RADER) {
      const gammel = rad({ ...over, updated_at: forTimer(1) });
      // Uten størrelse i patchen: «den raden står med».
      const plan = planlegg(gammel, patch(ALLE_PATCHER[4]), NAA);
      const beskrivelse = JSON.stringify(over);
      expect(['skriv', 'uendret'], beskrivelse).toContain(plan.type);
      if (plan.type === 'skriv') expect(stempel({ ...gammel, ...plan.verdier }), beskrivelse).toBe('rute');
    }
  });

  /**
   * Hele poenget med låsen: uansett rad, patch, klokke og bryter finnes det
   * ingen plan som skriver en ny rutestørrelse. Da har funnet én rute.
   */
  it('skriver aldri en rutestørrelse, for noen rad eller patch', () => {
    let skrevet = 0;
    for (const [, aapen] of BRYTER) {
      for (const endret of [forTimer(1), '2026-09-01T08:00:00.000000+00:00']) {
        for (const over of ALLE_RADER) {
          const gammel = rad({ ...over, updated_at: endret });
          for (const body of ALLE_PATCHER) {
            const plan = planlegg(gammel, patch(body), NAA, aapen);
            if (plan.type !== 'skriv') continue;
            skrevet += 1;
            expect(plan.verdier, `${JSON.stringify(over)} + ${JSON.stringify(body)}`).not.toHaveProperty(
              'zone_precision_km'
            );
          }
        }
      }
    }
    expect(skrevet).toBeGreaterThan(200);
  });

  /** Med stengt bryter kommer ingen ny rute ut — bare ruter som alt lå ute. */
  it('legger aldri ut en rute for et funn som ikke alt viste en, når omgjøringen er stengt', () => {
    let skrevet = 0;
    for (const endret of [forTimer(1), '2026-09-01T08:00:00.000000+00:00']) {
      for (const over of ALLE_RADER) {
        const gammel = rad({ ...over, updated_at: endret });
        for (const body of ALLE_PATCHER) {
          const plan = planlegg(gammel, patch(body), NAA, false);
          if (plan.type !== 'skriv') continue;
          skrevet += 1;
          const ny = { ...gammel, ...plan.verdier };
          if (stempel(ny) === 'rute') {
            expect(stempel(gammel), `${JSON.stringify(over)} + ${JSON.stringify(body)}`).toBe('rute');
          }
        }
      }
    }
    expect(skrevet).toBeGreaterThan(100);
  });

  it('merker selv av det triggeren kommer til å gjøre', () => {
    for (const over of ALLE_RADER) {
      const gammel = rad(over);
      for (const body of ALLE_PATCHER) {
        const plan = planlegg(gammel, patch(body), NAA);
        if (plan.type !== 'skriv') continue;
        const ny = { ...gammel, ...plan.verdier };
        const beskrivelse = `${JSON.stringify(over)} + ${JSON.stringify(body)}`;
        expect(plan.restempler, beskrivelse).toBe(stemplesPaaNytt(gammel, ny));
        expect(plan.nyttJitter, beskrivelse).toBe(stemplesPaaNytt(gammel, ny) && stempel(ny) === 'tilfeldig');
      }
    }
  });
});

describe('planleggFunnEndring — hva som skrives', () => {
  it('skriver ingenting når patchen er lik raden', () => {
    expect(planlegg(rad(), patch({ visibility: 'private' }), NAA)).toEqual({ type: 'uendret' });
    expect(planlegg(rad(), patch({ notes: 'Under den store grana', speciesId: 3 }), NAA)).toEqual({
      type: 'uendret'
    });
    expect(planlegg(rad(RADER.zone), patch(PATCHER.zone), NAA)).toEqual({ type: 'uendret' });
  });

  it('skriver bare kolonnene som endrer verdi', () => {
    const plan = planlegg(rad(), patch({ notes: 'Nytt', speciesId: 3, visibility: 'private' }), NAA);
    expect(plan).toMatchObject({ type: 'skriv', verdier: { notes: 'Nytt' } });
  });

  it('skriver aldri posisjon eller display_*, uansett patch', () => {
    const forbudt = ['latitude', 'longitude', 'display_latitude', 'display_longitude', 'updated_at', 'deleted_at'];
    for (const fra of NIVAAER) {
      for (const til of NIVAAER) {
        const plan = planlegg(rad(RADER[fra]), patch({ ...PATCHER[til], notes: 'x', speciesId: 9 }), NAA);
        if (plan.type !== 'skriv') continue;
        for (const kolonne of forbudt) expect(plan.verdier).not.toHaveProperty(kolonne);
      }
    }
  });

  it('merker når display_* blir stemplet på nytt, og når det trekkes et nytt punkt', () => {
    const tilOmtrentlig = planlegg(rad(), patch({ visibility: 'approximate' }), NAA);
    expect(tilOmtrentlig).toMatchObject({ fra: 'private', til: 'approximate', restempler: true, nyttJitter: true });

    const tilSone = planlegg(rad(), patch(PATCHER.zone), NAA);
    expect(tilSone).toMatchObject({ fra: 'private', til: 'zone', restempler: true, nyttJitter: false });

    const tilPrivat = planlegg(rad(RADER.approximate), patch({ visibility: 'private' }), NAA);
    expect(tilPrivat).toMatchObject({ fra: 'approximate', til: 'private', restempler: true, nyttJitter: false });
  });

  it('gjør et sone-funn privat: flagget av og navnet bort', () => {
    const plan = planlegg(rad(RADER.zone), patch({ visibility: 'private' }), NAA);
    expect(plan).toMatchObject({
      type: 'skriv',
      verdier: { visibility: 'private', is_zone_finding: false, zone_label: null }
    });
  });

  /**
   * public_findings viser zone_label for alle delte funn. Et navn som ble
   * stående på et funn uten sone, er fritekst som fortsatt går ut.
   */
  it('rydder et sonenavn som har blitt stående på et funn uten sone', () => {
    const plan = planlegg(
      rad({ visibility: 'approximate', zone_label: 'Gammelt navn' }),
      patch({ visibility: 'approximate' }),
      NAA
    );
    expect(plan).toMatchObject({ type: 'skriv', verdier: { zone_label: null }, restempler: false, nyttJitter: false });
  });

  /**
   * Presisjonen er en av de fem kolonnene triggeren i 042 vokter — også når
   * funnet ikke er sone. Skrev vi den på et omtrentlig funn, ville det
   * trukket et nytt punkt uten at delingen var endret.
   */
  it('skriver aldri sonepresisjon på et funn som ikke blir sone', () => {
    for (const fra of NIVAAER) {
      for (const til of ['private', 'approximate', 'public'] as const) {
        const plan = planlegg(
          rad({ ...RADER[fra], zone_precision_km: 3 }),
          patch({ ...PATCHER[til], zonePrecisionKm: 12 }),
          NAA
        );
        if (plan.type === 'skriv') expect(plan.verdier).not.toHaveProperty('zone_precision_km');
      }
    }
  });

  it('beholder sonens rute når presisjonen ikke er sendt', () => {
    const plan = planlegg(
      rad({ ...RADER.zone, zone_precision_km: 8 }),
      patch({ visibility: 'approximate', isZoneFinding: true, zoneLabel: 'Nytt navn' }),
      NAA
    );
    expect(plan).toMatchObject({ type: 'skriv', verdier: { zone_label: 'Nytt navn' }, restempler: false });
    expect(plan.type === 'skriv' && 'zone_precision_km' in plan.verdier).toBe(false);
  });

  it('lar en patch som gjentar radens egen rutestørrelse, gå som om den var utelatt', () => {
    const plan = planlegg(
      rad({ ...RADER.zone, zone_precision_km: 8 }),
      patch({ visibility: 'approximate', isZoneFinding: true, zoneLabel: 'Nytt navn', zonePrecisionKm: 8 }),
      NAA
    );
    expect(plan).toMatchObject({ type: 'skriv', verdier: { zone_label: 'Nytt navn' }, restempler: false });
  });

  it('endrer art og eget artsnavn uavhengig av hverandre', () => {
    expect(planlegg(rad(), patch({ speciesId: null }), NAA)).toMatchObject({ verdier: { species_id: null } });
    expect(planlegg(rad(), patch({ speciesNameOverride: 'Piggsopp' }), NAA)).toMatchObject({
      verdier: { species_name_override: 'Piggsopp' }
    });
  });
});

/**
 * Til migrasjon 075 er bekreftet kjørt, røper sone-stempelet funnets eksakte
 * breddegrad. Å gjøre et funn om til sone ville da lagt ut MER enn den
 * omtrentlige prikken det erstatter — under navnet «hemmeligsted-vennlig».
 */
describe('planleggFunnEndring — omgjøring til sone er stengt til 075 er kjørt', () => {
  it.each(['private', 'approximate', 'public'] as const)('nekter å gjøre et %s funn om til sone', (fra) => {
    for (const endret of [forTimer(1), forTimer(30), '2026-09-01T08:00:00.000000+00:00']) {
      const plan = planlegg(rad({ ...RADER[fra], updated_at: endret }), patch(PATCHER.zone), NAA, false);
      expect(plan).toEqual({ type: 'sone-stengt', grunn: 'omgjoring' });
    }
  });

  it('stopper hele endringen, også notatet som fulgte med', () => {
    const plan = planlegg(rad(RADER.approximate), patch({ ...PATCHER.zone, notes: 'Nytt' }), NAA, false);
    expect(plan).toEqual({ type: 'sone-stengt', grunn: 'omgjoring' });
  });

  it('nekter også når soneflagget står igjen på et privat funn — det ville blitt en rute på kartet', () => {
    const plan = planlegg(rad({ visibility: 'private', is_zone_finding: true }), patch(PATCHER.zone), NAA, false);
    expect(plan).toEqual({ type: 'sone-stengt', grunn: 'omgjoring' });
  });

  it('lar et funn som alt er sone, få nytt navn', () => {
    const plan = planlegg(rad(RADER.zone), patch({ ...PATCHER.zone, zoneLabel: 'Marka nord' }), NAA, false);
    expect(plan).toMatchObject({ type: 'skriv', verdier: { zone_label: 'Marka nord' }, restempler: false });
  });

  it('lar et sone-funn bli privat med en gang, og omtrentlig når karantenen er over', () => {
    expect(planlegg(rad({ ...RADER.zone, updated_at: forTimer(1) }), patch(PATCHER.private), NAA, false).type).toBe(
      'skriv'
    );
    expect(planlegg(rad(RADER.zone), patch(PATCHER.approximate), NAA, false).type).toBe('skriv');
    expect(
      planlegg(rad({ ...RADER.zone, updated_at: forTimer(1) }), patch(PATCHER.approximate), NAA, false).type
    ).toBe('karantene');
  });

  it('rører ikke notat og art på et funn som ikke blir sone', () => {
    const plan = planlegg(rad(RADER.approximate), patch({ notes: 'Nytt', speciesId: 9 }), NAA, false);
    expect(plan).toMatchObject({ type: 'skriv', verdier: { notes: 'Nytt', species_id: 9 } });
  });

  /**
   * Bryteren og hovedboka skal ikke kunne si hver sin ting. Den som slår på
   * omgjøringen uten at 075 er bekreftet kjørt, legger ut breddegraden til
   * hvert funn som gjøres om.
   */
  it('står ikke på før raden 075 i hovedboka er merket «kjørt»', () => {
    const hovedbok = readFileSync(join(process.cwd(), 'docs', 'migrasjoner-a-kjore.md'), 'utf8');
    const rad075 = hovedbok.match(/^\| 075 \| `075_[^`]+` \|.*\|\s*([^|]+?)\s*\|$/m);
    expect(rad075, 'Fant ikke raden 075 i docs/migrasjoner-a-kjore.md').not.toBeNull();
    const status = rad075?.[1] ?? '';
    // «kjørt 20. november 2026» teller. «ikke kjørt» og «trolig kjørt» gjør ikke.
    const bekreftet = /^\**kjørt\b/.test(status);
    expect(
      SONE_OMGJORING_AAPEN && !bekreftet,
      `SONE_OMGJORING_AAPEN er true, men raden 075 i hovedboka sier «${status}». ` +
        'Lim inn migrasjon 075, kjør spørringen i hovedboka, og skriv «kjørt» med dato i raden først.'
    ).toBe(false);
  });
});

/**
 * Flere rutestørrelser for samme funn snevrer inn hvor stedet er — også etter
 * 075 (se sonerute-migrasjon.test.ts). Størrelsen et funn er lagret med, er
 * derfor den eneste det noen gang får.
 */
describe('planleggFunnEndring — rutestørrelsen kan ikke endres', () => {
  for (const [stilling, aapen] of BRYTER) {
    it(`nekter et sone-funn en ny rutestørrelse (omgjøring ${stilling})`, () => {
      for (const endret of [forTimer(0.1), forTimer(30), '2026-09-01T08:00:00.000000+00:00']) {
        for (const km of [1, 4, 6, 10, 50]) {
          const plan = planlegg(
            rad({ ...RADER.zone, updated_at: endret }),
            patch({ ...PATCHER.zone, zonePrecisionKm: km }),
            NAA,
            aapen
          );
          expect(plan, `${km} km`).toEqual({ type: 'sone-stengt', grunn: 'storrelse' });
        }
      }
    });
  }

  it('stopper hele endringen, også det nye navnet som fulgte med', () => {
    const plan = planlegg(rad(RADER.zone), patch({ ...PATCHER.zone, zoneLabel: 'Marka', zonePrecisionKm: 10 }), NAA);
    expect(plan).toEqual({ type: 'sone-stengt', grunn: 'storrelse' });
  });

  it('nekter også et funn som gjøres om til sone, en annen størrelse enn raden står med', () => {
    const plan = planlegg(rad(RADER.approximate), patch({ ...PATCHER.zone, zonePrecisionKm: 12 }), NAA);
    expect(plan).toEqual({ type: 'sone-stengt', grunn: 'storrelse' });
  });

  /**
   * Veien rundt som ikke finnes: sone (5 km) → privat → sone (10 km). Raden
   * beholder størrelsen sin når sonen slås av, så den andre ruta blir den
   * samme som den første.
   */
  it('gir samme rutestørrelse tilbake etter en omvei om privat', () => {
    let funn = rad({ ...RADER.zone, zone_precision_km: 5 });
    const tilPrivat = planlegg(funn, patch(PATCHER.private), NAA);
    expect(tilPrivat.type).toBe('skriv');
    if (tilPrivat.type !== 'skriv') return;
    funn = { ...funn, ...tilPrivat.verdier, updated_at: new Date(NAA).toISOString() };
    expect(funn.zone_precision_km).toBe(5);

    const senere = NAA + 48 * TIME;
    expect(planlegg(funn, patch({ ...PATCHER.zone, zonePrecisionKm: 10 }), senere)).toEqual({
      type: 'sone-stengt',
      grunn: 'storrelse'
    });
    const tilbake = planlegg(funn, patch({ visibility: 'approximate', isZoneFinding: true, zoneLabel: 'Nordmarka' }), senere);
    expect(tilbake).toMatchObject({ type: 'skriv', til: 'zone', restempler: true, nyttJitter: false });
    expect(tilbake.type === 'skriv' && 'zone_precision_km' in tilbake.verdier).toBe(false);
  });

  it('sier «omgjøring» før «størrelse» når begge gjelder — den første er grunnen brukeren kan gjøre noe med', () => {
    const plan = planlegg(rad(RADER.approximate), patch({ ...PATCHER.zone, zonePrecisionKm: 12 }), NAA, false);
    expect(plan).toEqual({ type: 'sone-stengt', grunn: 'omgjoring' });
  });
});
