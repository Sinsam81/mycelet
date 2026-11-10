import { describe, expect, it } from 'vitest';
import { assessFlush } from '@/lib/prediction/flush';
import { assessMushroomDay } from '@/lib/prediction/mushroom-day';
import { buildExplanation } from '@/lib/utils/prediction-explanation';
import { HOVEDSESONG_STARTMANED, sesongfaseForManed } from '../sesongtilstand';
import { utenomSesongTekst } from '../utenom-sesong-tekst';

const vaer = { temperatureC: 12, humidityPct: 85, rain3dMm: 10, rain7dMm: 30, rain14dMm: 45 };
const UTENOM = [12, 1, 2, 3, 4, 5];

describe('utenomSesongTekst', () => {
  it.each(UTENOM)('måned %i ber aldri brukeren komme tilbake', (month) => {
    for (const locale of ['nb', 'sv'] as const) {
      const { title, message } = utenomSesongTekst(month, locale);
      expect(`${title} ${message}`).not.toMatch(/kom tilbake|kom tillbaka|sensommer|slutet av sommaren/i);
    }
  });

  it('vinter og vår har ulik tekst, og våren nevner vårsoppene', () => {
    for (const locale of ['nb', 'sv'] as const) {
      const vinter = utenomSesongTekst(12, locale);
      const vaar = utenomSesongTekst(4, locale);
      expect(vaar.title).not.toBe(vinter.title);
      expect(vaar.message).not.toBe(vinter.message);
      expect(vaar.message).toMatch(locale === 'sv' ? /Vårsvamparna/ : /Vårsoppene/);
      expect(utenomSesongTekst(5, locale)).toEqual(vaar);
      expect(utenomSesongTekst(1, locale)).toEqual(vinter);
    }
  });

  it('svensk er svensk', () => {
    expect(utenomSesongTekst(1, 'sv').message).not.toMatch(/Soppsesongen|høysesong|Tallet|været/);
    expect(utenomSesongTekst(4, 'sv').message).not.toMatch(/høstsesongen|tallet|Vårsoppene/);
    expect(utenomSesongTekst(1, 'sv').message).toMatch(/^Svampsäsongen börjar i juni/);
    expect(utenomSesongTekst(4, 'sv').message).toMatch(/^Sommar- och höstsäsongen börjar i juni/);
  });

  it('lover ingen funn og gir ingen spiselighetsdom', () => {
    for (const month of UTENOM) {
      for (const locale of ['nb', 'sv'] as const) {
        expect(utenomSesongTekst(month, locale).message).not.toMatch(/finner du|hittar du|spiselig|ätlig|trygg/i);
      }
    }
  });

  it('«juni» i teksten er første måned med sesongvekt (HOVEDSESONG_STARTMANED)', () => {
    expect(HOVEDSESONG_STARTMANED).toBe(6);
    for (const month of UTENOM) {
      expect(utenomSesongTekst(month, 'nb').message).toContain('starter i juni');
      expect(utenomSesongTekst(month, 'sv').message).toContain('börjar i juni');
    }
  });

  it.each(UTENOM)('måned %i kaller ikke juni for hovedsesong eller högsäsong', (month) => {
    // Sto som «Hovedsesongen starter i juni» / «Högsäsongen börjar i juni» —
    // kodens navn på juni–november limt inn i teksten. Til brukeren betyr de
    // ordene august–oktober (se testen under), så kortet lovet en hovedsesong
    // to måneder før det selv innfrir den.
    for (const locale of ['nb', 'sv'] as const) {
      expect(utenomSesongTekst(month, locale).message).not.toMatch(
        /(hovedsesong|høysesong|högsäsong|huvudsäsong)\S*\s+(starter|begynner|börjar|startar)\s+i\s+juni/i
      );
    }
  });

  it('høysesongen vinterteksten navngir er den kortet selv viser: august, ikke juni', () => {
    // Kortets egen hake — «✓ Hovedsesong for sopp i Norge» / «✓ Högsäsong för
    // svamp» — kommer først i august. Juni er «lav sesong» i samme tabell.
    for (const locale of ['nb', 'sv'] as const) {
      const sesonglinje = (month: number) =>
        buildExplanation({ weather: vaer, month, locale }).find((linje) => linje.category === 'season');
      expect(sesonglinje(6)?.level).toBe('negative');
      expect(sesonglinje(7)?.level).toBe('neutral');
      expect(sesonglinje(8)?.level).toBe('positive');
      expect(sesonglinje(8)?.text).toMatch(locale === 'sv' ? /Högsäsong/ : /Hovedsesong/);
    }
    // …og august er første måned i fasen 'hoysesong' (full sesongvekt).
    expect(sesongfaseForManed(7)).not.toBe('hoysesong');
    expect(sesongfaseForManed(8)).toBe('hoysesong');
    expect(utenomSesongTekst(1, 'nb').message).toContain('høysesong fra august');
    expect(utenomSesongTekst(1, 'sv').message).toContain('högsäsong från augusti');
  });

  it.each(UTENOM)('måned %i: dagsdommen og flush-banneret leser samme kilde', (month) => {
    for (const locale of ['nb', 'sv'] as const) {
      const tekst = utenomSesongTekst(month, locale);
      const dag = assessMushroomDay(vaer, month, locale);
      const flush = assessFlush(
        { month, soilMoistureIndex: 0.7, rain7dMm: 30, currentTempC: 12, forecast: [] },
        undefined,
        locale
      );
      expect({ title: dag.title, message: dag.message }).toEqual(tekst);
      expect({ title: flush.title, message: flush.message }).toEqual(tekst);
      expect(flush.reason).toBe('offSeason');
    }
  });

  it.each([6, 7, 8, 9, 10, 11])('måned %i: i sesong brukes aldri utenom-teksten', (month) => {
    const dag = assessMushroomDay(vaer, month);
    expect(dag.title).not.toBe(utenomSesongTekst(month).title);
  });
});
