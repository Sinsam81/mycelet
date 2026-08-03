import { describe, expect, it } from 'vitest';
import { markerHtml, markerShapeFor, type MarkerShape } from '../speciesMarkerIcon';

/**
 * Formen sier HVA som ble funnet, fargen sier om det kan spises. Før var alle
 * funn identiske prikker.
 *
 * Emoji kunne ikke løse dette: Unicode har bare 🍄 og 🍄‍🟫, og hver plattform
 * tegner sine egne — vi ville ikke kontrollert hvordan appen så ut.
 */
describe('markerShapeFor', () => {
  it('gir kantarellfamilien tre ULIKE former', () => {
    // De tre viktigste artene for en norsk plukker må kunne skilles.
    const k = markerShapeFor('Cantharellus cibarius');
    const t = markerShapeFor('Craterellus tubaeformis');
    const s = markerShapeFor('Craterellus cornucopioides');
    expect(new Set([k, t, s]).size).toBe(3);
    expect(s).toBe('trompet'); // svart trompetsopp er et horn, ikke en trakt
  });

  it('skiller rørsopp fra skrubb', () => {
    expect(markerShapeFor('Boletus edulis')).toBe('rorsopp');
    expect(markerShapeFor('Leccinum scabrum')).toBe('skrubb');
  });

  it('gir fluesopp sin egen form — ikke bare rød farge', () => {
    // Fargen alene er ikke nok: en fargeblind bruker må også se forskjell.
    expect(markerShapeFor('Amanita muscaria')).toBe('fluesopp');
    expect(markerShapeFor('Amanita phalloides')).toBe('fluesopp');
  });

  it('faller til nøytral form ved ukjent eller manglende slekt', () => {
    // Aldri til en form som ligner en bestemt art — det ville vært en påstand.
    expect(markerShapeFor('Ukjentus articus')).toBe('generisk');
    expect(markerShapeFor(null)).toBe('generisk');
    expect(markerShapeFor('')).toBe('generisk');
    expect(markerShapeFor('   ')).toBe('generisk');
  });

  it('tåler ekstra mellomrom og forfatternavn', () => {
    expect(markerShapeFor('  Boletus edulis Bull.  ')).toBe('rorsopp');
  });
});

describe('markerHtml', () => {
  const FORMER: MarkerShape[] = [
    'kantarell', 'trakt', 'trompet', 'rorsopp', 'skrubb', 'skivesopp', 'fluesopp', 'pigg', 'generisk'
  ];

  it('tegner hver form med en egen bane', () => {
    const baner = FORMER.map((f) => /d="([^"]+)"/.exec(markerHtml(f, '#000'))?.[1]);
    expect(baner.every(Boolean)).toBe(true);
    expect(new Set(baner).size, 'to former deler bane — da kan de ikke skilles').toBe(FORMER.length);
  });

  it('maler formen i spiselighetsfargen og beholder den hvite konturen', () => {
    const html = markerHtml('kantarell', '#059669', 16);
    expect(html).toContain('fill="#059669"');
    expect(html).toContain('stroke="#fff"'); // gjør formen lesbar over lys OG mørk bakgrunn
    expect(html).toContain('width="16"');
  });
});
