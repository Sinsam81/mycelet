import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/nextjs';
import { erDomFeilFraOversettelse, erOversattAvNettleser } from '../oversettelse';

function dok(klasser: string[], lang = 'nb', harMsHash = false) {
  return {
    documentElement: { classList: { contains: (n: string) => klasser.includes(n) }, lang },
    querySelector: (s: string) => (harMsHash && s.includes('_msttexthash') ? {} : null)
  };
}

// Strengen er kopiert fra Sentry MYCELET-4, ikke diktet opp.
const INSERT_BEFORE: ErrorEvent = {
  type: undefined,
  exception: {
    values: [
      {
        type: 'NotFoundError',
        value: "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node."
      }
    ]
  }
} as ErrorEvent;

describe('erOversattAvNettleser', () => {
  it('urørt norsk eller svensk side gir null', () => {
    expect(erOversattAvNettleser(dok([], 'nb'))).toBeNull();
    expect(erOversattAvNettleser(dok([], 'sv-SE'))).toBeNull();
    expect(erOversattAvNettleser(null)).toBeNull();
  });

  it('kjenner igjen Chrome/Google Translate på html-klassen', () => {
    expect(erOversattAvNettleser(dok(['translated-ltr'], 'ru'))).toBe('chrome');
    expect(erOversattAvNettleser(dok(['translated-rtl'], 'ar'))).toBe('chrome');
  });

  it('kjenner igjen Edge/Bing på node-merkene', () => {
    expect(erOversattAvNettleser(dok([], 'nb', true))).toBe('edge');
  });

  it('annet målspråk i <html lang> uten kjent merke regnes som oversatt av en annen', () => {
    expect(erOversattAvNettleser(dok([], 'ru'))).toBe('annen');
    expect(erOversattAvNettleser(dok([], 'en-US'))).toBe('annen');
  });
});

describe('erDomFeilFraOversettelse', () => {
  it('treffer insertBefore-feilen fra MYCELET-4', () => {
    expect(erDomFeilFraOversettelse(INSERT_BEFORE)).toBe(true);
  });

  it('treffer removeChild-varianten, som er den andre oversettelse gir', () => {
    const e = { exception: { values: [{ type: 'NotFoundError', value: "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node." }] } } as ErrorEvent;
    expect(erDomFeilFraOversettelse(e)).toBe(true);
  });

  it('rører ikke andre feil, heller ikke andre DOMException-er', () => {
    expect(erDomFeilFraOversettelse({ exception: { values: [{ type: 'TypeError', value: "Cannot read properties of undefined (reading 'insertBefore')" }] } } as ErrorEvent)).toBe(false);
    expect(erDomFeilFraOversettelse({ exception: { values: [{ type: 'QuotaExceededError', value: 'The quota has been exceeded.' }] } } as ErrorEvent)).toBe(false);
    expect(erDomFeilFraOversettelse({} as ErrorEvent)).toBe(false);
  });
});
