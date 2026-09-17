import { describe, expect, it } from 'vitest';
import {
  FYLKER,
  NORGE,
  OMRADER,
  REGISTRERING_FORBEHOLD,
  TYNT_MAKS_SPRIK,
  TYNT_MIN_NORMAL,
  beregnSammeDato,
  byggRader,
  byggRegistreringsblokk,
  fraTabellrad,
  fylkeForGadm,
  grenseFraFacet,
  kortDato,
  kortPeriode,
  lesIdFacet,
  normalAarFor,
  prosentTekst,
  sammeDatoIAar,
  summerPerFylke,
  tellTilOgMed,
  tilTabellrad,
  vinduIAar,
  vinduerFor,
  type Gruppe,
  type SoppregistreringRad,
  type Telleresultat,
  type Vindu
} from '../soppregistreringer';

/**
 * Tallene her skal svare på «er det mindre sopp i år, og hvor?» uten å lure
 * eieren. Feilene som ville gjort det: et fylke som mangler halve seg (GADM
 * har 19 gamle fylker, vi viser 15), en grense som tar med én id for mye
 * eller for lite, og et tynt tall uten stjerne.
 */

describe('fylkene — GADM 3.6 til 2024-inndelingen', () => {
  it('dekker alle 19 GADM-fylkene nøyaktig én gang, fordelt på 15 fylker', () => {
    const alle = FYLKER.flatMap((f) => f.gadm);
    expect(FYLKER).toHaveLength(15);
    expect(alle).toHaveLength(19);
    expect(new Set(alle).size).toBe(19);
    expect(new Set(alle)).toEqual(new Set(Array.from({ length: 19 }, (_, i) => `NOR.${i + 1}_1`)));
  });

  it('slår sammen de fire fylkene som ble ett', () => {
    expect(fylkeForGadm('NOR.6_1')).toBe('Innlandet'); // Hedmark
    expect(fylkeForGadm('NOR.11_1')).toBe('Innlandet'); // Oppland
    expect(fylkeForGadm('NOR.3_1')).toBe('Agder'); // Aust-Agder
    expect(fylkeForGadm('NOR.18_1')).toBe('Agder'); // Vest-Agder
    expect(fylkeForGadm('NOR.7_1')).toBe('Vestland'); // Hordaland
    expect(fylkeForGadm('NOR.14_1')).toBe('Vestland'); // Sogn og Fjordane
    expect(fylkeForGadm('NOR.9_1')).toBe('Trøndelag');
    expect(fylkeForGadm('NOR.15_1')).toBe('Trøndelag');
    expect(fylkeForGadm('NOR.2_1')).toBe('Østfold');
    expect(fylkeForGadm('SWE.1_1')).toBeNull();
  });

  it('summerer en gadm-facett per fylke, med null for fylker uten funn og uten ukjente GID-er', () => {
    // Tallene fra GBIF for 1. aug–7. sep 2026 (alle sopp), et utvalg.
    const perFylke = summerPerFylke([
      { name: 'NOR.11_1', count: 1377 },
      { name: 'NOR.6_1', count: 817 },
      { name: 'NOR.3_1', count: 213 },
      { name: 'NOR.18_1', count: 54 },
      { name: 'NOR.12_1', count: 601 },
      { name: 'SWE.12_1', count: 99 }
    ]);
    expect(perFylke.get('Innlandet')).toBe(2194);
    expect(perFylke.get('Agder')).toBe(267);
    expect(perFylke.get('Oslo')).toBe(601);
    expect(perFylke.get('Finnmark')).toBe(0);
    expect(perFylke.size).toBe(15);
    expect([...perFylke.values()].reduce((a, b) => a + b, 0)).toBe(2194 + 267 + 601);
  });
});

