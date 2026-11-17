// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';
import type { PredictionResponse } from '@/types/prediction';
import { scoreToCondition } from '@/lib/utils/prediction';
import { scoreVerdict } from '@/lib/utils/prediction-explanation';
import { HotspotPanel } from '../HotspotPanel';

/**
 * Kartpanelets etikett for det midterste trinnet følger sesongen, som
 * hjelpeteksten på rutene (scoreVerdict).
 *
 * Funnet 17. november: over et område der beste rute var 54 (rutestigens
 * «moderate») sto «Soppforhold i området · Så vidt i gang» i panelet, mens ruta
 * selv sa «Soppen er fortsatt i gang (54)». Samme trinn, to motsatte påstander
 * på samme kart. Stigen, tersklene og fargen er de samme hele året; bare ordene
 * på det midterste trinnet skifter.
 */

const KATALOG = { nb, sv } as const;
type Sprak = keyof typeof KATALOG;

/** Et svar fra /api/prediction (eller flisbanen) med tallet og bøtta det gir. */
function svar(score: number): PredictionResponse {
  return {
    score,
    condition: scoreToCondition(score),
    weather: { temperature: 6, humidity: 90, rain3dMm: 4 },
    counts: { findingsInArea: 0, recent30d: 0, recent365d: 0 },
    hotspots: []
  } as unknown as PredictionResponse;
}

function tegn(sprak: Sprak, score: number) {
  return render(
    <NextIntlClientProvider locale={sprak} messages={KATALOG[sprak] as never} timeZone="Europe/Oslo">
      <HotspotPanel speciesId={null} data={svar(score)} isLoading={false} error={false} />
    </NextIntlClientProvider>
  );
}

/** Pillen er den eneste knappen når panelet er lukket. */
const pille = () => screen.getByRole('button');

function klokka(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// 54 er «moderate» på rutestigen (50–59), den samme bøtta som ruta på kartet.
const MIDT = 54;

describe('HotspotPanel — det midterste trinnet følger sesongen', () => {
  it('17. november: «Fortsatt i gang», som ruta — i pillen og i det åpne panelet', () => {
    klokka('2026-11-17T10:00:00Z');
    for (const [sprak, sent, tidlig, rute] of [
      ['nb', 'Fortsatt i gang', 'Så vidt i gang', 'Soppen er fortsatt i gang'],
      ['sv', 'Fortfarande i gång', 'Precis i gång', 'Svampen är fortfarande i gång']
    ] as const) {
      expect(scoreVerdict(MIDT, sprak)).toBe(rute);
      tegn(sprak, MIDT);
      expect(pille().textContent).toContain(sent);
      expect(pille().textContent).not.toContain(tidlig);
      fireEvent.click(pille());
      expect(screen.getByText(sent)).toBeTruthy();
      expect(screen.queryByText(tidlig)).toBeNull();
      cleanup();
    }
  });

  it('i august: fortsatt «Så vidt i gang» / «Precis i gång»', () => {
    klokka('2026-08-15T10:00:00Z');
    for (const [sprak, tidlig, rute] of [
      ['nb', 'Så vidt i gang', 'Soppen er så vidt i gang'],
      ['sv', 'Precis i gång', 'Svampen är precis i gång']
    ] as const) {
      expect(scoreVerdict(MIDT, sprak)).toBe(rute);
      tegn(sprak, MIDT);
      expect(pille().textContent).toContain(tidlig);
      cleanup();
    }
  });

  it('hver måned, begge språk: panelet sier det samme trinnet som ruta', () => {
    let senMaaneder = 0;
    for (let maaned = 1; maaned <= 12; maaned++) {
      klokka(`2026-${String(maaned).padStart(2, '0')}-15T10:00:00Z`);
      const sent = scoreVerdict(MIDT, 'nb') === 'Soppen er fortsatt i gang';
      expect(scoreVerdict(MIDT, 'sv') === 'Svampen är fortfarande i gång', `måned ${maaned}`).toBe(sent);
      if (sent) senMaaneder++;
      for (const sprak of ['nb', 'sv'] as const) {
        const tekster = KATALOG[sprak].HotspotPanel;
        tegn(sprak, MIDT);
        const ventet = sent ? tekster.conditionModerateLate : tekster.conditionModerate;
        const ikke = sent ? tekster.conditionModerate : tekster.conditionModerateLate;
        expect(pille().textContent, `${sprak}, måned ${maaned}`).toContain(ventet);
        expect(pille().textContent, `${sprak}, måned ${maaned}`).not.toContain(ikke);
        cleanup();
      }
      vi.useRealTimers();
    }
    // Ikke en test som består fordi den ene grenen aldri slår inn:
    // oktober–mars er etter toppen, april–september ikke.
    expect(senMaaneder).toBe(6);
  });

  it('følger måneden i Oslo, ikke i UTC', () => {
    // 30. september kl. 21.30 UTC er 23.30 i Oslo — fortsatt september.
    klokka('2026-09-30T21:30:00Z');
    tegn('nb', MIDT);
    expect(pille().textContent).toContain('Så vidt i gang');
    cleanup();
    // En time senere er det 1. oktober i Oslo.
    klokka('2026-09-30T22:30:00Z');
    tegn('nb', MIDT);
    expect(pille().textContent).toContain('Fortsatt i gang');
  });

  it('de andre trinnene og fargen er de samme i november som i august', () => {
    for (const iso of ['2026-08-15T10:00:00Z', '2026-11-17T10:00:00Z']) {
      klokka(iso);
      for (const [score, ventet] of [
        [45, nb.HotspotPanel.conditionPoor],
        [65, nb.HotspotPanel.conditionGood],
        [80, nb.HotspotPanel.conditionExcellent]
      ] as const) {
        tegn('nb', score);
        expect(pille().textContent, `${iso}, score ${score}`).toContain(ventet);
        cleanup();
      }
      // Det midterste trinnet er gult hele året — bare ordene skifter.
      tegn('nb', MIDT);
      expect(pille().querySelector('.bg-amber-400'), iso).not.toBeNull();
      cleanup();
      vi.useRealTimers();
    }
  });

  it('svensk er svensk, og ordet lover ingenting', () => {
    expect(sv.HotspotPanel.conditionModerateLate).not.toMatch(/[æøÆØ]/);
    expect(sv.HotspotPanel.conditionModerateLate).not.toBe(nb.HotspotPanel.conditionModerateLate);
    for (const tekst of [nb.HotspotPanel.conditionModerateLate, sv.HotspotPanel.conditionModerateLate]) {
      expect(tekst).not.toContain('🍄');
      expect(tekst).not.toMatch(/finner du|hittar du|garanter/i);
    }
  });
});
