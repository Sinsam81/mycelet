import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _createTestLogger } from '@/lib/log';

/**
 * Feilsvarene fra API-rutene.
 *
 * To ting voktes her. Språket: en svensk bruker som ikke fikk slettet kontoen
 * sin, fikk forklaringen på norsk, fordi teksten var hardkodet i ruta. Og
 * lekkasjen: tre ruter svarte med databasens egen feilmelding, og loggen — som
 * skulle hatt den — fikk «[object Object]».
 */

const sprak = vi.hoisted(() => ({ les: vi.fn<() => Promise<string>>() }));
vi.mock('@/i18n/locale', () => ({ getUserLocale: () => sprak.les() }));

const { API_FEILKODER, apiFeil, apiFeilTekst, apiSprak, loggFeil } = await import('../feil');

beforeEach(() => {
  sprak.les.mockReset();
  sprak.les.mockResolvedValue('nb');
});

describe('tekstene', () => {
  it('finnes på begge språk for hver eneste kode', () => {
    expect(API_FEILKODER.length).toBeGreaterThan(20);
    for (const kode of API_FEILKODER) {
      expect(apiFeilTekst(kode, 'nb').trim().length, `${kode} mangler norsk`).toBeGreaterThan(3);
      expect(apiFeilTekst(kode, 'sv').trim().length, `${kode} mangler svensk`).toBeGreaterThan(3);
    }
  });

  it('svensken er svensk — ikke den norske teksten en gang til', () => {
    for (const kode of API_FEILKODER) {
      const nb = apiFeilTekst(kode, 'nb');
      const sv = apiFeilTekst(kode, 'sv');
      expect(sv, `${kode}: sv er en kopi av nb`).not.toBe(nb);
      // Bokstavene avslører en halvveis oversettelse: svensk skriver ö og ä,
      // norsk ø og æ. (E-postadressene i tekstene har ingen av dem.)
      expect(sv, `${kode}: norske bokstaver i den svenske teksten`).not.toMatch(/[øæØÆ]/);
      expect(nb, `${kode}: svenske bokstaver i den norske teksten`).not.toMatch(/[öäÖÄ]/);
      expect(sv, `${kode}: norske ord i den svenske teksten`).not.toMatch(/\b(ikke|kunne|igjen|prøv|slette|hente)\b/i);
    }
  });

  it('sier ingenting om hvordan serveren er bygget', () => {
    for (const kode of API_FEILKODER) {
      for (const locale of ['nb', 'sv'] as const) {
        // «schema cache», ikke «schema»: «schemalagt» er helt vanlig svensk.
        expect(apiFeilTekst(kode, locale), `${kode} (${locale})`).not.toMatch(
          /SUPABASE|SERVICE_ROLE|_KEY\b|postgres|PGRST|\brelation\b|schema cache|constraint|\bRLS\b/i
        );
      }
    }
  });

  it('en setning slutter med punktum — de vises etter hverandre i samme felt', () => {
    // Slettedialogen og prissiden setter `error` og `details` sammen.
    for (const kode of API_FEILKODER) {
      for (const locale of ['nb', 'sv'] as const) {
        expect(apiFeilTekst(kode, locale), `${kode} (${locale})`).toMatch(/\.$/);
      }
    }
  });

  it('faller tilbake på norsk for et språk tabellen ikke kjenner', () => {
    expect(apiFeilTekst('unauthenticated', 'fi' as never)).toBe(apiFeilTekst('unauthenticated', 'nb'));
  });

  it('kontoslettingen sier hva tilstanden er, på begge språk', () => {
    // Dialogen viser `details` før `error`. Det brukeren MÅ få vite er at
    // kontoen står og at det er trygt å prøve igjen.
    expect(apiFeilTekst('delete_retry_safe', 'nb')).toMatch(/IKKE slettet/);
    expect(apiFeilTekst('delete_retry_safe', 'nb')).toMatch(/trygt å gjenta/);
    expect(apiFeilTekst('delete_retry_safe', 'sv')).toMatch(/INTE raderat/);
    expect(apiFeilTekst('delete_retry_safe', 'sv')).toMatch(/Försök igen/);
    expect(apiFeilTekst('delete_unavailable_details', 'nb')).toMatch(/IKKE slettet, og ingenting er fjernet/);
    expect(apiFeilTekst('delete_unavailable_details', 'sv')).toMatch(/raderades INTE, och inget har tagits bort/);
  });

  it('dataeksporten sier at fila ikke er ufullstendig, og hvor man henvender seg', () => {
    for (const kode of ['export_server_error_details', 'export_dataset_failed_details'] as const) {
      expect(apiFeilTekst(kode, 'nb')).toMatch(/IKKE fått en ufullstendig fil/);
      expect(apiFeilTekst(kode, 'sv')).toMatch(/INTE fått en ofullständig fil/);
      expect(apiFeilTekst(kode, 'nb')).toContain('privacy@mycelet.com');
      expect(apiFeilTekst(kode, 'sv')).toContain('privacy@mycelet.com');
    }
  });
});

