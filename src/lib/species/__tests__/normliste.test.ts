import { describe, expect, it } from 'vitest';
import {
  cautionRank,
  DELIBERATE_DIVERGENCES,
  NORMLISTE_TO_EDIBILITY,
  NOT_ON_NORMLISTE,
  reconcileWithNormliste,
  type NormlisteCategory
} from '../normliste';
import { isDangerousEdibility } from '@/lib/utils/edibility';
import type { Edibility } from '@/types/species';

/**
 * Hele artslisten ble kontrollert mot NSNFs normliste 2026-08-04 (migrasjon 047).
 * Funnet som ga disse testene: av 6 avvik pekte 3 mot mer forsiktighet og 3 mot
 * mindre. En regel som bare fulgte normlisten ville svekket tre advarsler.
 *
 * Testene under vokter den regelen som faktisk gjelder — ta den mest forsiktige
 * av de to — og de tre bevisste avvikene som ellers ser ut som etterslep.
 */
describe('forsoning med normlisten', () => {
  it('følger normlisten når den er strengere enn oss', () => {
    // De tre ekte funnene fra kontrollen.
    expect(reconcileWithNormliste('edible', 'Ikke matsopp')).toBe('inedible'); // falsk kantarell
    expect(reconcileWithNormliste('conditionally_edible', 'Ikke matsopp')).toBe('inedible'); // honningsopp
    expect(reconcileWithNormliste('edible', 'Spiselig med merknad')).toBe('conditionally_edible'); // rødskrubb
  });

  it('beholder vårt når VI er strengere — dette er hele poenget', () => {
    // Sandmorkel: NSNF sier «Giftig», vi sier deadly. Gyromitrin har tatt liv.
    expect(reconcileWithNormliste('deadly', 'Giftig')).toBe('deadly');
    // Giftkremle: NSNF sier «Ikke matsopp», vi sier toxic.
    expect(reconcileWithNormliste('toxic', 'Ikke matsopp')).toBe('toxic');
    // Svovelriske: NSNF sier «Spiselig etter avkoking», vi sier inedible.
    expect(reconcileWithNormliste('inedible', 'Spiselig etter avkoking')).toBe('inedible');
  });

  it('kan ALDRI gjøre en art friere enn den allerede står', () => {
    const alle: Edibility[] = [
      'edible',
      'conditionally_edible',
      'inedible',
      'toxic',
      'deadly',
      'unknown'
    ];
    const kategorier = Object.keys(NORMLISTE_TO_EDIBILITY) as NormlisteCategory[];
    for (const vaar of alle) {
      for (const kat of kategorier) {
        const ut = reconcileWithNormliste(vaar, kat);
        expect(
          cautionRank(ut),
          `${vaar} + «${kat}» ga ${ut}, som er friere enn utgangspunktet`
        ).toBeGreaterThanOrEqual(cautionRank(vaar));
      }
    }
  });

  it('lar ingen ekstern kategori snakke oss ned fra «unknown»', () => {
    // unknown utløser rød advarsel i appen. En liste skal ikke kunne gjøre den grønn.
    const kategorier = Object.keys(NORMLISTE_TO_EDIBILITY) as NormlisteCategory[];
    for (const kat of kategorier) {
      expect(reconcileWithNormliste('unknown', kat)).toBe('unknown');
      expect(isDangerousEdibility(reconcileWithNormliste('unknown', kat))).toBe(true);
    }
  });

  it('kartlegger begge de betingede kategoriene til conditionally_edible', () => {
    expect(NORMLISTE_TO_EDIBILITY['Spiselig med merknad']).toBe('conditionally_edible');
    expect(NORMLISTE_TO_EDIBILITY['Spiselig etter avkoking']).toBe('conditionally_edible');
  });

  it('holder «ikke matsopp» og «giftig» fra hverandre', () => {
    // Normlisten har en egen «Giftig»-kategori. At en art står som «Ikke matsopp»
    // betyr at NSNF bevisst IKKE kalte den giftig — samme presedens som
    // ametystsopp i migrasjon 046.
    expect(NORMLISTE_TO_EDIBILITY['Ikke matsopp']).toBe('inedible');
    expect(NORMLISTE_TO_EDIBILITY.Giftig).toBe('toxic');
    expect(NORMLISTE_TO_EDIBILITY['Meget giftig']).toBe('deadly');
  });
});

describe('de bevisste avvikene', () => {
  it('er alle strengere enn normlisten, aldri mildere', () => {
    for (const d of DELIBERATE_DIVERGENCES) {
      const nsnf = NORMLISTE_TO_EDIBILITY[d.normliste];
      expect(
        cautionRank(d.vaar),
        `${d.norsk}: vi står ${d.vaar}, NSNF ${nsnf} — et avvik skal aldri gå mot friere`
      ).toBeGreaterThan(cautionRank(nsnf));
    }
  });

  it('overlever forsoningsregelen — den skal ikke rette dem bort', () => {
    for (const d of DELIBERATE_DIVERGENCES) {
      expect(reconcileWithNormliste(d.vaar, d.normliste), d.norsk).toBe(d.vaar);
    }
  });

  it('har en begrunnelse hver, så ingen «rydder» dem senere', () => {
    for (const d of DELIBERATE_DIVERGENCES) {
      expect(d.hvorfor.length, d.norsk).toBeGreaterThan(60);
    }
  });

  it('nevner sandmorkelen med det norske navnet Artsdatabanken bruker', () => {
    // Het «Steinmorkel» i basen fram til 047 — en oversettelse av svensk
    // «stenmurkla». Den er den dødelige forvekslingsarten for begge morklene
    // våre, så navnet må være det folk faktisk slår opp.
    const sand = DELIBERATE_DIVERGENCES.find((d) => d.latin === 'Gyromitra esculenta');
    expect(sand?.norsk).toBe('Sandmorkel');
    expect(sand?.vaar).toBe('deadly');
  });
});

describe('artene som ikke står på normlisten', () => {
  it('overlapper ikke med de bevisste avvikene', () => {
    const avvik = new Set(DELIBERATE_DIVERGENCES.map((d) => d.latin));
    for (const a of NOT_ON_NORMLISTE) {
      expect(avvik.has(a.latin), `${a.norsk} kan ikke både mangle og avvike`).toBe(false);
    }
  });

  it('teller 6 — endres tallet, er lista kontrollert på nytt', () => {
    // Vokteren mot at noen legger til en art her uten å ha slått den opp.
    expect(NOT_ON_NORMLISTE.length).toBe(6);
  });
});