describe('grensen og tellingen opp til den', () => {
  it('grensen er høyeste gyldige id; tekst, null-tellinger og tom facett gir ingen grense', () => {
    expect(grenseFraFacet([{ name: '13772999', count: 1 }, { name: '38594735', count: 1 }, { name: '16535812', count: 1 }])).toBe(38594735);
    expect(grenseFraFacet([{ name: 'AO-99999999', count: 1 }, { name: '38594735', count: 1 }])).toBe(38594735);
    expect(grenseFraFacet([{ name: '99999999', count: 0 }, { name: '100', count: 1 }])).toBe(100);
    expect(grenseFraFacet([])).toBeNull();
    expect(grenseFraFacet([{ name: 'ukjent', count: 3 }])).toBeNull();
  });

  it('en id LIK grensen telles, én over gjør ikke — grensen er inkludert', () => {
    const { ider } = lesIdFacet([
      { name: '32960924', count: 1 },
      { name: '32960925', count: 1 },
      { name: '32960926', count: 1 }
    ]);
    expect(tellTilOgMed(ider, 32960925)).toBe(2);
    expect(tellTilOgMed(ider, 32960924)).toBe(1);
    expect(tellTilOgMed(ider, 32960923)).toBe(0);
  });

  it('ledende nuller er samme id; tekst og tellinger på 0 faller utenfor summen', () => {
    const { ider, sum } = lesIdFacet([
      { name: '0042', count: 1 },
      { name: '42', count: 1 },
      { name: 'x42', count: 5 },
      { name: '43', count: 0 }
    ]);
    expect(ider.get(42)).toBe(2);
    expect(sum).toBe(2);
    expect(tellTilOgMed(ider, 42)).toBe(2);
  });

  it('snittet: fylkets id-er ∩ Norges storsopp ∩ Norges uke', () => {
    const fylke = lesIdFacet(['1', '2', '3', '4', '5', '6'].map((name) => ({ name, count: 1 }))).ider;
    const storsopp = lesIdFacet(['2', '4', '6', '99'].map((name) => ({ name, count: 1 }))).ider;
    const uke = lesIdFacet(['4', '5', '6', '98'].map((name) => ({ name, count: 1 }))).ider;
    expect(tellTilOgMed(fylke, 5)).toBe(5);
    expect(tellTilOgMed(fylke, 5, [storsopp])).toBe(2); // 2, 4
    expect(tellTilOgMed(fylke, 5, [uke])).toBe(2); // 4, 5
    expect(tellTilOgMed(fylke, 5, [uke, storsopp])).toBe(1); // 4
    expect(tellTilOgMed(fylke, 6, [uke, storsopp])).toBe(2); // 4, 6
  });
});

describe('datoer og vinduer', () => {
  it('sesongen hittil og siste hele uke slutter sju dager før utgaven', () => {
    expect(vinduerFor('2026-09-12')).toEqual({
      sesong: { fra: '2026-08-01', til: '2026-09-05' },
      uke: { fra: '2026-08-30', til: '2026-09-05' }
    });
  });

  it('sluttdagen kan overstyres (tørrkjøringen mot 1. aug–7. sep)', () => {
    expect(vinduerFor('2026-09-12', '2026-09-07')).toEqual({
      sesong: { fra: '2026-08-01', til: '2026-09-07' },
      uke: { fra: '2026-09-01', til: '2026-09-07' }
    });
    expect(vinduerFor('2026-09-12', '2026-09-13')).toBeNull(); // etter utgaven
  });

  it('utenfor sesongen: uka må ligge inne i august-starten, og ingenting etter 30. november', () => {
    expect(vinduerFor('2026-08-13')).toBeNull(); // uka ville startet 31. juli
    expect(vinduerFor('2026-08-14')?.uke).toEqual({ fra: '2026-08-01', til: '2026-08-07' });
    expect(vinduerFor('2026-12-07')?.sesong.til).toBe('2026-11-30');
    expect(vinduerFor('2026-12-08')).toBeNull();
    expect(vinduerFor('2027-01-05')).toBeNull(); // sluttdagen havner i fjor
    expect(vinduerFor('2026-03-01')).toBeNull();
  });

  it('samme dato tidligere år, også 29. februar', () => {
    expect(sammeDatoIAar('2026-09-12', 2023)).toBe('2023-09-12');
    expect(sammeDatoIAar('2028-02-29', 2027)).toBe('2027-02-28');
    expect(sammeDatoIAar('2028-02-29', 2024)).toBe('2024-02-29');
    expect(vinduIAar({ fra: '2026-08-01', til: '2026-09-07' }, 2024)).toEqual({ fra: '2024-08-01', til: '2024-09-07' });
  });

  it('normalen er de tre årene rett før', () => {
    expect(normalAarFor('2026-09-12')).toEqual([2023, 2024, 2025]);
    expect(normalAarFor('2027-09-10')).toEqual([2024, 2025, 2026]);
  });

  it('korte datoer til e-posten', () => {
    expect(kortDato('2026-09-12')).toBe('12.9.');
    expect(kortPeriode({ fra: '2026-08-01', til: '2026-09-05' })).toBe('1.8.–5.9.');
    expect(kortPeriode({ fra: '', til: '' })).toBe('');
  });
});

