import { describe, expect, it } from 'vitest';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';
import { passDekning, prisSesonglinje } from '../sesongtekst';

const midtI = (maaned: number) => new Date(`2026-${String(maaned).padStart(2, '0')}-15T11:00:00Z`);

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
