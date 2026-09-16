import { describe, expect, it } from 'vitest';
import {
  FRIST_MS,
  FristUteFeil,
  GBIF_AVSTAND_MS,
  GbifFeil,
  ID_FACET_GRENSE,
  indekseringFerdig,
  lagGbifKlient,
  lesUtgavedato,
  planlagteKall,
  tellSoppregistreringer
} from '../soppregistreringer-henting';
import { FYLKER, NORGE, STORSOPP_ORDENER, fylkeForGadm, plussDager, vinduerFor } from '../soppregistreringer';

/**
 * En liten falsk GBIF: poster med funn-id i innleggingsrekkefølge,
 * funndato, innleggingsdato (= modified), GADM-fylke og orden. Den falske
 * API-en filtrerer og facetterer som den ekte. Testene regner så fasiten
 * RETT FRAM — «innlagt senest på samme dato» — og krever at cronens
 * id-grenser og snitt kommer til nøyaktig samme tall. Det er hele påstanden
 * metoden hviler på.
 */

interface Post {
  id: number;
  sopp: boolean;
  funndato: string;
  innlagt: string;
  gadm: string;
  orden: number;
}

const STORSOPP = new Set<number>(Object.values(STORSOPP_ORDENER));
const ALLE_GADM = FYLKER.flatMap((f) => f.gadm);

function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Poster for 2023–26. Utgaven er 2026-09-12: ingenting i 2026 er lagt inn etter den. */
function lagVerden(seed = 7): Post[] {
  const r = prng(seed);
  const uten: Omit<Post, 'id'>[] = [];
  const velg = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  for (const aar of [2023, 2024, 2025, 2026]) {
    for (let i = 0; i < 700; i += 1) {
      const funndato = plussDager(`${aar}-07-25`, Math.floor(r() * 50)); // 25. jul – 12. sep
      const etterslep = r() < 0.4 ? Math.floor(r() * 5) : Math.floor(r() * 150);
      let innlagt = plussDager(funndato, etterslep);
      if (aar === 2026 && innlagt > '2026-09-12') innlagt = '2026-09-12';
      const orden = r() < 0.6 ? velg([...STORSOPP]) : velg([1051, 1234, 9999]);
      uten.push({ sopp: true, funndato, innlagt, gadm: velg(ALLE_GADM), orden });
    }
    // Andre arter lagt inn hver dag rundt grensen — grensen tar alle taxa.
    for (let d = -5; d <= 3; d += 1) {
      for (let k = 0; k < 3; k += 1) {
        const dag = plussDager(`${aar}-09-12`, d);
        uten.push({ sopp: false, funndato: dag, innlagt: dag, gadm: velg(ALLE_GADM), orden: 0 });
      }
    }
  }
  // Id i innleggingsrekkefølge, som i Artsobservasjoner.
  return uten
    .map((p) => ({ p, s: r() }))
    .sort((a, b) => a.p.innlagt.localeCompare(b.p.innlagt) || a.s - b.s)
    .map(({ p }, i) => ({ ...p, id: 30_000_000 + i }));
}

interface FalskGbif {
  fetch: typeof fetch;
  urler: string[];
}

function falskGbif(poster: Post[], valg: { svar?: (url: string, n: number) => Response | null } = {}): FalskGbif {
  const urler: string[] = [];
  const f = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    urler.push(url.toString());
    const spesial = valg.svar?.(url.toString(), urler.length);
    if (spesial) return spesial;
    if (url.pathname.endsWith('/process')) {
      return Response.json({ results: [{ processStateOccurrence: 'FINISHED', finishedCrawling: '2026-09-14T11:36:53.168+00:00' }] });
    }
    if (url.pathname.startsWith('/v1/dataset/')) {
      return Response.json({ pubDate: '2026-09-12T00:00:00.000+00:00' });
    }
    const p = url.searchParams;
    let utvalg = poster;
    const modified = p.get('modified');
    if (modified) {
      const [fra, til] = modified.split(',');
      utvalg = utvalg.filter((x) => x.innlagt >= fra && x.innlagt <= til);
    }
    if (p.get('taxonKey') === '5') utvalg = utvalg.filter((x) => x.sopp);
    const hendelse = p.get('eventDate');
    if (hendelse) {
      const [fra, til] = hendelse.split(',');
      utvalg = utvalg.filter((x) => x.funndato >= fra && x.funndato <= til);
    }
    const ordener = p.getAll('orderKey').map(Number);
    if (ordener.length) utvalg = utvalg.filter((x) => ordener.includes(x.orden));
    const gadm = p.getAll('gadmGid');
    if (gadm.length) utvalg = utvalg.filter((x) => gadm.includes(x.gadm));
    const felt = p.get('facet');
    const tell = new Map<string, number>();
    for (const x of utvalg) {
      const navn = felt === 'catalogNumber' ? String(x.id) : x.gadm;
      tell.set(navn, (tell.get(navn) ?? 0) + 1);
    }
    const counts = [...tell.entries()].map(([name, count]) => ({ name, count })).slice(0, Number(p.get('facetLimit') ?? 10));
    return Response.json({ count: utvalg.length, facets: felt ? [{ field: felt, counts }] : [] });
  };
  return { fetch: f as typeof fetch, urler };
}

