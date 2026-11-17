import { describe, expect, it } from 'vitest';
import { arterISesong, velgToppdag, type SesongArt, type Toppdag } from '../ekstra';
import { byggVarselEpost } from '../email';
import { beskrivToppdag } from '@/lib/prediction/region-week';

const dag = (date: string, label: string, score: number, isToday = false) => ({
  date,
  label,
  isToday,
  score,
  optimal: false
});

/** I dag (tirsdag 1. september 2026) + inntil seks prognosedager, slik buildWeek leverer dem. */
function uke(scores: number[]) {
  const etiketter = ['I dag', 'ons', 'tor', 'fre', 'lør', 'søn', 'man'];
  return scores.map((score, i) => dag(`2026-09-0${i + 1}`, etiketter[i], score, i === 0));
}

describe('velgToppdag', () => {
  it('velger dagen med høyest score — som DATO, og uten å bære scoren videre', () => {
    const valgt = velgToppdag(uke([80, 82, 91, 70, 75, 72, 71]));
    expect(valgt).toEqual({ dato: '2026-09-03', erIDag: false, delteDatoer: [], jevn: false });
    // Punkt-dagscoren er en annen skala enn regionens tall. Finnes den ikke i
    // typen, kan den ikke havne i e-posten ved et uhell.
    expect(valgt).not.toHaveProperty('score');
    expect(valgt).not.toHaveProperty('dag');
  });

  it('ved likhet peker dato på den tidligste — men begge navngis som like gode', () => {
    const valgt = velgToppdag(uke([80, 70, 91, 72, 91, 71, 70]));
    expect(valgt?.dato).toBe('2026-09-03');
    expect(valgt?.delteDatoer).toEqual(['2026-09-03', '2026-09-05']);
    expect(valgt?.jevn).toBe(false);
  });

  it('i dag som beste dag merkes som i dag', () => {
    expect(velgToppdag(uke([95, 70, 72, 74, 71, 70, 73]))).toMatchObject({ dato: '2026-09-01', erIDag: true, jevn: false });
  });

  it('en helt jevn uke er ikke «i dag er ukas beste dag»', () => {
    // 63 % av sesongukene har delt toppscore — uten dette sto artefakten i de fleste varslene.
    expect(velgToppdag(uke([100, 100, 100, 100, 100, 100, 100]))).toMatchObject({ jevn: true });
  });

  it('en uke med under seks poengs spenn er jevn — samme regel som stripen på områdesiden', () => {
    // 91 er høyest, men to poeng over resten er ikke «dagen å dra ut». Stripen
    // e-posten lenker til sier «jevne forhold hele uka» om nøyaktig denne uka.
    expect(velgToppdag(uke([90, 91, 90, 89, 90, 90, 88]))).toMatchObject({ jevn: true });
    // Seks poengs spenn er nok til å peke på en dag.
    expect(velgToppdag(uke([84, 90, 85, 86, 87, 88, 89]))).toMatchObject({ dato: '2026-09-02', jevn: false });
  });

  it('uten en uke å rangere finnes ingen toppdag: under fire dager gir null', () => {
    // Mangler prognosen, er «i dag» eneste dag — og «ukas beste dag» ut fra én
    // dag er ikke en påstand om uka. Områdesiden viser heller ingen stripe da.
    expect(velgToppdag([])).toBeNull();
    expect(velgToppdag(uke([88]))).toBeNull();
    expect(velgToppdag(uke([80, 91, 70]))).toBeNull();
    expect(velgToppdag(uke([80, 91, 70, 60]))).not.toBeNull();
  });

  it('peker på de samme dagene som stripen på områdesiden, uke for uke', () => {
    // Deterministisk «tilfeldig» (LCG), så testen aldri vipper: 300 uker med
    // scorer i sesongbåndet, der uavgjort og jevne uker forekommer ofte.
    let tilstand = 20260901;
    const neste = () => {
      tilstand = (tilstand * 1103515245 + 12345) % 2147483648;
      return tilstand / 2147483648;
    };
    let jevne = 0;
    let delte = 0;
    for (let n = 0; n < 300; n += 1) {
      const bunn = 60 + Math.floor(neste() * 30);
      const spenn = 1 + Math.floor(neste() * 12);
      const days = uke(Array.from({ length: 7 }, () => bunn + Math.floor(neste() * spenn)));
      const scores = days.map((d) => d.score);
      const side = beskrivToppdag(days, scores, 'NO');
      const epost = velgToppdag(days);
      const epostDatoer = epost?.jevn ? [] : epost?.delteDatoer.length ? epost.delteDatoer : [epost?.dato];
      expect(epostDatoer, `uke ${n}: ${scores.join(',')}`).toEqual(side.toppIndekser.map((i) => days[i].date));
      if (epost?.jevn) jevne += 1;
      else if (epost?.delteDatoer.length) delte += 1;
    }
    // Sammenligningen er bare verdt noe når alle tre utfallene faktisk forekommer.
    expect(jevne).toBeGreaterThan(20);
    expect(delte).toBeGreaterThan(20);
    expect(300 - jevne - delte).toBeGreaterThan(20);
  });
});

