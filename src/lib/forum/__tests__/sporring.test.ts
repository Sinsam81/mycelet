import { describe, expect, it } from 'vitest';
import { brukForumFilter } from '../sporring';
import { grupperKommentarer } from '../kommentartre';

class FalskSporring {
  constructor(readonly steg: string[] = []) {}
  eq(column: string, value: string | number) {
    return new FalskSporring([...this.steg, `eq:${column}=${value}`]);
  }
  order(column: string, options: { ascending: boolean }) {
    return new FalskSporring([...this.steg, `order:${column}:${options.ascending ? 'asc' : 'desc'}`]);
  }
}

const steg = (...args: Parameters<typeof brukForumFilter> extends [unknown, ...infer R] ? R : never) =>
  brukForumFilter(new FalskSporring(), ...args).steg;

describe('brukForumFilter', () => {
  it('nyeste: bare sortering, og kategorien når den er valgt', () => {
    expect(steg('newest', null)).toEqual(['order:created_at:desc']);
    expect(steg('newest', 'tip')).toEqual(['eq:category=tip', 'order:created_at:desc']);
  });

  it('populære: flest likes først, nyeste som uavgjort-regel', () => {
    expect(steg('popular', null)).toEqual(['order:likes_count:desc', 'order:created_at:desc']);
  });

  it('ubesvarte uten kategori betyr ubesvarte spørsmål', () => {
    expect(steg('unanswered', null)).toEqual(['eq:category=question', 'eq:comments_count=0', 'order:created_at:desc']);
  });

  it('ubesvarte + valgt kategori legger aldri to kategorifiltre oppå hverandre', () => {
    // To eq på samme kolonne ga alltid tom liste («Ubesvarte» + «Funn»).
    const funn = steg('unanswered', 'find');
    expect(funn).toEqual(['eq:category=find', 'eq:comments_count=0', 'order:created_at:desc']);
    expect(funn.filter((s) => s.startsWith('eq:category'))).toHaveLength(1);
    expect(steg('unanswered', 'question').filter((s) => s.startsWith('eq:category'))).toHaveLength(1);
  });
});

describe('grupperKommentarer', () => {
  const k = (id: string, parent: string | null = null) => ({ id, parent_comment_id: parent });

  it('legger svar under toppkommentaren, i den rekkefølgen de kom', () => {
    const { topp, svar } = grupperKommentarer([k('a'), k('b'), k('a1', 'a'), k('b1', 'b'), k('a2', 'a')]);
    expect(topp.map((c) => c.id)).toEqual(['a', 'b']);
    expect(svar.get('a')?.map((c) => c.id)).toEqual(['a1', 'a2']);
    expect(svar.get('b')?.map((c) => c.id)).toEqual(['b1']);
  });

  it('et svar på et svar vises under samme toppkommentar i stedet for å forsvinne', () => {
    const { svar } = grupperKommentarer([k('a'), k('a1', 'a'), k('a1x', 'a1'), k('a1xy', 'a1x')]);
    expect(svar.get('a')?.map((c) => c.id)).toEqual(['a1', 'a1x', 'a1xy']);
    expect(svar.has('a1')).toBe(false);
  });

  it('et svar uten synlig forelder vises ikke', () => {
    const { topp, svar } = grupperKommentarer([k('a'), k('foreldrelos', 'skjult')]);
    expect(topp.map((c) => c.id)).toEqual(['a']);
    expect(svar.size).toBe(0);
  });

  it('en sirkel i dataene henger ikke', () => {
    const { topp, svar } = grupperKommentarer([k('x', 'y'), k('y', 'x')]);
    expect(topp).toEqual([]);
    expect(svar.size).toBe(0);
  });
});