/** Falsk klokke: ventetid og svartid flytter tiden, ingenting sover. */
function falskTid(svartidMs: number) {
  let t = 1_000_000;
  const hendelser: Array<{ start: number; slutt: number }> = [];
  return {
    klokke: () => t,
    vent: async (ms: number) => {
      t += ms;
    },
    medSvartid(f: typeof fetch): typeof fetch {
      return (async (...a: Parameters<typeof fetch>) => {
        const start = t;
        t += svartidMs;
        const res = await f(...a);
        hendelser.push({ start, slutt: t });
        return res;
      }) as typeof fetch;
    },
    hendelser
  };
}

/** Fasit rett fram: soppfunn i vinduet, fylket og gruppen, lagt inn senest på datoen. */
function fasit(poster: Post[], o: { aar: number; fra: string; til: string; innlagtSenest: string; omrade: string; storsopp: boolean }) {
  return poster.filter(
    (x) =>
      x.sopp &&
      x.funndato >= `${o.aar}${o.fra.slice(4)}` &&
      x.funndato <= `${o.aar}${o.til.slice(4)}` &&
      x.innlagt <= o.innlagtSenest &&
      (o.omrade === NORGE || fylkeForGadm(x.gadm) === o.omrade) &&
      (!o.storsopp || STORSOPP.has(x.orden))
  ).length;
}

describe('tellingen mot en falsk GBIF — id-grenser og snitt gir samme tall som å telle rett fram', () => {
  const poster = lagVerden();

  it('alle 64 rader, alle fire år, stemmer med fasiten', async () => {
    const gbif = falskGbif(poster);
    const tid = falskTid(300);
    const klient = lagGbifKlient({ fetch: tid.medSvartid(gbif.fetch), klokke: tid.klokke, vent: tid.vent });
    const snapshot = await lesUtgavedato(klient);
    const res = await tellSoppregistreringer(klient, snapshot);

    expect(snapshot).toBe('2026-09-12');
    expect(res.rader).toHaveLength(64);
    const v = vinduerFor(snapshot)!;
    for (const r of res.rader) {
      const vindu = v[r.vindu];
      const felles = { fra: vindu.fra, til: vindu.til, omrade: r.omrade, storsopp: r.gruppe === 'storsopp' };
      expect(r.antall, `${r.vindu}/${r.gruppe}/${r.omrade} i år`).toBe(fasit(poster, { ...felles, aar: 2026, innlagtSenest: '2026-09-12' }));
      for (const aar of [2023, 2024, 2025]) {
        expect(r.perAar[String(aar)], `${r.vindu}/${r.gruppe}/${r.omrade} ${aar}`).toBe(
          fasit(poster, { ...felles, aar, innlagtSenest: `${aar}-09-12` })
        );
      }
    }
    // Og verdenen er ikke triviell: tidligere år har poster lagt inn ETTER grensen.
    const norge2025 = res.rader.find((r) => r.vindu === 'sesong' && r.gruppe === 'alle' && r.omrade === NORGE)!;
    expect(norge2025.perAar['2025']).toBeLessThan(fasit(poster, { aar: 2025, fra: v.sesong.fra, til: v.sesong.til, innlagtSenest: '2099-12-31', omrade: NORGE, storsopp: false }));
    expect(norge2025.grenser['2025'].dato).toBe('2025-09-12');
  });

  it('en dag uten endringer: grensen faller tilbake til dagen før, og tallet er fortsatt riktig', async () => {
    const utenDagen = poster.filter((x) => x.innlagt !== '2024-09-12');
    const gbif = falskGbif(utenDagen);
    const tid = falskTid(100);
    const klient = lagGbifKlient({ fetch: tid.medSvartid(gbif.fetch), klokke: tid.klokke, vent: tid.vent });
    const res = await tellSoppregistreringer(klient, '2026-09-12');
    const r = res.rader.find((x) => x.vindu === 'sesong' && x.gruppe === 'storsopp' && x.omrade === 'Innlandet')!;
    expect(r.grenser['2024'].dato).toBe('2024-09-11');
    expect(r.perAar['2024']).toBe(fasit(utenDagen, { aar: 2024, fra: '2026-08-01', til: '2026-09-05', innlagtSenest: '2024-09-11', omrade: 'Innlandet', storsopp: true }));
    // Selve tellingen er 61 kall; her ett ekstra grensekall (dagen før). Utgave- og indekseringskallet er ikke med.
    expect(res.kall).toBe(planlagteKall() - 2 + 1);
  });
});