describe('normal, prosent og tynt grunnlag', () => {
  it('reproduserer Norge 1. aug–7. sep 2026: 13 943 mot 14 739 / 17 442 / 13 371 = 92 %', () => {
    const r = beregnSammeDato(13943, { 2023: 14739, 2024: 17442, 2025: 13371 });
    expect(r.normal).toBe(15184);
    expect(r.prosent).toBe(92);
    expect(r.tynt).toBe(false);
  });

  it(`normal under ${TYNT_MIN_NORMAL} er tynt`, () => {
    expect(beregnSammeDato(30, { 2023: 49, 2024: 49, 2025: 50 }).tynt).toBe(true);
    expect(beregnSammeDato(30, { 2023: 50, 2024: 50, 2025: 50 }).tynt).toBe(false);
  });

  it(`år som spriker mer enn ${TYNT_MAKS_SPRIK}× er tynt — én aktiv person i ett av årene`, () => {
    // Telemark, siste hele uke før 7. sep: 34 / 47 / 669.
    expect(beregnSammeDato(104, { 2023: 34, 2024: 47, 2025: 669 }).tynt).toBe(true);
    // Nøyaktig 3× er ikke tynt; litt over er det.
    expect(beregnSammeDato(100, { 2023: 100, 2024: 200, 2025: 300 }).tynt).toBe(false);
    expect(beregnSammeDato(100, { 2023: 100, 2024: 200, 2025: 301 }).tynt).toBe(true);
    // Et år med null.
    expect(beregnSammeDato(100, { 2023: 0, 2024: 200, 2025: 300 }).tynt).toBe(true);
  });

  it('mangler år, eller normalen er null: ingen prosent å stole på', () => {
    expect(beregnSammeDato(10, {})).toEqual({ normal: null, prosent: null, tynt: true });
    expect(beregnSammeDato(10, { 2024: 500, 2025: 500 }).tynt).toBe(true);
    expect(beregnSammeDato(10, { 2023: 0, 2024: 0, 2025: 0 })).toEqual({ normal: 0, prosent: null, tynt: true });
  });
});

function tomtTall(): Record<Vindu, Record<Gruppe, Map<string, number>>> {
  return { sesong: { alle: new Map(), storsopp: new Map() }, uke: { alle: new Map(), storsopp: new Map() } };
}

describe('radene til tabellen', () => {
  const vinduer = vinduerFor('2026-09-12')!;
  const t: Telleresultat = {
    iAar: tomtTall(),
    tidligere: new Map([
      [2025, tomtTall()],
      [2023, tomtTall()],
      [2024, tomtTall()]
    ]),
    grenser: {
      '2023': { dato: '2023-09-12', id: 32960925 },
      '2024': { dato: '2024-09-12', id: 35645053 },
      '2025': { dato: '2025-09-12', id: 38594735 }
    }
  };
  t.iAar.sesong.storsopp.set('Vestfold', 40);
  t.tidligere.get(2023)!.sesong.storsopp.set('Vestfold', 651);
  t.tidligere.get(2024)!.sesong.storsopp.set('Vestfold', 684);
  t.tidligere.get(2025)!.sesong.storsopp.set('Vestfold', 257);

  const rader = byggRader('2026-09-12', vinduer, t);

  it('64 rader: 2 vinduer × 2 grupper × Norge og 15 fylker', () => {
    expect(rader).toHaveLength(64);
    expect(OMRADER[0]).toBe(NORGE);
    expect(new Set(rader.map((r) => `${r.vindu}/${r.gruppe}/${r.omrade}`)).size).toBe(64);
  });

  it('bærer år i stigende rekkefølge, grensene, vinduet og prosenten', () => {
    const v = rader.find((r) => r.vindu === 'sesong' && r.gruppe === 'storsopp' && r.omrade === 'Vestfold')!;
    expect(Object.keys(v.perAar)).toEqual(['2023', '2024', '2025']);
    expect(v).toMatchObject({ fra: '2026-08-01', til: '2026-09-05', antall: 40, normal: 530.7, prosent: 8, tynt: false });
    expect(v.grenser['2024'].id).toBe(35645053);
  });

  it('tabellraden og tilbake gir samme rad, også når numeric kommer som tekst', () => {
    const v = rader.find((r) => r.omrade === 'Vestfold' && r.gruppe === 'storsopp' && r.vindu === 'sesong')!;
    const tabell = tilTabellrad(v);
    expect(tabell).toMatchObject({ per_aar: v.perAar, grenser: v.grenser, snapshot: '2026-09-12' });
    expect(fraTabellrad({ ...tabell, normal: '530.7' })).toEqual(v);
  });
});

