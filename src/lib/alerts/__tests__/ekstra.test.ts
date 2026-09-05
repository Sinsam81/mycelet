import { describe, expect, it } from 'vitest';
import { arterISesong, velgToppdag, type SesongArt } from '../ekstra';
import { byggVarselEpost } from '../email';

const dag = (date: string, label: string, score: number, isToday = false) => ({
  date,
  label,
  isToday,
  score,
  optimal: false
});

describe('velgToppdag', () => {
  it('velger dagen med høyest score', () => {
    const valgt = velgToppdag([dag('2026-09-01', 'I dag', 80, true), dag('2026-09-03', 'tor', 91)]);
    expect(valgt).toEqual({ dag: 'tor', score: 91, erIDag: false, delteDager: [], jevn: false });
  });

  it('ved likhet peker dag på den tidligste — men begge navngis som like gode', () => {
    const valgt = velgToppdag([
      dag('2026-09-01', 'I dag', 80, true),
      dag('2026-09-03', 'tor', 91),
      dag('2026-09-05', 'lør', 91)
    ]);
    expect(valgt?.dag).toBe('tor');
    expect(valgt?.delteDager).toEqual(['tor', 'lør']);
    expect(valgt?.jevn).toBe(false);
  });

  it('en helt jevn uke er ikke «i dag er ukas beste dag»', () => {
    // 63 % av sesongukene har delt toppscore — uten dette sto artefakten i de fleste varslene.
    const valgt = velgToppdag([dag('2026-09-01', 'I dag', 100, true), dag('2026-09-02', 'tir', 100), dag('2026-09-03', 'ons', 100)]);
    expect(valgt).toMatchObject({ dag: 'I dag', erIDag: true, jevn: true, delteDager: ['I dag', 'tir', 'ons'] });
  });

  it('tom liste gir null, aldri krasj', () => {
    expect(velgToppdag([])).toBeNull();
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

  it('uten ekstrafelt er e-posten som før — krydderet er strengt valgfritt', () => {
    const { html } = byggVarselEpost({ ...base, locale: 'nb' });
    expect(html).not.toContain('Utsikten fremover');
    expect(html).not.toContain('I sesong nå');
  });

  it('toppdag og arter havner i både html og ren tekst (nb)', () => {
    const { html, tekst } = byggVarselEpost({
      ...base,
      locale: 'nb',
      toppdag: { dag: 'tor', score: 91, erIDag: false },
      arter: ['kantarell', 'steinsopp']
    });
    for (const kropp of [html, tekst]) {
      expect(kropp).toContain('best tor (91 av 100)');
      expect(kropp).toContain('I sesong nå: kantarell, steinsopp.');
    }
  });

  it('«i dag er beste dag»-varianten når toppdagen er i dag', () => {
    const { tekst } = byggVarselEpost({
      ...base,
      locale: 'nb',
      toppdag: { dag: 'I dag', score: 88, erIDag: true }
    });
    expect(tekst).toContain('i dag ser ut til å bli ukas beste dag (88 av 100)');
  });

  it('delte toppdager navngis som like gode; en jevn uke sier det rett ut', () => {
    const delt = byggVarselEpost({
      ...base,
      locale: 'nb',
      toppdag: { dag: 'tor', score: 91, erIDag: false, delteDager: ['tor', 'lør'], jevn: false }
    }).tekst;
    expect(delt).toContain('tor og lør ser like gode ut (91 av 100)');
    const jevn = byggVarselEpost({
      ...base,
      locale: 'nb',
      toppdag: { dag: 'I dag', score: 100, erIDag: true, delteDager: ['I dag', 'tir', 'ons'], jevn: true }
    }).tekst;
    expect(jevn).toContain('jevnt hele uka (100 av 100)');
    expect(jevn).not.toContain('ukas beste dag');
  });

  it('svensk er svensk', () => {
    const { html } = byggVarselEpost({
      ...base,
      locale: 'sv',
      toppdag: { dag: 'tor', score: 91, erIDag: false },
      arter: ['karljohan']
    });
    expect(html).toContain('bäst tor (91 av 100)');
    expect(html).toContain('I säsong nu: karljohan.');
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
      expect(kropp).toContain('214 sopfunn');
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