describe('budsjettet: 63 kall, 2 s mellom hvert, innenfor 300 s', () => {
  const poster = lagVerden(11);

  /** Det cronen gjør når utgaven er ny: utgave, indeksering, tellingen. */
  async function helKjoring(klient: ReturnType<typeof lagGbifKlient>) {
    const snapshot = await lesUtgavedato(klient);
    expect(await indekseringFerdig(klient)).toBe(true);
    return tellSoppregistreringer(klient, snapshot);
  }

  it('en vanlig kjøring er 63 kall: utgave + indeksering + 4 i år + 3 × (1 grense + 3 Norge + 15 fylker)', async () => {
    expect(planlagteKall()).toBe(63);
    const gbif = falskGbif(poster);
    const tid = falskTid(0);
    const klient = lagGbifKlient({ fetch: tid.medSvartid(gbif.fetch), klokke: tid.klokke, vent: tid.vent });
    await helKjoring(klient);
    expect(klient.kall()).toBe(63);
    expect(gbif.urler).toHaveLength(63);
  });

  it('aldri to kall nærmere enn 2 s, og med 1,2 s svartid (tregeste målt) tar alt under 200 s', async () => {
    const gbif = falskGbif(poster);
    const tid = falskTid(1_200);
    const klient = lagGbifKlient({ fetch: tid.medSvartid(gbif.fetch), klokke: tid.klokke, vent: tid.vent });
    await helKjoring(klient);
    for (let i = 1; i < tid.hendelser.length; i += 1) {
      expect(tid.hendelser[i].start - tid.hendelser[i - 1].slutt).toBeGreaterThanOrEqual(GBIF_AVSTAND_MS);
    }
    // 63 × 1,2 s + 62 × 2 s = 199,6 s.
    expect(klient.brukt()).toBe(63 * 1_200 + 62 * GBIF_AVSTAND_MS);
    expect(klient.brukt()).toBeLessThan(FRIST_MS);
  });

  it('selv med 2 s svartid på hvert eneste kall rekker det (250 s < 270 s frist < 300 s)', async () => {
    const gbif = falskGbif(poster);
    const tid = falskTid(2_000);
    const klient = lagGbifKlient({ fetch: tid.medSvartid(gbif.fetch), klokke: tid.klokke, vent: tid.vent });
    const res = await helKjoring(klient);
    expect(res.rader).toHaveLength(64);
    expect(klient.brukt()).toBe(63 * 2_000 + 62 * GBIF_AVSTAND_MS);
    expect(klient.brukt()).toBeLessThan(FRIST_MS);
    expect(klient.brukt()).toBeLessThan(300_000);
  });

  it('går fristen ut, kastes FristUteFeil før neste kall — og ingen rader kommer ut', async () => {
    const gbif = falskGbif(poster);
    const tid = falskTid(3_000);
    const klient = lagGbifKlient({ fetch: tid.medSvartid(gbif.fetch), klokke: tid.klokke, vent: tid.vent });
    const snapshot = await lesUtgavedato(klient);
    await expect(tellSoppregistreringer(klient, snapshot)).rejects.toBeInstanceOf(FristUteFeil);
    // (3 + 2) s per kall → det 55. kallet ville startet etter 270 s.
    expect(klient.kall()).toBe(54);
    expect(klient.brukt()).toBeLessThan(300_000);
  });
});

describe('indeksering — utgavedatoen kommer timer før tallene', () => {
  const svar = (body: unknown) => lagGbifKlient({ fetch: (async () => Response.json(body)) as unknown as typeof fetch, vent: async () => {} });

  it('venter når siste prosess ikke er ferdig', async () => {
    expect(await indekseringFerdig(svar({ results: [{ processStateOccurrence: 'RUNNING' }] }))).toBe(false);
    expect(await indekseringFerdig(svar({ results: [{ processStateOccurrence: 'FINISHED' }] }))).toBe(true);
  });

  it('mangler svaret feltet, stopper det ikke målingen for alltid', async () => {
    expect(await indekseringFerdig(svar({ results: [] }))).toBe(true);
    expect(await indekseringFerdig(svar({}))).toBe(true);
  });
});

