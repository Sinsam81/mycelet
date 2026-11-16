import { describe, expect, it } from 'vitest';
import { dagerTilRydding, funnTilKort, type EgetFunnRad } from '../mine-funn';
import { DELING_KARANTENE_TIMER } from '../delingsendring';
import { PURGE_AFTER_DAYS } from '@/app/api/cron/purge-deleted-findings/route';

const DAG = 24 * 60 * 60 * 1000;
const TIME = 60 * 60 * 1000;
/** Fast klokke — testene skal ikke avhenge av dagens dato. */
const NAA = Date.parse('2026-11-10T12:00:00.000Z');
const forDager = (dager: number) => new Date(NAA - dager * DAG).toISOString();

function rad(over: Partial<EgetFunnRad> = {}): EgetFunnRad {
  return {
    id: 'funn-1',
    visibility: 'private',
    is_zone_finding: false,
    zone_label: null,
    zone_precision_km: 5,
    notes: null,
    image_url: null,
    created_at: '2026-09-01T08:00:00+00:00',
    updated_at: '2026-09-01T08:00:00+00:00',
    ...over
  };
}

const tekst = { artsnavn: 'Kantarell', datoTekst: '1. sep. 2026' };

describe('funnTilKort', () => {
  it('bærer med seg det lista viser, og ingenting om posisjonen', () => {
    const kort = funnTilKort(rad({ notes: 'Ved bekken', image_url: 'https://example.com/a.jpg' }), tekst, NAA);
    expect(kort).toEqual({
      id: 'funn-1',
      artsnavn: 'Kantarell',
      datoTekst: '1. sep. 2026',
      deling: 'private',
      soneNavn: null,
      soneKm: 5,
      notat: 'Ved bekken',
      bilde: 'https://example.com/a.jpg',
      aapnesTidligst: null
    });
    expect(Object.keys(kort).join(' ')).not.toMatch(/lat|lng|lon/i);
  });

  it('leser delingsnivået som ruta gjør', () => {
    expect(funnTilKort(rad({ visibility: 'approximate' }), tekst, NAA).deling).toBe('approximate');
    expect(funnTilKort(rad({ visibility: 'public' }), tekst, NAA).deling).toBe('public');
    expect(
      funnTilKort(rad({ visibility: 'approximate', is_zone_finding: true, zone_label: 'Nordmarka' }), tekst, NAA)
    ).toMatchObject({ deling: 'zone', soneNavn: 'Nordmarka' });
  });

  it('viser ikke et sonenavn som har blitt stående på et funn uten sone', () => {
    expect(funnTilKort(rad({ visibility: 'approximate', zone_label: 'Gammelt navn' }), tekst, NAA).soneNavn).toBeNull();
    expect(
      funnTilKort(rad({ visibility: 'private', is_zone_finding: true, zone_label: 'Gammelt navn' }), tekst, NAA).soneNavn
    ).toBeNull();
  });

  it('faller tilbake på lagringsflatens standardrute når presisjonen mangler', () => {
    expect(funnTilKort(rad({ zone_precision_km: null }), tekst, NAA).soneKm).toBe(5);
    expect(funnTilKort(rad({ zone_precision_km: 12 }), tekst, NAA).soneKm).toBe(12);
  });

  it('sier når et nylig endret funn tidligst kan deles åpnere', () => {
    const endret = new Date(NAA - 2 * TIME).toISOString();
    const kort = funnTilKort(rad({ updated_at: endret }), tekst, NAA);
    expect(kort.aapnesTidligst).toBe(new Date(Date.parse(endret) + DELING_KARANTENE_TIMER * TIME).toISOString());
  });

  it('har ingen sperre når funnet har stått urørt i et døgn', () => {
    expect(funnTilKort(rad({ updated_at: forDager(1.01) }), tekst, NAA).aapnesTidligst).toBeNull();
  });
});

describe('dagerTilRydding', () => {
  it('gir hele fristen til et funn som nettopp er slettet', () => {
    expect(dagerTilRydding(forDager(0), NAA, 30)).toBe(30);
  });

  it('runder opp — «1 dag» betyr at det fortsatt er tid igjen i dag', () => {
    expect(dagerTilRydding(forDager(0.5), NAA, 30)).toBe(30);
    expect(dagerTilRydding(forDager(1), NAA, 30)).toBe(29);
    expect(dagerTilRydding(forDager(29), NAA, 30)).toBe(1);
    expect(dagerTilRydding(forDager(29.9), NAA, 30)).toBe(1);
  });

  it('gir 0 når fristen er ute — raden finnes da bare til neste rydding', () => {
    expect(dagerTilRydding(forDager(30), NAA, 30)).toBe(0);
    expect(dagerTilRydding(forDager(45), NAA, 30)).toBe(0);
  });

  it('følger fristen den får, ikke et tall skrevet her', () => {
    expect(dagerTilRydding(forDager(3), NAA, 7)).toBe(4);
    expect(dagerTilRydding(forDager(3), NAA, 90)).toBe(87);
  });

  it('lover aldri mer enn fristen, selv om klokkene er uenige', () => {
    // deleted_at litt fram i tid: databasens klokke går foran serverens.
    expect(dagerTilRydding(new Date(NAA + 5 * 60 * 1000).toISOString(), NAA, 30)).toBe(30);
  });

  it('gir 0 for et tidspunkt som ikke lar seg lese', () => {
    expect(dagerTilRydding('ikke en dato', NAA, 30)).toBe(0);
  });

  /**
   * Lista og ryddejobben skal si samme frist. Siden importerer konstanten fra
   * jobben; denne testen holder regnestykket fast til den.
   */
  it('stemmer med ryddejobbens grense: et funn jobben ville tatt nå, har 0 dager igjen', () => {
    const grense = NAA - PURGE_AFTER_DAYS * DAG;
    expect(dagerTilRydding(new Date(grense - 1).toISOString(), NAA, PURGE_AFTER_DAYS)).toBe(0);
    expect(dagerTilRydding(new Date(grense + 60_000).toISOString(), NAA, PURGE_AFTER_DAYS)).toBe(1);
  });
});
