import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BEHANDLINGSFRIST_TIMER } from '@/lib/moderation/moderering';
import {
  HANDLINGSROM_TIMER,
  RAPPORTMOTTAKER,
  VARSELINTERVALL_TIMER,
  byggKveldsvarselEpost,
  byggKveldsvarselIkkeMaalt,
  byggModereringsblokk,
  byggModereringsvarsel,
  fristSomTekst
} from '../modereringsvarsel';

/**
 * Varselet om meldt innhold som venter.
 *
 * Dagsrapporten kl. 06:00 UTC var det eneste som sa fra om en ny melding i
 * forumet. En melding som kom inn kl. 06:10, sto derfor første gang i en
 * e-post neste morgen — 23 t 50 min gammel, med «Behandle den i dag» — og
 * fristen den skulle verne er 24 timer. Tre ting er låst her:
 *
 *  - det går to varsler i døgnet, tolv timer fra hverandre (vercel.json), så
 *    første varsel kommer med minst tolv timer igjen;
 *  - varselet skriver klokkeslettet fristen går ut, i norsk tid;
 *  - det sier «nå» når neste varsel ville kommet for sent — etter fristen,
 *    eller med mindre enn tre timer igjen — og blir rødt først når fristen
 *    er ute.
 */

const LENKE = 'https://www.mycelet.com/forum/moderation';
const TIME = 3_600_000;

beforeEach(() => {
  // Lenka bygges fra samme variabel som de andre e-postene; låst her så
  // testen ikke leser utviklerens eget miljø.
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.mycelet.com';
});

const blokk = (naa: string, eldsteOpprettet: string | null, antall = 1) =>
  byggModereringsblokk({ aapneRapporter: { antall, eldsteOpprettet }, naa: new Date(naa) });

describe('klokkeslettet fristen går ut', () => {
  const t = (frist: string, naa: string) => fristSomTekst(new Date(frist), new Date(naa));

  it('i dag, i morgen og i går — etter norsk dato, ikke serverens', () => {
    // Sommertid (UTC+2). Rapporten lages kl. 06:00 UTC = 08:00 norsk tid.
    expect(t('2026-09-15T06:10:00Z', '2026-09-15T06:00:00Z')).toBe('i dag kl. 08:10');
    expect(t('2026-09-16T04:00:00Z', '2026-09-15T06:00:00Z')).toBe('i morgen kl. 06:00');
    expect(t('2026-09-14T15:30:00Z', '2026-09-15T06:00:00Z')).toBe('i går kl. 17:30');
  });

  it('døgnskillet er det norske: 22:30 UTC om sommeren er i morgen', () => {
    // Kveldsvarselet kl. 18:00 UTC = 20:00. Fristen 22:30 UTC er 00:30 neste
    // dag i Norge — med UTC-dato ville det stått «i dag kl. 00:30».
    expect(t('2026-09-15T22:30:00Z', '2026-09-15T18:00:00Z')).toBe('i morgen kl. 00:30');
    // Og rett før midnatt er det fortsatt i dag.
    expect(t('2026-09-15T21:59:00Z', '2026-09-15T18:00:00Z')).toBe('i dag kl. 23:59');
  });

  it('vintertid: én time fra UTC, ikke to', () => {
    expect(t('2026-11-16T07:10:00Z', '2026-11-16T06:00:00Z')).toBe('i dag kl. 08:10');
    expect(t('2026-11-17T05:05:00Z', '2026-11-16T18:00:00Z')).toBe('i morgen kl. 06:05');
  });

  it('lenger unna enn i går: datoen', () => {
    expect(t('2026-09-12T08:00:00Z', '2026-09-15T06:00:00Z')).toBe('12. september kl. 10:00');
  });

  it('minuttet rundes ned — tiden som står er aldri senere enn den ekte', () => {
    expect(t('2026-09-15T06:10:59Z', '2026-09-15T06:00:00Z')).toBe('i dag kl. 08:10');
  });
});

