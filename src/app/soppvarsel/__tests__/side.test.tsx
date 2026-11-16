// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { COPY } from '../tekst';

/**
 * Områdevalget på /soppvarsel startet på et tomt, deaktivert valg uten tekst,
 * så feltet så blankt ut — som om noe manglet eller ikke hadde lastet. Nå står
 * det en ledetekst der. Feltet skal fortsatt ikke kunne sendes uten et område
 * (det tomme valget er nettleserens «placeholder label option» i et påkrevd
 * felt), og et område som er forhåndsvalgt fra en områdeside (?region=…) skal
 * fortsatt stå valgt.
 *
 * Skjemaet på områdesidene (VarselCta) har området som skjult felt og ingen
 * nedtrekksliste — der er det ingenting å vise.
 */

let sprak: 'nb' | 'sv' = 'nb';
vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => sprak }));
vi.mock('@/components/layout/PageWrapper', () => ({
  PageWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

const { default: SoppvarselSide } = await import('../page');

/** Siden slik nettleseren får den, lagt i et ekte DOM så skjemavalideringen kan prøves. */
async function side(searchParams: { status?: string; region?: string } = {}) {
  document.body.innerHTML = renderToStaticMarkup(await SoppvarselSide({ searchParams: Promise.resolve(searchParams) }));
  const select = document.querySelector<HTMLSelectElement>('select[name="region"]');
  if (!select) throw new Error('fant ikke områdevalget');
  return { select, forste: select.options[0] };
}

beforeEach(() => {
  sprak = 'nb';
});

describe('/soppvarsel — områdevalget', () => {
  it('viser «Velg område …» når ingenting er valgt — ikke et tomt felt', async () => {
    const { select, forste } = await side();
    expect(forste.textContent).toBe('Velg område …');
    expect(forste.textContent).toBe(COPY.nb.velgOmrade);
    expect(select.selectedIndex).toBe(0);
    expect(select.selectedOptions[0].textContent).toBe('Velg område …');
  });

  it('på svensk: «Välj område …»', async () => {
    sprak = 'sv';
    const { forste } = await side();
    expect(forste.textContent).toBe('Välj område …');
    expect(COPY.sv.velgOmrade).not.toMatch(/[æøÆØ]/);
  });

  it('ledeteksten kan ikke velges og kan ikke sendes: feltet er påkrevd og mangler verdi', async () => {
    const { select, forste } = await side();
    expect(forste.value).toBe('');
    expect(forste.disabled).toBe(true);
    // Nettleserens regel for «placeholder label option»: første valg, tom
    // verdi, direkte under <select> — ikke inne i en <optgroup>.
    expect(forste.parentElement).toBe(select);
    expect(select.required).toBe(true);
    expect(select.validity.valueMissing).toBe(true);
    expect(select.checkValidity()).toBe(false);
  });

  it('et forhåndsvalgt område står valgt, og feltet er gyldig', async () => {
    const { select, forste } = await side({ region: 'Oslo' });
    expect(select.value).toBe('Oslo');
    expect(select.validity.valueMissing).toBe(false);
    // Ledeteksten står der fortsatt, men er ikke valgt.
    expect(forste.textContent).toBe('Velg område …');
    expect(forste.selected).toBe(false);
  });

  it('et ukjent område i adressen gir ledeteksten, som før gav det tomme valget', async () => {
    const { select } = await side({ region: 'Atlantis' });
    expect(select.selectedIndex).toBe(0);
    expect(select.validity.valueMissing).toBe(true);
  });

  it('alle områdene står fortsatt i lista, gruppert per land', async () => {
    const { select } = await side();
    const grupper = [...select.querySelectorAll('optgroup')].map((g) => g.label);
    expect(grupper).toEqual(['Norge', 'Sverige']);
    expect(select.querySelectorAll('optgroup option').length).toBeGreaterThan(10);
  });
});
