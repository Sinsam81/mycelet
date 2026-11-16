import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Feilsvarene til /api/findings-rutene: tekst på leserens språk, og en stabil
 * kode klienten kan forgrene på. Rutetestene dekker hvilke svar som gis når;
 * denne dekker formen på dem — og at et språkoppslag som feiler, aldri gjør en
 * 404 om til en 500.
 */

const { tilstand } = vi.hoisted(() => ({ tilstand: { sprak: 'nb' as 'nb' | 'sv', kaster: false } }));

vi.mock('@/i18n/locale', () => ({
  getUserLocale: async () => {
    if (tilstand.kaster) throw new Error('cookies() utenfor en forespørsel');
    return tilstand.sprak;
  }
}));

const { delingKaranteneSvar, funnFeilSvar, migrasjonManglerSvar } = await import('../svar');

beforeEach(() => {
  tilstand.sprak = 'nb';
  tilstand.kaster = false;
});

describe('funnFeilSvar', () => {
  it('svarer med tekst på leserens språk og samme kode på begge', async () => {
    const nb = await funnFeilSvar('not_found', 404);
    expect(nb.status).toBe(404);
    expect(await nb.json()).toEqual({ error: 'Fant ikke funnet', code: 'not_found' });

    tilstand.sprak = 'sv';
    const sv = await funnFeilSvar('not_found', 404);
    expect(await sv.json()).toEqual({ error: 'Hittade inte fyndet', code: 'not_found' });
  });

  it('tar med feltet feilen gjelder, når ruta oppgir det', async () => {
    const res = await funnFeilSvar('position_not_editable', 400, { field: 'latitude' });
    expect(await res.json()).toMatchObject({ code: 'position_not_editable', field: 'latitude' });
  });

  it('faller tilbake på norsk når språket ikke lar seg slå opp — statusen står', async () => {
    tilstand.kaster = true;
    const res = await funnFeilSvar('not_found', 404);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Fant ikke funnet');
  });
});

describe('migrasjonManglerSvar', () => {
  it('sier hva som IKKE skjedde, i `details`, og beholder formen kartet leser', async () => {
    const res = await migrasjonManglerSvar('delete_migration_missing');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('feature_not_enabled');
    expect(body.error).toBe('Funksjonen er ikke slått på ennå');
    expect(body.details).toContain('IKKE slettet');
  });

  it('skriver begge tekstene på svensk for en svensk leser', async () => {
    tilstand.sprak = 'sv';
    const body = await (await migrasjonManglerSvar('update_migration_missing')).json();
    expect(body.error).toBe('Funktionen är inte aktiverad ännu');
    expect(body.details).toContain('INTE ändrats');
  });
});

describe('delingKaranteneSvar', () => {
  // 10. november 2026 kl. 12:00 UTC.
  const NAA = Date.parse('2026-11-10T12:00:00.000Z');
  const TIME = 60 * 60 * 1000;

  it('svarer 429 med tidspunktet som tekst, som ISO og som Retry-After', async () => {
    const res = await delingKaranteneSvar(NAA + 22 * TIME, NAA);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe(String(22 * 60 * 60));

    const body = await res.json();
    expect(body.code).toBe('sharing_cooldown');
    expect(body.availableAt).toBe('2026-11-11T10:00:00.000Z');
    expect(body.retryAfterSeconds).toBe(22 * 60 * 60);
    // Norsk tid (UTC+1 i november), ikke serverens UTC.
    expect(body.error).toContain('11. november');
    expect(body.error).toContain('11:00');
  });

  it('ber aldri klienten prøve igjen om null sekunder', async () => {
    const res = await delingKaranteneSvar(NAA + 200, NAA);
    expect(res.headers.get('Retry-After')).toBe('1');
    expect((await delingKaranteneSvar(NAA - 5_000, NAA)).headers.get('Retry-After')).toBe('1');
  });
});