const art = (over: Partial<SesongArt>): SesongArt => ({
  norwegian_name: 'Kantarell',
  swedish_name: 'Kantarell',
  season_start: 7,
  season_end: 10,
  peak_season_start: 8,
  peak_season_end: 9,
  commonality: 'very_common',
  ...over
});

describe('arterISesong', () => {
  it('filtrerer på måned og prioriterer toppsesong foran vanlig sesong', () => {
    const liste = arterISesong(
      [
        art({ norwegian_name: 'Steinsopp', peak_season_start: 6, peak_season_end: 7 }),
        art({ norwegian_name: 'Traktkantarell' }),
        art({ norwegian_name: 'Vintersopp', season_start: 11, season_end: 2 })
      ],
      9,
      'nb'
    );
    expect(liste[0]).toBe('traktkantarell');
    expect(liste).not.toContain('vintersopp');
  });

  it('håndterer sesonger over årsskiftet', () => {
    const liste = arterISesong([art({ norwegian_name: 'Vintersopp', season_start: 11, season_end: 2 })], 1, 'nb');
    expect(liste).toEqual(['vintersopp']);
  });

  it('svensk bruker svensk navn, med norsk som stille reserve', () => {
    const liste = arterISesong(
      [art({ norwegian_name: 'Steinsopp', swedish_name: 'Karljohan' }), art({ norwegian_name: 'Piggsopp', swedish_name: null })],
      9,
      'sv'
    );
    expect(liste).toContain('karljohan');
    expect(liste).toContain('piggsopp');
  });
});