describe('GBIF-klienten', () => {
  const ok = () => Response.json({ pubDate: '2026-09-12' });

  it('prøver én gang til etter 429 og 5xx, med lengre pause', async () => {
    const tid = falskTid(0);
    let n = 0;
    const svar = [new Response('', { status: 429 }), ok()];
    const klient = lagGbifKlient({ fetch: tid.medSvartid((async () => svar[n++]) as unknown as typeof fetch), klokke: tid.klokke, vent: tid.vent });
    expect(await lesUtgavedato(klient)).toBe('2026-09-12');
    expect(klient.kall()).toBe(2);
    expect(tid.hendelser[1].start - tid.hendelser[0].slutt).toBeGreaterThanOrEqual(5_000);
  });

  it('gir opp etter andre feil på rad', async () => {
    const tid = falskTid(0);
    const klient = lagGbifKlient({ fetch: tid.medSvartid((async () => new Response('', { status: 503 })) as unknown as typeof fetch), klokke: tid.klokke, vent: tid.vent });
    await expect(lesUtgavedato(klient)).rejects.toBeInstanceOf(GbifFeil);
    expect(klient.kall()).toBe(2);
  });

  it('prøver ikke igjen på 400 — det er en feil i spørringen, ikke i GBIF', async () => {
    const tid = falskTid(0);
    const klient = lagGbifKlient({ fetch: tid.medSvartid((async () => new Response('', { status: 400 })) as unknown as typeof fetch), klokke: tid.klokke, vent: tid.vent });
    await expect(lesUtgavedato(klient)).rejects.toBeInstanceOf(GbifFeil);
    expect(klient.kall()).toBe(1);
  });

  it('nettverksfeil prøves én gang til', async () => {
    const tid = falskTid(0);
    let n = 0;
    const f = (async () => {
      n += 1;
      if (n === 1) throw new TypeError('fetch failed');
      return ok();
    }) as unknown as typeof fetch;
    const klient = lagGbifKlient({ fetch: tid.medSvartid(f), klokke: tid.klokke, vent: tid.vent });
    expect(await lesUtgavedato(klient)).toBe('2026-09-12');
    expect(klient.kall()).toBe(2);
  });
});

describe('vaktene mot tall som ser riktige ut uten å være det', () => {
  const poster = lagVerden(3);

  it('en id-facett som er kuttet ved grensen stopper kjøringen', async () => {
    const gbif = falskGbif(poster, {
      svar: (url) =>
        url.includes('facet=catalogNumber') && url.includes('eventDate')
          ? Response.json({ count: ID_FACET_GRENSE, facets: [{ counts: Array.from({ length: ID_FACET_GRENSE }, (_, i) => ({ name: String(i + 1), count: 1 })) }] })
          : null
    });
    const tid = falskTid(0);
    const klient = lagGbifKlient({ fetch: tid.medSvartid(gbif.fetch), klokke: tid.klokke, vent: tid.vent });
    await expect(tellSoppregistreringer(klient, '2026-09-12')).rejects.toThrow(/kuttet/);
  });

  it('mangler mer enn 1 % av postene en funn-id, stoler vi ikke på tellingen', async () => {
    const gbif = falskGbif(poster, {
      svar: (url) =>
        url.includes('facet=catalogNumber') && url.includes('eventDate')
          ? Response.json({ count: 1000, facets: [{ counts: [{ name: '1', count: 980 }] }] })
          : null
    });
    const tid = falskTid(0);
    const klient = lagGbifKlient({ fetch: tid.medSvartid(gbif.fetch), klokke: tid.klokke, vent: tid.vent });
    await expect(tellSoppregistreringer(klient, '2026-09-12')).rejects.toThrow(/gyldig funn-id/);
  });

  it('grenser som ikke stiger år for år betyr at id-rekkefølgen ikke holder', async () => {
    const gbif = falskGbif(poster, {
      svar: (url) => (url.includes('modified=2024') ? Response.json({ count: 1, facets: [{ counts: [{ name: '1', count: 1 }] }] }) : null)
    });
    const tid = falskTid(0);
    const klient = lagGbifKlient({ fetch: tid.medSvartid(gbif.fetch), klokke: tid.klokke, vent: tid.vent });
    await expect(tellSoppregistreringer(klient, '2026-09-12')).rejects.toThrow(/id-rekkefølgen/);
  });

  it('utenfor sesongen regnes ingenting', async () => {
    const klient = lagGbifKlient({ fetch: (async () => ok()) as unknown as typeof fetch, vent: async () => {} });
    await expect(tellSoppregistreringer(klient, '2026-08-10')).rejects.toThrow(/utenfor sesongen/);
    expect(klient.kall()).toBe(0);
    function ok() {
      return Response.json({});
    }
  });
});
