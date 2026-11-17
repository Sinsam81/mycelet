import { describe, expect, it } from 'vitest';
import { rettArtsfilter } from '../artsfilter-navn';
import {
  HUSKET_UTSNITT_LEVETID_MS,
  tolkHusketUtsnitt,
} from '../husket-utsnitt';

const NAA = 1_800_000_000_000;
const gyldig = {
  lat: 60.39,
  lng: 5.32,
  zoom: 12,
  speciesId: 3,
  speciesName: 'Kantarell',
  place: { name: 'Bergen', lat: 60.39, lng: 5.32 },
  lagretAt: NAA - 1000,
};

describe('tolkHusketUtsnitt', () => {
  it('gir tilbake det som ble lagret', () => {
    expect(tolkHusketUtsnitt(JSON.stringify(gyldig), NAA)).toEqual(gyldig);
  });

  it('glemmer etter ett døgn — da er GPS-en et bedre utgangspunkt', () => {
    expect(
      tolkHusketUtsnitt(
        JSON.stringify({
          ...gyldig,
          lagretAt: NAA - HUSKET_UTSNITT_LEVETID_MS - 1,
        }),
        NAA,
      ),
    ).toBeNull();
  });

  it('forkaster søppel og verdier utenfor kartet — ingen NaN til Leaflet', () => {
    expect(tolkHusketUtsnitt('ikke json', NAA)).toBeNull();
    expect(
      tolkHusketUtsnitt(JSON.stringify({ ...gyldig, lat: 95 }), NAA),
    ).toBeNull();
    expect(
      tolkHusketUtsnitt(JSON.stringify({ ...gyldig, zoom: 'høyt' }), NAA),
    ).toBeNull();
    expect(tolkHusketUtsnitt(null, NAA)).toBeNull();
  });

  it('art uten navn beholdes — og får navnet sitt tilbake når artslista er lastet', () => {
    // Filterarket hadde et eget artssøk som lagret id uten navn. Slike utsnitt
    // ligger igjen på brukernes enheter i opptil et døgn. Forkastes id-en her,
    // mister brukeren filteret sitt uten forklaring; kartet retter navnet i
    // stedet (artsfilter-navn.ts), og neste lagring har begge deler.
    const husket = tolkHusketUtsnitt(JSON.stringify({ ...gyldig, speciesName: null }), NAA);
    expect(husket).toMatchObject({ speciesId: 3, speciesName: null });

    const retting = rettArtsfilter({
      speciesId: husket?.speciesId ?? null,
      speciesName: husket?.speciesName ?? null,
      navn: new Map([[3, 'Kantarell']]),
    });
    expect(retting).toEqual({ type: 'sett_navn', navn: 'Kantarell' });

    const lagretPaaNytt = tolkHusketUtsnitt(
      JSON.stringify({ ...gyldig, speciesName: 'Kantarell' }),
      NAA,
    );
    expect(lagretPaaNytt).toMatchObject({ speciesId: 3, speciesName: 'Kantarell' });
  });

  it('art uten id gir ingen art; ugyldig sted gir intet sted, men utsnittet beholdes', () => {
    const u = tolkHusketUtsnitt(
      JSON.stringify({
        ...gyldig,
        speciesId: null,
        place: { name: 'x', lat: 'nei', lng: 1 },
      }),
      NAA,
    );
    expect(u).toMatchObject({
      lat: 60.39,
      speciesId: null,
      speciesName: null,
      place: null,
    });
  });
});