describe('«nå» når neste varsel ville kommet for sent', () => {
  const NAA = '2026-09-15T06:00:00Z';
  const meldtFor = (ms: number) => new Date(Date.parse(NAA) - ms).toISOString();
  /** Meldt slik at det står igjen så mye av fristen nå. */
  const medIgjen = (ms: number) => meldtFor(BEHANDLINGSFRIST_TIMER * TIME - ms);

  it('god tid igjen: ikke «nå» — neste varsel kommer i god tid før fristen', () => {
    const m = blokk(NAA, meldtFor(5 * TIME));
    expect(m).toMatchObject({ overFrist: false, haster: false, eldsteTimer: 5 });
    expect(m.fristTekst).toBe('i morgen kl. 03:00');
  });

  it('grensen er intervallet pluss handlingsrommet: neste varsel må komme med minst tre timer igjen', () => {
    expect(VARSELINTERVALL_TIMER + HANDLINGSROM_TIMER).toBe(15);
    expect(blokk(NAA, medIgjen(15 * TIME)).haster).toBe(true);
    expect(blokk(NAA, medIgjen(15 * TIME + 1000)).haster).toBe(false);
    expect(blokk(NAA, medIgjen(15 * TIME - 1000)).haster).toBe(true);
  });

  it('fristen går ut rett ETTER neste varsel: fortsatt «nå» — ti minutter er ikke et varsel å handle på', () => {
    // Tolv timer og ti minutter igjen. Neste e-post kommer om tolv timer.
    expect(blokk(NAA, medIgjen(12 * TIME + 10 * 60_000))).toMatchObject({ overFrist: false, haster: true });
  });

  it('ti minutter igjen: «nå», men ikke over — rødt er forbeholdt det som er ute', () => {
    const m = blokk(NAA, medIgjen(10 * 60_000));
    expect(m).toMatchObject({ overFrist: false, haster: true, eldsteTimer: 23 });
    expect(m.fristTekst).toBe('i dag kl. 08:10');
  });

  it('over fristen haster alltid', () => {
    expect(blokk(NAA, meldtFor(30 * TIME))).toMatchObject({ overFrist: true, haster: true });
  });

  it('ukjent alder haster — «vet ikke» leses aldri som «det er tid»', () => {
    expect(blokk(NAA, 'tull', 2)).toMatchObject({ antall: 2, haster: true, overFrist: false, fristUtloper: null, fristTekst: null });
    expect(blokk(NAA, null, 2)).toMatchObject({ antall: 2, haster: true, fristTekst: null });
  });

  it('ingenting åpent, eller ikke målt: ingenting haster', () => {
    expect(blokk(NAA, null, 0)).toMatchObject({ maalt: true, haster: false, varsel: null });
    expect(byggModereringsblokk({ naa: new Date(NAA) })).toMatchObject({ maalt: false, haster: false, varsel: null });
  });

  it('fristen er meldingstidspunktet pluss konsollens døgnfrist', () => {
    const m = blokk(NAA, '2026-09-14T19:23:45Z');
    expect(m.fristUtloper).toBe(new Date(Date.parse('2026-09-14T19:23:45Z') + BEHANDLINGSFRIST_TIMER * TIME).toISOString());
  });
});