describe('apiSprak', () => {
  it('gir leserens språk', async () => {
    sprak.les.mockResolvedValue('sv');
    await expect(apiSprak()).resolves.toBe('sv');
  });

  it('kaster aldri — utenfor en forespørsel blir det norsk', async () => {
    sprak.les.mockRejectedValue(new Error('`cookies` was called outside a request scope'));
    await expect(apiSprak()).resolves.toBe('nb');
  });
});

describe('apiFeil', () => {
  it('svarer { error, code } med statusen den fikk', async () => {
    const res = await apiFeil('unauthenticated', 401);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Du må være logget inn.', code: 'unauthenticated' });
  });

  it('en svensk leser får svensk tekst og samme kode', async () => {
    sprak.les.mockResolvedValue('sv');
    const res = await apiFeil('feedback_save_failed', 500);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Kunde inte spara din feedback.', code: 'feedback_save_failed' });
  });

  it('et feilsvar blir aldri en 500 fordi språket ikke lot seg lese', async () => {
    sprak.les.mockRejectedValue(new Error('utenfor forespørsel'));
    const res = await apiFeil('search_too_long', 400);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Søketeksten er for lang.');
  });

  it('bruker språket ruta alt har slått opp, uten et nytt oppslag', async () => {
    const res = await apiFeil('regions_unavailable', 500, { locale: 'sv' });
    expect((await res.json()).error).toBe('Kunde inte hämta svampförhållandena.');
    expect(sprak.les).not.toHaveBeenCalled();
  });

  it('legger den utdypende teksten i details, på samme språk', async () => {
    sprak.les.mockResolvedValue('sv');
    const body = await (await apiFeil('delete_images_failed', 500, { detaljer: 'delete_retry_safe' })).json();
    expect(body).toEqual({
      error: 'Kunde inte ta bort dina bilder.',
      code: 'delete_images_failed',
      details: apiFeilTekst('delete_retry_safe', 'sv')
    });
  });

  it('hint følger med uendret — utviklertekst, ikke oversatt', async () => {
    const body = await (await apiFeil('invalid_request', 400, { hint: 'Mangler userId' })).json();
    expect(body).toEqual({ error: 'Ugyldig forespørsel.', code: 'invalid_request', hint: 'Mangler userId' });
  });

  it('uten details og hint står de ikke i svaret', async () => {
    const body = await (await apiFeil('unexpected', 500)).json();
    expect(Object.keys(body).sort()).toEqual(['code', 'error']);
  });
});

describe('loggFeil', () => {
  function fanger() {
    const linjer: string[] = [];
    const log = _createTestLogger({ level: 'error', writer: { write: (l) => linjer.push(l) } });
    return { log, linjer };
  }

  it('en databasefeil havner i loggen med kode og melding — ikke som «[object Object]»', () => {
    // Supabase-klienten returnerer feil som rene objekter. log.error(hendelse,
    // feil) skrev dem som teksten «[object Object]».
    const { log, linjer } = fanger();
    loggFeil(log, 'spot_feedback.insert_failed', {
      code: 'PGRST205',
      message: "Could not find the table 'public.spot_feedback' in the schema cache",
      details: null,
      hint: 'Perhaps you meant the table public.findings'
    });
    expect(linjer).toHaveLength(1);
    expect(linjer[0]).toContain('spot_feedback.insert_failed');
    expect(linjer[0]).toContain('PGRST205');
    expect(linjer[0]).toContain('Could not find the table');
    expect(linjer[0]).toContain('Perhaps you meant');
    expect(linjer[0]).not.toContain('[object Object]');
  });

  it('en ekte Error går som før, med navnet og meldingen sin', () => {
    const { log, linjer } = fanger();
    loggFeil(log, 'account.self_delete.failed', new TypeError('fetch failed'));
    expect(linjer[0]).toContain('TypeError');
    expect(linjer[0]).toContain('fetch failed');
  });

  it('konteksten følger med, og vinner over feltene i feilen', () => {
    const error = vi.fn();
    loggFeil({ error }, 'gpx.findings_query_failed', { code: '57014', message: 'timeout' }, { fra: 1000, code: 'egen' });
    expect(error).toHaveBeenCalledWith('gpx.findings_query_failed', undefined, {
      code: 'egen',
      message: 'timeout',
      fra: 1000
    });
  });

  it('en tekst blir meldingen, og ingenting blir ingenting — men hendelsen logges', () => {
    const error = vi.fn();
    loggFeil({ error }, 'a', 'bare en streng');
    loggFeil({ error }, 'b', undefined);
    loggFeil({ error }, 'c', null);
    expect(error.mock.calls).toEqual([
      ['a', undefined, { message: 'bare en streng' }],
      ['b', undefined, {}],
      ['c', undefined, {}]
    ]);
  });

  it('tar bare med feltene vi kjenner — ikke hva som helst som ligger i objektet', () => {
    const error = vi.fn();
    loggFeil({ error }, 'x', { code: '23505', message: 'duplicate', rad: { epost: 'noen@example.com' }, status: 409 });
    expect(error).toHaveBeenCalledWith('x', undefined, { code: '23505', message: 'duplicate', status: 409 });
  });
});