describe('byggVarselEpost med ekstrainnhold', () => {
  const base = {
    region: 'Kristiansand',
    fra: 62,
    til: 91,
    appUrl: 'https://www.mycelet.com',
    avmeldingsUrl: 'https://www.mycelet.com/api/soppvarsel/av?t=x'
  } as const;

  // 2026-09-01 er en tirsdag: 03 er torsdag, 05 er lørdag.
  const torsdag: Toppdag = { dato: '2026-09-03', erIDag: false, delteDatoer: [], jevn: false };
  const iDag: Toppdag = { dato: '2026-09-01', erIDag: true, delteDatoer: [], jevn: false };
  const torsdagOgLordag: Toppdag = { ...torsdag, delteDatoer: ['2026-09-03', '2026-09-05'] };
  const iDagTorsdagLordag: Toppdag = { ...iDag, delteDatoer: ['2026-09-01', '2026-09-03', '2026-09-05'] };
  const femDeler: Toppdag = {
    ...iDag,
    delteDatoer: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']
  };
  const jevn: Toppdag = { ...iDag, delteDatoer: [], jevn: true };

  /** Linja «Utsikten fremover/framöver: …» slik den står i ren tekst. */
  const toppdagLinje = (tekst: string) => tekst.split('\n').find((l) => /^Utsikten (fremover|framöver):/.test(l)) ?? '';

  it('uten ekstrafelt er e-posten som før — krydderet er strengt valgfritt', () => {
    const { html } = byggVarselEpost({ ...base, locale: 'nb' });
    expect(html).not.toContain('Utsikten fremover');
    expect(html).not.toContain('I sesong nå');
  });

  it('bærer aldri et år-mot-år-tall fra registreringsdata, uansett hva som sendes inn', () => {
    // Rapportpulsen ble trukket fra kundeflatene 17. september 2026. Feltet
    // finnes ikke lenger; et objekt som likevel sendes med, skal ikke skrives ut.
    for (const locale of ['nb', 'sv'] as const) {
      const args = {
        ...base,
        locale,
        toppdag: torsdag,
        arter: ['kantarell'],
        puls: { nivaa: 'under', iAar: 3, normalt: 40, fra: '2026-09-01', til: '2026-09-07', region: 'Kristiansand' }
      } as Parameters<typeof byggVarselEpost>[0];
      const { html, tekst } = byggVarselEpost(args);
      for (const kropp of [html, tekst]) {
        expect(kropp).not.toMatch(/over vanlig|under vanlig|över det vanliga|under det vanliga|Artsobservasjoner|GBIF/i);
      }
    }
  });

  it('toppdag og arter havner i både html og ren tekst (nb) — ukedagen skrevet fullt ut', () => {
    const { html, tekst } = byggVarselEpost({ ...base, locale: 'nb', toppdag: torsdag, arter: ['kantarell', 'steinsopp'] });
    for (const kropp of [html, tekst]) {
      expect(kropp).toContain('Utsikten fremover: ser best ut på torsdag.');
      expect(kropp).toContain('I sesong nå: kantarell, steinsopp.');
      // «best tor» var stripens korte etikett limt inn i løpende tekst.
      expect(kropp).not.toMatch(/best tor\b/);
    }
  });

  it('«i dag er beste dag»-varianten når toppdagen er i dag', () => {
    const { tekst } = byggVarselEpost({ ...base, locale: 'nb', toppdag: iDag });
    expect(toppdagLinje(tekst)).toBe('Utsikten fremover: i dag ser ut til å bli ukas beste dag.');
  });

  it('delte toppdager navngis som like gode — «i dag» med liten forbokstav midt i setningen', () => {
    expect(toppdagLinje(byggVarselEpost({ ...base, locale: 'nb', toppdag: torsdagOgLordag }).tekst)).toBe(
      'Utsikten fremover: torsdag og lørdag ser like gode ut.'
    );
    expect(toppdagLinje(byggVarselEpost({ ...base, locale: 'nb', toppdag: iDagTorsdagLordag }).tekst)).toBe(
      'Utsikten fremover: i dag, torsdag og lørdag ser like gode ut.'
    );
  });

  it('flere enn fire delte toppdager ramses ikke opp; en jevn uke sier det rett ut', () => {
    expect(toppdagLinje(byggVarselEpost({ ...base, locale: 'nb', toppdag: femDeler }).tekst)).toBe(
      'Utsikten fremover: flere dager ser like gode ut — ingen enkeltdag skiller seg ut.'
    );
    const jevnTekst = byggVarselEpost({ ...base, locale: 'nb', toppdag: jevn }).tekst;
    expect(toppdagLinje(jevnTekst)).toBe('Utsikten fremover: jevnt hele uka — ingen dag skiller seg ut.');
    expect(jevnTekst).not.toContain('ukas beste dag');
  });

  it('svensk er svensk', () => {
    const { html, tekst } = byggVarselEpost({ ...base, locale: 'sv', toppdag: torsdag, arter: ['karljohan'] });
    expect(html).toContain('Utsikten framöver: ser bäst ut på torsdag.');
    expect(html).toContain('I säsong nu: karljohan.');
    expect(toppdagLinje(tekst)).not.toMatch(/[æø]/);
    expect(toppdagLinje(byggVarselEpost({ ...base, locale: 'sv', toppdag: iDag }).tekst)).toBe(
      'Utsikten framöver: i dag ser ut att bli veckans bästa dag.'
    );
    expect(toppdagLinje(byggVarselEpost({ ...base, locale: 'sv', toppdag: iDagTorsdagLordag }).tekst)).toBe(
      'Utsikten framöver: i dag, torsdag och lördag ser lika bra ut.'
    );
    expect(toppdagLinje(byggVarselEpost({ ...base, locale: 'sv', toppdag: femDeler }).tekst)).toBe(
      'Utsikten framöver: flera dagar ser lika bra ut — ingen enskild dag sticker ut.'
    );
    expect(toppdagLinje(byggVarselEpost({ ...base, locale: 'sv', toppdag: jevn }).tekst)).toBe(
      'Utsikten framöver: jämnt hela veckan — ingen dag sticker ut.'
    );
  });

  it('ÉN skala per e-post: «av 100» står bare ved regionens tall, og toppdaglinja har ingen tall', () => {
    // Regionens tall (p90 over ruter) og punkt-dagscoren i sentrum er to
    // modeller. E-posten sa 82 i overskriften og «i dag … (74 av 100)» to
    // avsnitt lenger ned — samme dag, to ulike tall.
    for (const locale of ['nb', 'sv'] as const) {
      for (const toppdag of [torsdag, iDag, torsdagOgLordag, iDagTorsdagLordag, femDeler, jevn]) {
        const { emne, html, tekst } = byggVarselEpost({ ...base, locale, toppdag, arter: ['kantarell'] });
        const linje = toppdagLinje(tekst);
        expect(linje, `${locale}: linja finnes`).not.toBe('');
        expect(linje, `${locale}: ${linje}`).not.toMatch(/\d/);
        expect(linje).not.toContain('av 100');
        // Emnet og endringssetningen bærer regionens tall — og ingen andre gjør det.
        expect(emne.match(/av 100/g)).toHaveLength(1);
        expect(tekst.match(/av 100/g), `${locale}: ren tekst`).toHaveLength(1);
        expect(html.match(/av 100/g), `${locale}: html`).toHaveLength(1);
        expect(`${html} ${tekst}`).not.toMatch(/7-dagersstripa|7-dagarsremsan/);
      }
    }
  });

  it('ukedagene er de samme ordene som områdesiden bruker, alle sju, på begge språk', () => {
    // E-postens tabell og region-week.ts sin er to kopier; denne holder dem i takt.
    const sett = new Set<string>();
    for (let n = 2; n <= 8; n += 1) {
      const days = Array.from({ length: 7 }, (_, i) => ({ date: `2026-09-${String(n - 1 + i).padStart(2, '0')}` }));
      const scores = [50, 90, 50, 50, 50, 50, 50];
      const dato = days[1].date;
      for (const [locale, land, intro] of [
        ['nb', 'NO', 'Utsikten fremover: '],
        ['sv', 'SE', 'Utsikten framöver: ']
      ] as const) {
        const side = beskrivToppdag(days, scores, land).line;
        const linje = toppdagLinje(
          byggVarselEpost({ ...base, locale, toppdag: { dato, erIDag: false, delteDatoer: [], jevn: false } }).tekst
        );
        expect(linje, `${dato} ${locale}`).toBe(`${intro}${side.charAt(0).toLowerCase()}${side.slice(1)}`);
        sett.add(`${locale}:${linje}`);
      }
    }
    // Sju ulike ukedager på hvert språk — ellers har vi ikke testet alle.
    expect(sett.size).toBe(14);
  });
});