describe('to varsler i døgnet', () => {
  /** Timeplanen slik Vercel kjører den. */
  const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
    crons: Array<{ path: string; schedule: string }>;
  };
  const klokke = (path: string) => {
    const cron = vercel.crons.find((c) => c.path === path);
    expect(cron, `${path} mangler i vercel.json`).toBeDefined();
    const [minutt, time, ...resten] = cron!.schedule.split(' ');
    // Hver dag, på ett fast klokkeslett.
    expect(resten).toEqual(['*', '*', '*']);
    return Number(time) * 60 + Number(minutt);
  };

  it('dagsrapporten og kveldsvarselet går med VARSELINTERVALL_TIMER mellom seg, begge veier', () => {
    const morgen = klokke('/api/cron/dagsrapport');
    const kveld = klokke('/api/cron/aapne-rapporter');
    const avstand = Math.abs(kveld - morgen);
    // Regelen for «nå» hviler på tallet: flyttes en av jobbene, må det følge med.
    expect(Math.max(avstand, 24 * 60 - avstand)).toBe(VARSELINTERVALL_TIMER * 60);
    expect(Math.min(avstand, 24 * 60 - avstand)).toBe(VARSELINTERVALL_TIMER * 60);
  });

  it('begge rutene finnes', () => {
    for (const rute of ['dagsrapport', 'aapne-rapporter']) {
      expect(existsSync(join(process.cwd(), 'src/app/api/cron', rute, 'route.ts')), rute).toBe(true);
    }
  });

  it('intervallet og handlingsrommet får plass i fristen — ellers kunne første varsel komme for sent', () => {
    expect(VARSELINTERVALL_TIMER + HANDLINGSROM_TIMER).toBeLessThan(BEHANDLINGSFRIST_TIMER);
  });

  /** Klokkeslettene varslene går på, i UTC-minutter, lest fra vercel.json. */
  const varseltider = () => [klokke('/api/cron/dagsrapport'), klokke('/api/cron/aapne-rapporter')].sort((a, b) => a - b);

  /** Varslene som går de to første døgnene etter at en melding kom inn. */
  function varslerEtter(meldt: Date): Date[] {
    const midnatt = Date.UTC(meldt.getUTCFullYear(), meldt.getUTCMonth(), meldt.getUTCDate());
    const alle: Date[] = [];
    for (let dag = 0; dag < 3; dag += 1) {
      for (const minutter of varseltider()) alle.push(new Date(midnatt + dag * 24 * TIME + minutter * 60_000));
    }
    return alle.filter((v) => v.getTime() >= meldt.getTime());
  }

  it('uansett når på døgnet meldingen kommer: første varsel innen tolv timer, og et «nå» med minst tre timer igjen', () => {
    const start = Date.parse('2026-09-14T00:00:00Z');
    for (let minutt = 0; minutt < 24 * 60; minutt += 7) {
      const meldt = new Date(start + minutt * 60_000);
      const [forste, andre] = varslerEtter(meldt);
      const hva = `meldt ${meldt.toISOString()}`;
      const ved = (naa: Date) => {
        const m = byggModereringsblokk({ aapneRapporter: { antall: 1, eldsteOpprettet: meldt.toISOString() }, naa });
        return { m, igjenMs: Date.parse(m.fristUtloper!) - naa.getTime() };
      };

      // Første varsel: senest tolv timer etter meldingen, altså med minst tolv igjen.
      const v1 = ved(forste);
      expect(forste.getTime() - meldt.getTime(), hva).toBeLessThanOrEqual(VARSELINTERVALL_TIMER * TIME);
      expect(v1.m.overFrist, hva).toBe(false);
      expect(v1.igjenMs, hva).toBeGreaterThanOrEqual((BEHANDLINGSFRIST_TIMER - VARSELINTERVALL_TIMER) * TIME);

      // Og ett av de to første sier «nå» mens det ennå går an å rekke noe —
      // aldri først når fristen er ute, og aldri først ti minutter før.
      const v2 = ved(andre);
      const naaMedTidIgjen = [v1, v2].some((v) => v.m.haster && !v.m.overFrist && v.igjenMs >= HANDLINGSROM_TIMER * TIME);
      expect(naaMedTidIgjen, hva).toBe(true);
    }
  });

  it('meldingen som utløste endringen: meldt mandag 06:10 UTC', () => {
    // Før: første e-post tirsdag 06:00 (23 t 50 min, gult, «i dag»), rødt
    // først onsdag ved 48 timer.
    const meldt = '2026-09-14T06:10:00Z';

    // Tolv timer og ti minutter igjen, og neste e-post kommer ti minutter
    // før fristen: det er DENNE som må si «nå».
    const mandagKveld = blokk('2026-09-14T18:00:00Z', meldt);
    expect(mandagKveld).toMatchObject({ eldsteTimer: 11, overFrist: false, haster: true, fristTekst: 'i morgen kl. 08:10' });
    expect(byggModereringsvarsel(mandagKveld)?.handling).toBe('Behandle den nå');
    expect(byggModereringsvarsel(mandagKveld)?.emne).toBe('⚠️ 1 åpen rapport — frist i morgen kl. 08:10');

    const tirsdagMorgen = blokk('2026-09-15T06:00:00Z', meldt);
    expect(tirsdagMorgen).toMatchObject({ eldsteTimer: 23, overFrist: false, haster: true, fristTekst: 'i dag kl. 08:10' });
    expect(byggModereringsvarsel(tirsdagMorgen)?.handling).toBe('Behandle den nå');

    const tirsdagKveld = blokk('2026-09-15T18:00:00Z', meldt);
    expect(tirsdagKveld).toMatchObject({ eldsteTimer: 35, overFrist: true, haster: true, fristTekst: 'i dag kl. 08:10' });
    expect(tirsdagKveld.varsel).toBe('1 åpen rapport i forumet — den har ventet 35 t, fristen på 24 t gikk ut i dag kl. 08:10');
  });
});

