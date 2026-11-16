import { describe, expect, it } from 'vitest';
import { stemAvFunnlag, type TegnetFunn } from '../funnlag-avstemming';

/**
 * Funnlaget stemmes av mot et nytt svar i stedet for å tømmes og bygges opp:
 * en markør som fortsatt skal stå, røres ikke — og tar da ikke popupen sin med
 * seg. Reglene for hva som står, hva som går ut og hva som kommer inn.
 */

const funn = (id: string, lat: number | null = 59.9, lng: number | null = 10.7, edibility: string | null = 'edible') => ({
  id,
  display_lat: lat,
  display_lng: lng,
  edibility
});

const tegnet = (...innslag: Array<[string, TegnetFunn]>) => new Map(innslag);
const paa = (lat = 59.9, lng = 10.7, edibility: string | null = 'edible'): TegnetFunn => ({ lat, lng, edibility });

const ider = (liste: Array<{ id: string }>) => liste.map((f) => f.id);

describe('stemAvFunnlag', () => {
  it('tomt lag: alt som kan tegnes, skal inn', () => {
    const svar = stemAvFunnlag(tegnet(), [funn('a'), funn('b')]);
    expect(ider(svar.inn)).toEqual(['a', 'b']);
    expect(svar.staar).toEqual([]);
    expect(svar.ut).toEqual([]);
  });

  it('samme svar en gang til: alt står, ingenting ut eller inn', () => {
    const svar = stemAvFunnlag(tegnet(['a', paa()], ['b', paa()]), [funn('a'), funn('b')]);
    expect(ider(svar.staar)).toEqual(['a', 'b']);
    expect(svar.inn).toEqual([]);
    expect(svar.ut).toEqual([]);
  });

  it('kartet er flyttet: det som fortsatt er i utsnittet står, resten byttes', () => {
    const svar = stemAvFunnlag(tegnet(['a', paa()], ['b', paa()]), [funn('b'), funn('c')]);
    expect(ider(svar.staar)).toEqual(['b']);
    expect(ider(svar.inn)).toEqual(['c']);
    expect(svar.ut).toEqual(['a']);
  });

  it('tomt svar: alt skal ut', () => {
    const svar = stemAvFunnlag(tegnet(['a', paa()], ['b', paa()]), []);
    expect(svar.ut.sort()).toEqual(['a', 'b']);
    expect(svar.staar).toEqual([]);
    expect(svar.inn).toEqual([]);
  });

  it('et funn som har flyttet seg, tegnes på nytt — ut og inn', () => {
    const svar = stemAvFunnlag(tegnet(['a', paa(59.9, 10.7)]), [funn('a', 59.91, 10.7)]);
    expect(svar.ut).toEqual(['a']);
    expect(ider(svar.inn)).toEqual(['a']);
    expect(svar.staar).toEqual([]);
  });

  it('et funn som har byttet spiselighet, tegnes på nytt — markøren har farge etter den', () => {
    const svar = stemAvFunnlag(tegnet(['a', paa(59.9, 10.7, 'edible')]), [funn('a', 59.9, 10.7, 'toxic')]);
    expect(svar.ut).toEqual(['a']);
    expect(ider(svar.inn)).toEqual(['a']);
  });

  it('ukjent spiselighet er det samme enten den er null eller mangler', () => {
    const utenFelt = { id: 'a', display_lat: 59.9, display_lng: 10.7, edibility: undefined as unknown as null };
    const svar = stemAvFunnlag(tegnet(['a', paa(59.9, 10.7, null)]), [utenFelt]);
    expect(ider(svar.staar)).toEqual(['a']);
    expect(svar.ut).toEqual([]);
  });

  it('funn uten visningskoordinater tegnes ikke', () => {
    const svar = stemAvFunnlag(tegnet(), [funn('a', null, 10.7), funn('b', 59.9, null), funn('c')]);
    expect(ider(svar.inn)).toEqual(['c']);
  });

  it('et funn som har mistet koordinatene sine, tas ut', () => {
    const svar = stemAvFunnlag(tegnet(['a', paa()]), [funn('a', null, null)]);
    expect(svar.ut).toEqual(['a']);
    expect(svar.inn).toEqual([]);
    expect(svar.staar).toEqual([]);
  });

  it('samme id to ganger i svaret gir én markør', () => {
    const svar = stemAvFunnlag(tegnet(), [funn('a'), funn('a')]);
    expect(ider(svar.inn)).toEqual(['a']);
  });

  it('hvert funn havner i nøyaktig én av «står» og «inn», og «ut» er resten av det som var tegnet', () => {
    const var_ = tegnet(['a', paa()], ['b', paa()], ['c', paa(60, 11)]);
    const nye = [funn('b'), funn('c'), funn('d'), funn('e', null, null)];
    const svar = stemAvFunnlag(var_, nye);
    const staar = new Set(ider(svar.staar));
    const inn = new Set(ider(svar.inn));
    for (const id of staar) expect(inn.has(id)).toBe(false);
    // c står på et annet punkt enn før: ut og inn. a er borte: ut. b står.
    expect([...staar]).toEqual(['b']);
    expect([...inn].sort()).toEqual(['c', 'd']);
    expect(svar.ut.sort()).toEqual(['a', 'c']);
  });

  it('gir funnene videre uendret, så kartet kan tegne av dem', () => {
    const rikt = { ...funn('a'), username: 'sopper', notes: 'ved grana' };
    const svar = stemAvFunnlag(tegnet(), [rikt]);
    expect(svar.inn[0]).toBe(rikt);
  });
});
