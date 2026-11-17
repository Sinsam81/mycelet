import { describe, expect, it } from 'vitest';
import { assessFlush } from '@/lib/prediction/flush';
import { assessMushroomDay } from '@/lib/prediction/mushroom-day';
import { erUtenomSesongFlush } from '../utenom-sesong-flush';

const vaer = { temperatureC: 12, humidityPct: 85, rain3dMm: 10, rain7dMm: 30, rain14dMm: 45 };
const flushInn = (month: number, currentTempC = 12) => ({
  month,
  soilMoistureIndex: 0.7,
  rain7dMm: 30,
  currentTempC,
  forecast: []
});

describe('erUtenomSesongFlush', () => {
  it.each([12, 1, 2, 3, 4, 5])('måned %i: banneret gjentar dommen og skal ikke tegnes', (month) => {
    for (const locale of ['nb', 'sv'] as const) {
      const dag = assessMushroomDay(vaer, month, locale);
      const flush = assessFlush(flushInn(month), undefined, locale);
      // Dette er selve dobbeltvisningen: samme tittel og setning to ganger.
      expect(flush.title).toBe(dag.title);
      expect(flush.message).toBe(dag.message);
      expect(erUtenomSesongFlush(flush, dag.title)).toBe(true);
    }
  });

  it.each([6, 9, 11])('måned %i: i sesong vises banneret', (month) => {
    const dag = assessMushroomDay(vaer, month);
    expect(erUtenomSesongFlush(assessFlush(flushInn(month)), dag.title)).toBe(false);
  });

  it('«For kaldt akkurat nå» midt i sesongen er en egen opplysning og vises', () => {
    const kaldt = assessFlush(flushInn(10, -1));
    expect(kaldt.status).toBe('dormant');
    expect(kaldt.reason).toBe('cold');
    expect(erUtenomSesongFlush(kaldt, assessMushroomDay(vaer, 10).title)).toBe(false);
  });

  it('«Fuktig, men varmt» og «Fuktig, men kaldt» er egne opplysninger og vises', () => {
    const fuktigVarmt = assessFlush(flushInn(8, 21));
    expect(fuktigVarmt).toMatchObject({ status: 'dormant', reason: 'warm' });
    const varmDom = assessMushroomDay({ ...vaer, temperatureC: 21 }, 8);
    expect(varmDom.title).not.toBe(fuktigVarmt.title);
    expect(erUtenomSesongFlush(fuktigVarmt, varmDom.title)).toBe(false);

    const fuktigKaldt = assessFlush(flushInn(10, 2.5));
    expect(fuktigKaldt).toMatchObject({ status: 'dormant', reason: 'cold' });
    expect(erUtenomSesongFlush(fuktigKaldt, assessMushroomDay({ ...vaer, temperatureC: 2.5 }, 10).title)).toBe(false);
  });

  it('svar cachet før reason-feltet: faller tilbake på lik tittel', () => {
    expect(erUtenomSesongFlush({ status: 'dormant', title: 'Utenom soppsesongen' }, 'Utenom soppsesongen')).toBe(true);
    expect(erUtenomSesongFlush({ status: 'dormant', title: 'For kaldt akkurat nå' }, 'Soppforhold i dag')).toBe(false);
  });

  it('uten flush er det ingenting å skjule', () => {
    expect(erUtenomSesongFlush(undefined, 'x')).toBe(false);
    expect(erUtenomSesongFlush(null, 'x')).toBe(false);
  });
});
