import { describe, expect, it } from 'vitest';
import { rettArtsfilter } from '../artsfilter-navn';

const ARTER = new Map<number, string>([
  [3, 'Kantarell'],
  [7, 'Steinsopp']
]);

describe('rettArtsfilter — et artsfilter skal ha et navn brukeren kan se', () => {
  it('uten artsfilter er det ingenting å rette', () => {
    expect(rettArtsfilter({ speciesId: null, speciesName: null, navn: ARTER })).toEqual({ type: 'ingen' });
    // Et navn uten id filtrerer ingenting; søkefeltet rydder det selv.
    expect(rettArtsfilter({ speciesId: null, speciesName: 'Kantarell', navn: ARTER })).toEqual({ type: 'ingen' });
  });

  it('id og navn som hører sammen, røres ikke', () => {
    expect(rettArtsfilter({ speciesId: 3, speciesName: 'Kantarell', navn: ARTER })).toEqual({ type: 'ingen' });
  });

  it('navnet brukeren valgte står, også når artslista skriver det annerledes', () => {
    // Dyplenken fra artsiden sender sitt eget visningsnavn (artnavn=…).
    expect(rettArtsfilter({ speciesId: 3, speciesName: 'Ekte kantarell', navn: ARTER })).toEqual({ type: 'ingen' });
  });

  it('id uten navn — fra det gamle filterarket eller en dyplenke uten artnavn — får navnet sitt', () => {
    expect(rettArtsfilter({ speciesId: 3, speciesName: null, navn: ARTER })).toEqual({
      type: 'sett_navn',
      navn: 'Kantarell'
    });
    expect(rettArtsfilter({ speciesId: 7, speciesName: '', navn: ARTER })).toEqual({
      type: 'sett_navn',
      navn: 'Steinsopp'
    });
    expect(rettArtsfilter({ speciesId: 7, speciesName: '   ', navn: ARTER })).toEqual({
      type: 'sett_navn',
      navn: 'Steinsopp'
    });
  });

  it('en art som ikke finnes, fjernes — et filter på ingenting gir et tomt kart uten forklaring', () => {
    expect(rettArtsfilter({ speciesId: 999, speciesName: null, navn: ARTER })).toEqual({ type: 'fjern_art' });
    // Også når et navn fulgte med: brikken ville navngitt en art som ikke filtrerer noe.
    expect(rettArtsfilter({ speciesId: 999, speciesName: 'Finnes ikke', navn: ARTER })).toEqual({ type: 'fjern_art' });
  });

  it('før artslista er lastet (eller når oppslaget feilet) røres ingenting', () => {
    // Tom liste betyr «vet ikke», ikke «arten finnes ikke». Ellers ville et
    // nettverksglipp fjernet filteret brukeren nettopp valgte.
    const tom = new Map<number, string>();
    expect(rettArtsfilter({ speciesId: 3, speciesName: null, navn: tom })).toEqual({ type: 'ingen' });
    expect(rettArtsfilter({ speciesId: 999, speciesName: 'Kantarell', navn: tom })).toEqual({ type: 'ingen' });
  });

  it('en artsliste på PostgREST-taket kan være avkuttet: da fjernes ingen art, men navn settes fortsatt', () => {
    // 1000 rader er nøyaktig det et avkuttet svar ser ut som. En art som
    // mangler, kan ligge forbi kuttet — å fjerne filteret da ville vært å
    // straffe brukeren for en grense i databaselaget.
    const paaTaket = new Map<number, string>(Array.from({ length: 1000 }, (_, i) => [i + 1, `Art ${i + 1}`]));
    expect(rettArtsfilter({ speciesId: 1500, speciesName: null, navn: paaTaket })).toEqual({ type: 'ingen' });
    expect(rettArtsfilter({ speciesId: 1500, speciesName: 'Kantarell', navn: paaTaket })).toEqual({ type: 'ingen' });
    expect(rettArtsfilter({ speciesId: 7, speciesName: null, navn: paaTaket })).toEqual({ type: 'sett_navn', navn: 'Art 7' });
    // Under taket er lista hel, og en art som mangler, finnes ikke.
    const under = new Map<number, string>(Array.from({ length: 999 }, (_, i) => [i + 1, `Art ${i + 1}`]));
    expect(rettArtsfilter({ speciesId: 1500, speciesName: null, navn: under })).toEqual({ type: 'fjern_art' });
  });

  it('en art uten visningsnavn i lista kan ikke få et navn — og filteret beholdes', () => {
    const utenNavn = new Map<number, string>([[3, '']]);
    expect(rettArtsfilter({ speciesId: 3, speciesName: null, navn: utenNavn })).toEqual({ type: 'ingen' });
  });

  it('retter seg selv i ett steg: resultatet av rettingen trenger ingen ny retting', () => {
    const forste = rettArtsfilter({ speciesId: 3, speciesName: null, navn: ARTER });
    expect(forste.type).toBe('sett_navn');
    const navn = forste.type === 'sett_navn' ? forste.navn : null;
    expect(rettArtsfilter({ speciesId: 3, speciesName: navn, navn: ARTER })).toEqual({ type: 'ingen' });
    // Og etter «fjern_art» står filteret uten art.
    expect(rettArtsfilter({ speciesId: null, speciesName: null, navn: ARTER })).toEqual({ type: 'ingen' });
  });
});