describe('byggVarselEpost med fasit', () => {
  const base = {
    region: 'Oslo',
    fra: 62,
    til: 91,
    appUrl: 'https://www.mycelet.com',
    avmeldingsUrl: 'https://www.mycelet.com/api/soppvarsel/av?t=x'
  } as const;

  it('fasitlinjen står i html og tekst, med norsk dato', () => {
    const { html, tekst } = byggVarselEpost({
      ...base,
      locale: 'nb',
      fasit: { dato: '2026-08-14', ukenEtter: 214, ukenFor: 71 }
    });
    for (const kropp of [html, tekst]) {
      expect(kropp).toContain('Fasit for forrige varsel (14. august)');
      expect(kropp).toContain('214 soppfunn');
      // Skrivefeilen «sopfunn» sto i nettopp det avsnittet som skal vise etterrettelighet.
      expect(kropp).not.toContain('sopfunn');
      expect(kropp).toContain('71 uken før');
      expect(kropp).toContain('mycelet.com/apenhet');
    }
  });

  it('svensk fasit med svensk datoform', () => {
    const { tekst } = byggVarselEpost({
      ...base,
      locale: 'sv',
      fasit: { dato: '2026-08-14', ukenEtter: 214, ukenFor: 71 }
    });
    expect(tekst).toContain('Facit för förra varningen (14 augusti)');
  });

  it('uten fasit: ingen fasitlinje — kvitteringen venter til tallene er modne', () => {
    const { html } = byggVarselEpost({ ...base, locale: 'nb' });
    expect(html).not.toContain('Fasit for forrige varsel');
  });
});
