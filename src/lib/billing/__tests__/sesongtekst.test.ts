import { describe, expect, it } from 'vitest';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';
import { COMPONENT_MAX, computeSeasonalScore } from '@/lib/utils/prediction';
import {
  lovendeLofte,
  passDekning,
  prediksjonspunktHjem,
  prediksjonspunktPris,
  prisSesonglinje,
  provearkTekst
} from '../sesongtekst';

const midtI = (maaned: number) => new Date(`2026-${String(maaned).padStart(2, '0')}-15T11:00:00Z`);
const ALLE_MANEDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe('prisSesonglinje', () => {
  it('sier «høysesongen er i gang» bare i månedene teksten selv navngir', () => {
    const medUrgency = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(
      (m) => prisSesonglinje(midtI(m)) === 'seasonUrgency'
    );
    expect(medUrgency).toEqual([9, 10]);
    expect(nb.Pricing.seasonUrgency).toMatch(/september og oktober/);
    expect(sv.Pricing.seasonUrgency).toMatch(/september och oktober/);
  });

  it('desember–mai: «hele neste soppsesong er med», som er sant for et ettårspass kjøpt da', () => {
    for (const m of [12, 1, 2, 3, 4, 5]) expect(prisSesonglinje(midtI(m))).toBe('seasonOffSeason');
  });

  it('juni–august og november: ingen linje (passet utløper midt i neste sesong)', () => {
    for (const m of [6, 7, 8, 11]) expect(prisSesonglinje(midtI(m))).toBeNull();
  });

  it('skifter på Oslo-dato, ikke UTC', () => {
    // 31. okt 23:30 UTC = 1. nov 00:30 i Oslo (vintertid).
    expect(prisSesonglinje(new Date('2026-10-31T22:30:00Z'))).toBe('seasonUrgency');
    expect(prisSesonglinje(new Date('2026-10-31T23:30:00Z'))).toBeNull();
    // 31. aug 22:30 UTC = 1. sep 00:30 i Oslo (sommertid).
    expect(prisSesonglinje(new Date('2026-08-31T21:30:00Z'))).toBeNull();
    expect(prisSesonglinje(new Date('2026-08-31T22:30:00Z'))).toBe('seasonUrgency');
  });

  it('tekstene finnes på begge språk og inneholder ingen beløp', () => {
    for (const katalog of [nb, sv]) {
      expect(katalog.Pricing.seasonOffSeason).toBeTruthy();
      expect(katalog.Pricing.seasonOffSeason).not.toMatch(/\d|kr/);
    }
    expect(sv.Pricing.seasonOffSeason).not.toBe(nb.Pricing.seasonOffSeason);
  });
});

describe('passDekning', () => {
  it('velger ledd etter sesongfasen', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => passDekning(midtI(m)))).toEqual([
      'passDekningUtenomSesong',
      'passDekningUtenomSesong',
      'passDekningUtenomSesong',
      'passDekningUtenomSesong',
      'passDekningUtenomSesong',
      'passDekningForsesong',
      'passDekningForsesong',
      'passDekningHost',
      'passDekningHost',
      'passDekningHost',
      'passDekningHost',
      'passDekningUtenomSesong'
    ]);
  });

  it('«resten av høsten nå» står bare i høstleddet', () => {
    expect(nb.ProvGratisArk.passDekningHost).toContain('resten av høsten nå');
    expect(sv.ProvGratisArk.passDekningHost).toContain('resten av hösten nu');
    for (const nokkel of ['passDekningForsesong', 'passDekningUtenomSesong'] as const) {
      expect(nb.ProvGratisArk[nokkel]).not.toMatch(/høst/);
      expect(sv.ProvGratisArk[nokkel]).not.toMatch(/höst/);
    }
    // Vilkårsstrengene selv er sesongnøytrale: alt sesongavhengig kommer via {dekning}.
    for (const katalog of [nb, sv]) {
      for (const nokkel of ['passVilkaar', 'passVilkaarProve', 'passVilkaarProveUkjentLengde'] as const) {
        expect(katalog.ProvGratisArk[nokkel]).toContain('{dekning}');
        expect(katalog.ProvGratisArk[nokkel]).not.toMatch(/høst|höst/);
      }
    }
  });
});

