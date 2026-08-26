// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { lagStedPopup } from '../stedMarker';

const sted = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Kantarellskogen',
  note: 'Bak den store steinen',
  latitude: 59.911491,
  longitude: 10.757933
};

describe('lagStedPopup', () => {
  it('viser navn, notat og koordinat', () => {
    const popup = lagStedPopup(sted, { funnHer: 'Jeg fant sopp her' }, { påFunnHer: () => {} });
    expect(popup.textContent).toContain('Kantarellskogen');
    expect(popup.textContent).toContain('Bak den store steinen');
    expect(popup.textContent).toContain('59.91149, 10.75793');
  });

  /**
   * Navnet kommer fra en fil brukeren har fått fra en annen app — altså fra en
   * kilde vi ikke kontrollerer. Popupen bygges derfor som DOM med textContent,
   * ikke som en HTML-streng: da finnes det ingen escaping å glemme.
   */
  it('tolker aldri et stedsnavn som markup', () => {
    const popup = lagStedPopup(
      { ...sted, name: '<img src=x onerror="alert(1)">', note: '<script>alert(2)</script>' },
      { funnHer: 'Jeg fant sopp her' },
      { påFunnHer: () => {} }
    );

    expect(popup.querySelector('img')).toBeNull();
    expect(popup.querySelector('script')).toBeNull();
    expect(popup.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it('hopper over notatlinja når stedet ikke har notat', () => {
    const popup = lagStedPopup({ ...sted, note: null }, { funnHer: 'Jeg fant sopp her' }, { påFunnHer: () => {} });
    expect(popup.querySelectorAll('p')).toHaveLength(2);
  });

  it('kaller «jeg fant sopp her» når knappen trykkes', () => {
    const påFunnHer = vi.fn();
    const popup = lagStedPopup(sted, { funnHer: 'Jeg fant sopp her' }, { påFunnHer });
    popup.querySelector('button')!.click();
    expect(påFunnHer).toHaveBeenCalledOnce();
  });
});