function rad(over: Partial<SoppregistreringRad>): SoppregistreringRad {
  return {
    snapshot: '2026-09-12',
    vindu: 'sesong',
    fra: '2026-08-01',
    til: '2026-09-05',
    omrade: NORGE,
    gruppe: 'storsopp',
    antall: 100,
    normal: 100,
    prosent: 100,
    tynt: false,
    perAar: {},
    grenser: {},
    ...over
  };
}

describe('rapportblokken', () => {
  it('null uten rader — rapporten sier «ikke målt ennå»', () => {
    expect(byggRegistreringsblokk([])).toBeNull();
  });

  it('Norge for begge vinduer og grupper, og lavest/høyest tre fylker for storsopp i sesongen', () => {
    const fylkeProsent: Record<string, number> = {
      Vestfold: 8,
      Agder: 13,
      Østfold: 30,
      Finnmark: 43,
      Buskerud: 50,
      Oslo: 138,
      Nordland: 186,
      Troms: 194
    };
    const rader = [
      rad({ gruppe: 'alle', prosent: 92 }),
      rad({ gruppe: 'storsopp', prosent: 86 }),
      rad({ vindu: 'uke', fra: '2026-08-30', gruppe: 'alle', prosent: 92 }),
      rad({ vindu: 'uke', fra: '2026-08-30', gruppe: 'storsopp', prosent: 95 }),
      ...Object.entries(fylkeProsent).map(([omrade, prosent]) => rad({ omrade, prosent, tynt: omrade === 'Nordland' })),
      // Skal ikke telle med: alle-gruppen, uka, og et fylke uten prosent.
      rad({ omrade: 'Vestland', gruppe: 'alle', prosent: 1 }),
      rad({ omrade: 'Vestland', vindu: 'uke', prosent: 999 }),
      rad({ omrade: 'Telemark', prosent: null, normal: 0 })
    ];
    const b = byggRegistreringsblokk(rader)!;
    expect(b.sesong).toMatchObject({ fra: '2026-08-01', til: '2026-09-05' });
    expect(b.uke).toMatchObject({ fra: '2026-08-30', til: '2026-09-05' });
    expect(prosentTekst(b.sesong.alle)).toBe('92 %');
    expect(prosentTekst(b.sesong.storsopp)).toBe('86 %');
    expect(prosentTekst(b.uke.storsopp)).toBe('95 %');
    expect(b.lavest.map((c) => c.omrade)).toEqual(['Vestfold', 'Agder', 'Østfold']);
    expect(b.hoyest.map((c) => c.omrade)).toEqual(['Troms', 'Nordland', 'Oslo']);
    expect(b.hoyest.map(prosentTekst)).toEqual(['194 %', '186 %*', '138 %']);
  });

  it('leser bare den nyeste utgaven når radene blander to', () => {
    const b = byggRegistreringsblokk([rad({ snapshot: '2026-09-05', prosent: 50 }), rad({ snapshot: '2026-09-12', prosent: 86 })])!;
    expect(b.snapshot).toBe('2026-09-12');
    expect(b.sesong.storsopp?.prosent).toBe(86);
  });

  it('med få fylker overlapper aldri lavest og høyest', () => {
    const b = byggRegistreringsblokk([
      rad({ omrade: 'Oslo', prosent: 80 }),
      rad({ omrade: 'Troms', prosent: 120 }),
      rad({ omrade: 'Agder', prosent: 80 }),
      rad({ omrade: 'Nordland', prosent: 150 })
    ])!;
    expect(b.lavest.map((c) => c.omrade)).toEqual(['Agder', 'Oslo', 'Troms']);
    expect(b.hoyest.map((c) => c.omrade)).toEqual(['Nordland']);
  });

  it('manglende celle vises som strek, tynn med stjerne', () => {
    expect(prosentTekst(null)).toBe('—');
    expect(prosentTekst({ omrade: 'Oslo', antall: 1, normal: 0, prosent: null, tynt: true })).toBe('—');
    expect(prosentTekst({ omrade: 'Oslo', antall: 25, normal: 39.3, prosent: 64, tynt: true })).toBe('64 %*');
  });

  it('forbeholdet står ordrett', () => {
    expect(REGISTRERING_FORBEHOLD).toBe(
      'Registreringer, ikke soppmengde. Mange funn legges inn uker og måneder etter turen, så tidligere år telles slik de så ut på samme dato. * = tynt grunnlag.'
    );
  });
});