/**
 * ⭐ Lovende finner ofte ingenting fra november til juni — også for betalende.
 * Da skal ingen flate som ber om penger love «alle 12 lovende områder nær
 * deg» som noe kunden får nå.
 */
describe('lovendeLofte — løftet om lovende områder følger sesongen', () => {
  it('«nå» bare juli–oktober; november–juni er betinget', () => {
    expect(ALLE_MANEDER.map((m) => lovendeLofte(midtI(m)))).toEqual([
      'betinget', // jan
      'betinget', // feb
      'betinget', // mar
      'betinget', // apr
      'betinget', // mai
      'betinget', // jun — soppsesong i kalenderen, men sesongleddet er mais
      'naa', // jul
      'naa', // aug
      'naa', // sep
      'naa', // okt
      'betinget', // nov — soppsesong i kalenderen, men kulda stenger kartet
      'betinget' // des
    ]);
  });

  it('november er betinget selv om den er soppsesong i kalenderen og {dekning} sier «resten av høsten»', () => {
    const november = midtI(11);
    expect(passDekning(november)).toBe('passDekningHost');
    expect(lovendeLofte(november)).toBe('betinget');
  });

  it('skifter på Oslo-dato, ikke UTC', () => {
    // 31. okt 22:30 UTC = 23:30 i Oslo (vintertid); 23:30 UTC = 1. nov 00:30.
    expect(lovendeLofte(new Date('2026-10-31T22:30:00Z'))).toBe('naa');
    expect(lovendeLofte(new Date('2026-10-31T23:30:00Z'))).toBe('betinget');
    // 30. juni 21:30 UTC = 23:30 i Oslo (sommertid); 22:30 UTC = 1. juli 00:30.
    expect(lovendeLofte(new Date('2027-06-30T21:30:00Z'))).toBe('betinget');
    expect(lovendeLofte(new Date('2027-06-30T22:30:00Z'))).toBe('naa');
    // 1. juni skifter ingenting: soppsesongen starter, men løftet venter på juli.
    expect(lovendeLofte(new Date('2027-05-31T22:30:00Z'))).toBe('betinget');
  });

  it('juni står med mai: samme sesongledd i rutenettets score, og «nå» krever minst julis', () => {
    // Ved samme vær er sesongleddet det eneste som skiller månedene i scoren
    // ⭐ Lovende leser (cell-score.ts). Juni har mais 5, juli 10, august–oktober 15.
    expect(computeSeasonalScore(6)).toBe(computeSeasonalScore(5));
    expect(lovendeLofte(midtI(6))).toBe(lovendeLofte(midtI(5)));
    for (const m of ALLE_MANEDER) {
      const ledd = computeSeasonalScore(m);
      if (lovendeLofte(midtI(m)) === 'naa') {
        expect(ledd, `måned ${m}`).toBeGreaterThanOrEqual(computeSeasonalScore(7));
      }
      if (ledd === COMPONENT_MAX.seasonal) expect(lovendeLofte(midtI(m)), `måned ${m}`).toBe('naa');
    }
  });

  it('alle tre flatene følger den samme porten, måned for måned', () => {
    for (const m of ALLE_MANEDER) {
      const naa = lovendeLofte(midtI(m)) === 'naa';
      expect(provearkTekst(midtI(m)), `arket i måned ${m}`).toBe(naa ? 'tekstStart' : 'tekstStartBetinget');
      expect(prediksjonspunktHjem(midtI(m)), `forsiden i måned ${m}`).toBe(
        naa ? 'premiumFeatureFullPrediction' : 'premiumFeatureFullPredictionBetinget'
      );
      expect(prediksjonspunktPris(midtI(m)), `prissiden i måned ${m}`).toBe(naa ? 'premiumFeature2' : 'premiumFeature2Betinget');
    }
  });

  it.each([
    ['nb', nb],
    ['sv', sv]
  ] as const)('%s: hver måned får en tekst som finnes, og «12» står bare juli–oktober', (_locale, katalog) => {
    for (const m of ALLE_MANEDER) {
      const ark = katalog.ProvGratisArk[provearkTekst(midtI(m))];
      const hjem = katalog.Home[prediksjonspunktHjem(midtI(m))];
      const pris = katalog.Pricing[prediksjonspunktPris(midtI(m))];
      for (const tekst of [ark, hjem, pris]) expect(tekst, `måned ${m}`).toBeTruthy();
      if (lovendeLofte(midtI(m)) === 'naa') {
        expect(ark, `måned ${m}`).toMatch(/^(Opptil|Upp till) 12 /);
      } else {
        expect(ark, `måned ${m}`).not.toMatch(/\b12\b/);
      }
    }
  });

  it('den betingede arkteksten navngir nøyaktig månedene porten dekker', () => {
    const betingede = ALLE_MANEDER.filter((m) => lovendeLofte(midtI(m)) === 'betinget');
    expect(betingede).toEqual([1, 2, 3, 4, 5, 6, 11, 12]);
    expect(nb.ProvGratisArk.tekstStartBetinget).toContain('Fra november til juni er forholdene ofte for svake');
    expect(sv.ProvGratisArk.tekstStartBetinget).toContain('Från november till juni är förhållandena ofta för svaga');
  });

  it('den betingede teksten bruker kartets egne ord, så arket og ⭐ Lovende sier det samme', () => {
    // Kartet når søket stopper: «forholdene er for svake til at vi kaller noe lovende akkurat nå».
    expect(nb.MushroomMap.weakConditions).toContain('forholdene er for svake til at vi kaller noe lovende');
    expect(nb.ProvGratisArk.tekstStartBetinget).toContain('for svake til at kartet kaller noe lovende');
    expect(sv.MushroomMap.weakConditions).toContain('förhållandena är för svaga för att vi ska kalla något lovande');
    expect(sv.ProvGratisArk.tekstStartBetinget).toContain('för svaga för att kartan ska kalla något lovande');
  });

  it('den betingede teksten beholder rekkefølgen — områdene først, AI sist — og sier hva du får med en gang', () => {
    for (const [katalog, offline, ai, medEnGang] of [
      [nb, 'Offline-kart', 'AI-soppkjenner', 'får du med en gang'],
      [sv, 'Offlinekarta', 'AI-svampkännare', 'får du direkt']
    ] as const) {
      const tekst = katalog.ProvGratisArk.tekstStartBetinget;
      expect(tekst.indexOf(offline)).toBeGreaterThan(0);
      expect(tekst.indexOf(offline)).toBeLessThan(tekst.indexOf(ai));
      expect(tekst).toContain(medEnGang);
      // «hovedsesong» er kodens ord, ikke tekstens (sesongtilstand.ts).
      expect(tekst).not.toMatch(/hovedsesong|huvudsäsong/i);
    }
    expect(sv.ProvGratisArk.tekstStartBetinget).not.toBe(nb.ProvGratisArk.tekstStartBetinget);
  });

  it('Premium-punktet utenom sesongen er betinget på begge språk og på begge flatene', () => {
    expect(nb.Home.premiumFeatureFullPredictionBetinget).toBe(nb.Pricing.premiumFeature2Betinget);
    expect(sv.Home.premiumFeatureFullPredictionBetinget).toBe(sv.Pricing.premiumFeature2Betinget);
    expect(nb.Pricing.premiumFeature2Betinget).toMatch(/når forholdene tillater det$/);
    expect(sv.Pricing.premiumFeature2Betinget).toMatch(/när förhållandena tillåter det$/);
    // Sesongteksten er den gamle punktteksten pluss vilkåret — ikke en ny påstand.
    expect(nb.Pricing.premiumFeature2Betinget.startsWith(nb.Pricing.premiumFeature2)).toBe(true);
    expect(sv.Pricing.premiumFeature2Betinget.startsWith(sv.Pricing.premiumFeature2)).toBe(true);
  });
});
