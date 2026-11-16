// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { byggSesongkurve, sesongkurveVisning, type SesongkurveTekster } from '@/lib/species/sesongkurve';
import { monthMask } from '@/lib/utils/season-region';
import { SesongKurve } from '../SesongKurve';

/**
 * Tegningen av sesongkurven. Tallene og tekstene har egne tester
 * (src/lib/species/__tests__/sesongkurve.test.ts); her låses det komponenten
 * selv står for: at figuren er ett bilde med toppen i navnet, at den ikke har
 * tall på y-aksen, og at «i dag» bare finnes når datoen er i det målte vinduet.
 */

afterEach(cleanup);

const MANEDER = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

const TEKSTER: SesongkurveTekster = {
  ariaLabel:
    'Kantarell: registrerte funn uke for uke, fra april til november. Flest registrerte funn fra slutten av august til slutten av september.',
  topp: 'Flest registrerte funn fra slutten av august til slutten av september.',
  bildetekst: 'Kurven viser når arten er registrert. Ikke hvor mye som finnes, og ikke hvor.',
  iDag: 'i dag'
};

/** En trekant rundt uke 36, tegnet over april–november. */
function visning(osloDato: string) {
  const uker = Array.from({ length: 52 }, (_, uke) => Math.max(0, Math.round((1 - Math.abs(uke - 36) * 0.1) * 10) / 10));
  const kurve = byggSesongkurve(uker, { forsteDag: 91, sisteDag: 334 }, monthMask(6, 10));
  if (!kurve) throw new Error('ventet en kurve');
  return sesongkurveVisning(kurve, osloDato);
}

function rendrer(osloDato: string) {
  return render(<SesongKurve visning={visning(osloDato)} manedsnavn={MANEDER} tekster={TEKSTER} />);
}

describe('SesongKurve', () => {
  it('er ett bilde for en skjermleser, med toppen i navnet', () => {
    rendrer('2026-09-13');
    const bilde = screen.getByRole('img');
    expect(bilde.getAttribute('aria-label')).toBe(TEKSTER.ariaLabel);
    // Setningen står synlig INNE i bildet, så den ikke leses opp to ganger.
    expect(bilde.textContent).toContain(TEKSTER.topp);
    expect(bilde.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('har bildeteksten som sier hva kurven ikke viser', () => {
    const { container } = rendrer('2026-09-13');
    expect(container.querySelector('figure > figcaption')?.textContent).toBe(TEKSTER.bildetekst);
  });

  it('skriver månedene under kurven, ikke hele året', () => {
    rendrer('2026-09-13');
    for (const maaned of ['apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov']) {
      expect(screen.getByText(maaned), maaned).toBeTruthy();
    }
    // Desember–mars er ikke målt og står ikke på aksen.
    for (const maaned of ['jan', 'feb', 'mar', 'des']) {
      expect(screen.queryByText(maaned), maaned).toBeNull();
    }
  });

  it('har ingen tall på y-aksen og ingen tekst inne i svg-en', () => {
    const { container } = rendrer('2026-09-13');
    expect(container.querySelector('svg text')).toBeNull();
    // Verdiene er normalisert til toppuka = 1: et tall ville sett ut som en mengde.
    const bilde = screen.getByRole('img');
    expect(bilde.textContent?.replace(TEKSTER.topp, '')).not.toMatch(/\d/);
  });

  it('tegner flaten, toppfeltet og linja', () => {
    const { container } = rendrer('2026-09-13');
    const stier = [...container.querySelectorAll('svg path')];
    expect(stier).toHaveLength(3);
    // Flaten går fra kant til kant og lukker seg mot grunnlinja.
    const flate = stier[0].getAttribute('d') ?? '';
    expect(flate.startsWith('M0,100 ')).toBe(true);
    expect(flate.endsWith('L1000,100 Z')).toBe(true);
    // Toppuka (verdi 1) tegnes 8 enheter under overkanten, aldri i den.
    expect(stier[2].getAttribute('d')).toContain(',8 ');
    for (const sti of stier) expect(sti.getAttribute('d')).not.toMatch(/NaN|undefined/);
  });

  it('viser «i dag» med strek når datoen er i det målte vinduet', () => {
    const { container } = rendrer('2026-09-13');
    expect(screen.getByText('i dag')).toBeTruthy();
    // Sju månedsskiller (mai–november) pluss streken for i dag.
    expect(container.querySelectorAll('svg line')).toHaveLength(8);
  });

  it('viser verken «i dag» eller strek i desember–mars', () => {
    for (const dato of ['2026-12-24', '2026-01-15', '2026-03-31']) {
      const { container, unmount } = rendrer(dato);
      expect(screen.queryByText('i dag'), dato).toBeNull();
      expect(container.querySelectorAll('svg line'), dato).toHaveLength(7);
      unmount();
    }
  });

  it('holder «i dag»-etiketten inne i figuren helt i kantene', () => {
    // 2. april: nesten helt til venstre. Midtstilt ville den stukket ut.
    const tidlig = rendrer('2026-04-02');
    const venstre = screen.getByText('i dag');
    expect(venstre.className).not.toContain('-translate-x-1/2');
    expect(venstre.style.left).not.toBe('');
    tidlig.unmount();

    rendrer('2026-11-29');
    const hoyre = screen.getByText('i dag');
    expect(hoyre.className).not.toContain('-translate-x-1/2');
    expect(hoyre.style.right).not.toBe('');
    expect(hoyre.style.left).toBe('');
  });

  it('rendrer ingenting uten punkter å tegne', () => {
    const tom = { punkter: [], topp: [], maneder: [], iDag: null };
    const { container } = render(<SesongKurve visning={tom} manedsnavn={MANEDER} tekster={TEKSTER} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('SesongKurve.tsx som kilde', () => {
  // Under jsdom er import.meta.url ikke en fil-URL, så stien bygges fra roten
  // vitest kjøres i (samme grep som tailwind-farger.test.ts).
  const kilde = readFileSync(join(process.cwd(), 'src/components/species/SesongKurve.tsx'), 'utf8');

  it('er ikke en klientkomponent', () => {
    expect(kilde).not.toMatch(/^\s*['"]use client['"]/m);
    expect(kilde).not.toMatch(/\buse(State|Effect|Translations|Locale)\(/);
  });

  it('importerer bare typer fra datamodulen — kurvene skal aldri til nettleseren', () => {
    const importer: string[] = kilde.match(/^import .*$/gm) ?? [];
    expect(importer).toHaveLength(1);
    expect(importer[0]?.startsWith('import type ')).toBe(true);
    expect(importer[0]).toContain("from '@/lib/species/sesongkurve'");
  });
});
