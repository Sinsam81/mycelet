import { describe, expect, it } from 'vitest';
import { erTomPlan, planleggAdopsjon, type EgenVarselRad, type KontolosVarselRad } from '../adopsjon';

/**
 * Tre av de fem som fulgte et område 17. september 2026 meldte seg på gjennom
 * det kontoløse skjemaet, ofte før kontoen fantes. Reglene her kobler den raden
 * til kontoen — og må ALDRI kunne koble den til feil konto.
 */

const kontolos = (over: Partial<KontolosVarselRad>): KontolosVarselRad => ({
  id: 'k1',
  user_id: null,
  email: 'sopp@eksempel.no',
  region: 'Bergen',
  active: true,
  confirmed_at: '2026-08-01T10:00:00Z',
  ...over
});

const egen = (over: Partial<EgenVarselRad>): EgenVarselRad => ({
  id: 'e1',
  region: 'Bergen',
  active: true,
  ...over
});

describe('planleggAdopsjon', () => {
  it('adopterer en bekreftet, aktiv kontoløs rad på samme adresse', () => {
    const plan = planleggAdopsjon({ brukerEpost: 'sopp@eksempel.no', kontolose: [kontolos({})], egne: [] });
    expect(plan.adopter).toEqual(['k1']);
    expect(plan.deaktiverKontolos).toEqual([]);
  });

  it('sammenligner adressen uten store bokstaver og mellomrom', () => {
    const plan = planleggAdopsjon({
      brukerEpost: '  Sopp@Eksempel.NO ',
      kontolose: [kontolos({ email: 'SOPP@eksempel.no ' })],
      egne: []
    });
    expect(plan.adopter).toEqual(['k1']);
  });

  it('rører ALDRI en rad med en annen adresse — heller ikke en som ligner', () => {
    const plan = planleggAdopsjon({
      brukerEpost: 'sopp@eksempel.no',
      kontolose: [
        kontolos({ id: 'annen', email: 'sopp@eksempel.nu' }),
        kontolos({ id: 'delstreng', email: 'xsopp@eksempel.no' }),
        kontolos({ id: 'pluss', email: 'sopp+kantarell@eksempel.no' }),
        kontolos({ id: 'joker', email: '%@%.%' }),
        kontolos({ id: 'tom', email: null })
      ],
      egne: []
    });
    expect(erTomPlan(plan)).toBe(true);
  });

  it('gjør ingenting uten en adresse å matche på', () => {
    expect(erTomPlan(planleggAdopsjon({ brukerEpost: null, kontolose: [kontolos({})], egne: [] }))).toBe(true);
    expect(erTomPlan(planleggAdopsjon({ brukerEpost: '  ', kontolose: [kontolos({})], egne: [] }))).toBe(true);
  });

  it('lar ubekreftede og avmeldte rader ligge', () => {
    const plan = planleggAdopsjon({
      brukerEpost: 'sopp@eksempel.no',
      kontolose: [
        // Dobbel opt-in ikke fullført: en user_id ville gjort raden «bekreftet»
        // for utsendingen uten at noen klikket noe.
        kontolos({ id: 'ubekreftet', confirmed_at: null }),
        // Et nei vi ikke skal rulle tilbake.
        kontolos({ id: 'avmeldt', region: 'Oslo', active: false })
      ],
      egne: []
    });
    expect(erTomPlan(plan)).toBe(true);
  });

  it('flytter aldri en rad som alt tilhører noen', () => {
    const plan = planleggAdopsjon({
      brukerEpost: 'sopp@eksempel.no',
      kontolose: [kontolos({ user_id: 'en-annen-konto' })],
      egne: []
    });
    expect(erTomPlan(plan)).toBe(true);
  });

  it('slår av den kontoløse raden når kontoen alt følger samme område', () => {
    // unique(user_id, region) gjør adopsjon umulig her — og to rader for samme
    // menneske og samme område er nettopp det vi vil bli kvitt.
    const plan = planleggAdopsjon({
      brukerEpost: 'sopp@eksempel.no',
      kontolose: [kontolos({})],
      egne: [egen({ region: 'Bergen', active: true })]
    });
    expect(plan.adopter).toEqual([]);
    expect(plan.deaktiverKontolos).toEqual(['k1']);
    expect(plan.aktiverEgen).toEqual([]);
  });

  it('skrur på kontoens egen rad når den er avslått mens den kontoløse er aktiv', () => {
    // Mennesket ER påmeldt (bekreftet e-postrad). Etter sammenslåingen ser hen
    // det i appen og kan skru det av der.
    const plan = planleggAdopsjon({
      brukerEpost: 'sopp@eksempel.no',
      kontolose: [kontolos({})],
      egne: [egen({ id: 'e1', region: 'Bergen', active: false })]
    });
    expect(plan.deaktiverKontolos).toEqual(['k1']);
    expect(plan.aktiverEgen).toEqual(['e1']);
  });

  it('adopterer bare én rad per område', () => {
    const plan = planleggAdopsjon({
      brukerEpost: 'sopp@eksempel.no',
      kontolose: [kontolos({ id: 'a', region: 'Oslo' }), kontolos({ id: 'b', region: 'Oslo' })],
      egne: []
    });
    expect(plan.adopter).toEqual(['a']);
    expect(plan.deaktiverKontolos).toEqual(['b']);
  });

  it('tar flere områder i ett jafs når kontoen ikke har dem fra før', () => {
    const plan = planleggAdopsjon({
      brukerEpost: 'sopp@eksempel.no',
      kontolose: [kontolos({ id: 'a', region: 'Oslo' }), kontolos({ id: 'b', region: 'Bergen' })],
      egne: []
    });
    expect(plan.adopter).toEqual(['a', 'b']);
  });
});