describe('varselet slik det står i e-posten', () => {
  const NAA = '2026-09-15T18:00:00Z';

  it('ingenting venter: ikke noe varsel', () => {
    expect(byggModereringsvarsel(blokk(NAA, null, 0))).toBeNull();
    expect(byggModereringsvarsel(byggModereringsblokk({ naa: new Date(NAA) }))).toBeNull();
  });

  it('innenfor fristen: klokkeslettet i emnet, gult banner, lenke til konsollen', () => {
    const v = byggModereringsvarsel(blokk(NAA, '2026-09-15T16:00:00Z', 2))!;
    expect(v.emne).toBe('⚠️ 2 åpne rapporter — frist i morgen kl. 18:00');
    expect(v.handling).toBe('Behandle dem før det');
    expect(v.url).toBe(LENKE);
    expect(v.tekst).toBe(`⚠️ 2 åpne rapporter i forumet — den eldste har ventet 2 t, fristen på 24 t går ut i morgen kl. 18:00.\nBehandle dem før det: ${LENKE}`);
    expect(v.html).toContain('<strong>⚠️ 2 åpne rapporter i forumet — den eldste har ventet 2 t, fristen på 24 t går ut i morgen kl. 18:00.</strong>');
    expect(v.html).toContain(`<a href="${LENKE}"`);
    expect(v.html).toContain('background:#fffbeb');
    expect(v.html).not.toContain('background:#fef2f2');
  });

  it('over fristen: «over døgnfristen» i emnet, rødt, «nå»', () => {
    const v = byggModereringsvarsel(blokk(NAA, '2026-09-14T10:00:00Z'))!;
    expect(v.emne).toBe('⚠️ 1 åpen rapport over døgnfristen');
    expect(v.handling).toBe('Behandle den nå');
    expect(v.html).toContain('background:#fef2f2');
    expect(v.html).not.toContain('background:#fffbeb');
  });

  it('ukjent alder: «å behandle» i emnet — ikke et klokkeslett vi ikke har — og «nå»', () => {
    const v = byggModereringsvarsel(blokk(NAA, 'tull', 3))!;
    expect(v.emne).toBe('⚠️ 3 åpne rapporter å behandle');
    expect(v.handling).toBe('Behandle dem nå');
  });

  it('lenka følger NEXT_PUBLIC_APP_URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://forhandsvisning.example.com';
    expect(byggModereringsvarsel(blokk(NAA, '2026-09-15T16:00:00Z'))?.url).toBe('https://forhandsvisning.example.com/forum/moderation');
  });
});

describe('kveldsvarselet', () => {
  const NAA = new Date('2026-09-15T18:00:00Z');

  it('ingenting venter: ingen e-post å sende', () => {
    expect(byggKveldsvarselEpost(blokk(NAA.toISOString(), null, 0), NAA)).toBeNull();
  });

  it('noe venter: emnet sier hva og når, og e-posten har banneret, lenka og ingenting annet om innholdet', () => {
    const e = byggKveldsvarselEpost(blokk(NAA.toISOString(), '2026-09-15T06:10:00Z'), NAA)!;
    expect(e.emne).toBe('Mycelet: ⚠️ 1 åpen rapport — frist i morgen kl. 08:10');
    for (const variant of [e.html, e.tekst]) {
      expect(variant).toContain('Mycelet · 15. september');
      expect(variant).toContain('Meldt innhold venter');
      expect(variant).toContain('⚠️ 1 åpen rapport i forumet — den har ventet 11 t, fristen på 24 t går ut i morgen kl. 08:10.');
      expect(variant).toContain('Behandle den nå: ');
      expect(variant).toContain(LENKE);
      expect(variant).toMatch(/samme\s+telling\s+og\s+samme\s+frist\s+på\s+24\s+t\s+som\s+moderasjonssiden\s+og\s+dagsrapporten/);
      expect(variant).toContain('Klokkeslett er norsk tid.');
    }
    expect(e.html).toContain('<html lang="nb">');
  });

  it('over fristen: emnet sier det, og banneret er rødt', () => {
    const e = byggKveldsvarselEpost(blokk(NAA.toISOString(), '2026-09-14T06:10:00Z', 2), NAA)!;
    expect(e.emne).toBe('Mycelet: ⚠️ 2 åpne rapporter over døgnfristen');
    expect(e.html).toContain('background:#fef2f2');
    expect(e.tekst).toContain('Behandle dem nå: ');
  });

  it('datoen i e-posten er den norske', () => {
    // 22:30 UTC om sommeren er over midnatt i Norge.
    const sent = new Date('2026-09-15T22:30:00Z');
    expect(byggKveldsvarselEpost(blokk(sent.toISOString(), '2026-09-15T20:00:00Z'), sent)!.tekst).toContain('Mycelet · 16. september');
  });

  it('lesingen feilet: «ikke målt» — stillhet om kvelden betyr «ingenting venter», så feilen får ikke se ut som stillhet', () => {
    const e = byggKveldsvarselIkkeMaalt(NAA);
    expect(e.emne).toBe('Mycelet: ⚠️ åpne rapporter ikke målt i kveld');
    for (const variant of [e.html, e.tekst]) {
      expect(variant).toContain('Kveldssjekken fikk ikke lest åpne rapporter i forumet, så det er ikke kjent om noe venter.');
      expect(variant).toContain('Se etter selv: ');
      expect(variant).toContain(LENKE);
      expect(variant).toContain('Tabellen reports svarte ikke.');
      // Ingen tall — vi har ingen.
      expect(variant).not.toMatch(/\d+ åp(en|ne) rapport/);
    }
  });

  it('begge e-postene går til samme postkasse som dagsrapporten', () => {
    expect(RAPPORTMOTTAKER).toBe('post@mycelet.com');
  });
});
