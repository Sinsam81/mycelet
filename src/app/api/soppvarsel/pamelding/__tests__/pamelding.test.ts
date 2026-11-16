import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Dobbel opt-in er garantien migrasjon 057 er bygget på: ingen e-post før
 * den nyeste bekreftelseslenka er klikket. To hull i påmeldingsruta brøt
 * den, begge funnet i den eksterne gjennomgangen 2026-09-05:
 *   · reaktivering av en avmeldt rad beholdt gammel confirmed_at → cron så
 *     raden som bekreftet med én gang
 *   · oppslaget brukte ilike med brukerinput → «%@%.%%» traff andres rader
 * Testene her låser begge.
 *
 * Og ruta skal ikke kunne brukes til å sende e-post i strøm til noen som aldri
 * ba om det: taket per ADRESSE (tre lag — minne, rad, på tvers av områder) er
 * testet nederst, sammen med at et stoppet kall svarer nøyaktig som et
 * vellykket.
 *
 * Laget i minnet teller e-poster som GIKK UT, ikke forsøk. Det telte forsøk,
 * og da ble det fjerde forsøket etter tre «noe gikk galt» svart «sjekk
 * innboksen» uten at noe var sendt — se siste blokk.
 */

type Filter = [string, string, unknown];
interface Kall {
  op: 'select' | 'update' | 'insert' | 'delete';
  payload?: Record<string, unknown>;
  valg?: Record<string, unknown>;
  filtre: Filter[];
}

/** Raden oppslaget finner for (adresse, område) — null = finnes ikke. */
let eksisterende: Record<string, unknown> | null = null;
/** Svaret på tellingen av ubekreftede rader på adressen den siste timen. */
let ventende = 0;
let tellFeil: { message: string } | null = null;
let sendingOk = true;
let kall: Kall[] = [];
let sendteEposter: Array<{ til: string; tekst: string }> = [];
/** true = den ekte begrenseren i minnet; false = «en annen instans», alt slipper gjennom. */
let ekteTak = false;
let klient = 'ip:1';
let takNokler: string[] = [];
/** Nøklene det er gitt tilbake en plass for (refundRateLimit). */
let tilbakegitt: string[] = [];
/** true = databaseklienten kaster ved første bruk (som når miljøet mangler) — da kaster ruta. */
let dbKaster = false;

const sisteAv = (op: Kall['op']) => [...kall].reverse().find((k) => k.op === op) ?? null;

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/rate-limit', async () => {
  const ekte = await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit');
  return {
    ...ekte,
    checkRateLimit: (nokkel: string, grense: number, vindu: number) => {
      takNokler.push(nokkel);
      return ekteTak ? ekte.checkRateLimit(nokkel, grense, vindu) : { allowed: true };
    },
    refundRateLimit: (nokkel: string, tatt: Parameters<typeof ekte.refundRateLimit>[1]) => {
      tilbakegitt.push(nokkel);
      ekte.refundRateLimit(nokkel, tatt);
    }
  };
});
vi.mock('@/lib/rate-limit/route', () => ({
  getClientKey: () => klient,
  rateLimitResponse: async () => new Response(null, { status: 429 })
}));
vi.mock('@/lib/email/send', () => ({
  sendEpost: async (args: { til: string; tekst: string }) => {
    sendteEposter.push(args);
    return sendingOk ? { ok: true, detalj: 'sendt' } : { ok: false, detalj: 'Resend 500' };
  }
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      if (dbKaster) throw new Error('databaseklienten kaster');
      // Kjedbar OG ventbar, som supabase-byggeren. Bevisst UTEN ilike: kaller
      // ruta den igjen, smeller testen.
      const bygger = (k: Kall) => {
        kall.push(k);
        const b: Record<string, unknown> = {
          is: (kol: string, v: unknown) => (k.filtre.push(['is', kol, v]), b),
          eq: (kol: string, v: unknown) => (k.filtre.push(['eq', kol, v]), b),
          gte: (kol: string, v: unknown) => (k.filtre.push(['gte', kol, v]), b),
          select: () => b,
          maybeSingle: async () => ({ data: eksisterende, error: null }),
          single: async () => ({ data: { id: 'ny-rad', confirm_token: 'ny-rad-token' }, error: null }),
          then: (ok: (v: unknown) => unknown, feil?: (e: unknown) => unknown) =>
            Promise.resolve(k.op === 'select' ? { count: ventende, error: tellFeil } : { error: null }).then(ok, feil)
        };
        return b;
      };
      return {
        select: (_kol: string, valg?: Record<string, unknown>) => bygger({ op: 'select', valg, filtre: [] }),
        update: (payload: Record<string, unknown>) => bygger({ op: 'update', payload, filtre: [] }),
        insert: (payload: Record<string, unknown>) => bygger({ op: 'insert', payload, filtre: [] }),
        delete: () => bygger({ op: 'delete', filtre: [] })
      };
    }
  })
}));

import { POST, maxDuration } from '../route';
import { _resetAllBuckets } from '@/lib/rate-limit';

const NAA = '2026-09-25T10:00:00.000Z';
const minutterSiden = (n: number) => new Date(Date.parse(NAA) - n * 60_000).toISOString();

function post(body: Record<string, unknown>, cookie?: string) {
  return POST(
    new NextRequest('http://localhost/api/soppvarsel/pamelding', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    })
  );
}

function postSkjema(felter: Record<string, string>) {
  return POST(
    new NextRequest('http://localhost/api/soppvarsel/pamelding', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(felter).toString()
    })
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NAA));
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.mycelet.com';
  eksisterende = null;
  ventende = 0;
  tellFeil = null;
  sendingOk = true;
  kall = [];
  sendteEposter = [];
  ekteTak = false;
  klient = 'ip:1';
  takNokler = [];
  tilbakegitt = [];
  dbKaster = false;
  _resetAllBuckets();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('påmelding — dobbel opt-in holder', () => {
  it('avmeldt + bekreftet rad reaktiveres som NYTT samtykke: confirmed_at nullstilles og tokenet roteres', async () => {
    eksisterende = { id: 'rad-1', confirmed_at: '2026-08-01T00:00:00Z', active: false };
    const res = await post({ email: 'noen@example.com', region: 'Oslo' });
    expect((await res.json()).status).toBe('sendt');
    const oppdatert = sisteAv('update')?.payload;
    expect(oppdatert).toMatchObject({ active: true, confirmed_at: null });
    expect(typeof oppdatert?.confirm_token).toBe('string');
    expect(oppdatert?.confirm_token).toMatch(/^[0-9a-f-]{36}$/);
    // Bekreftelses-e-posten bærer det NYE tokenet, ikke et gammelt.
    expect(sendteEposter).toHaveLength(1);
    expect(sendteEposter[0].tekst).toContain(String(oppdatert?.confirm_token));
  });

  it('aktiv + bekreftet rad: stille suksess, ingen e-post, ingen endring', async () => {
    eksisterende = { id: 'rad-1', confirmed_at: '2026-08-01T00:00:00Z', active: true };
    const res = await post({ email: 'noen@example.com', region: 'Oslo' });
    expect((await res.json()).status).toBe('sendt');
    expect(kall.filter((k) => k.op !== 'select')).toEqual([]);
    expect(sendteEposter).toHaveLength(0);
  });

  it('slår opp med eq på lowercase — aldri ilike med brukerinput', async () => {
    await post({ email: 'Noen@Example.com', region: 'Oslo' });
    const filtre = kall.flatMap((k) => k.filtre);
    expect(filtre).toContainEqual(['eq', 'email', 'noen@example.com']);
    expect(filtre.find(([op]) => op === 'ilike')).toBeUndefined();
    expect(sisteAv('insert')?.payload).toMatchObject({ email: 'noen@example.com' });
  });

  it('jokertegn i adressen er harmløse: eq matcher bare den bokstavelige strengen', async () => {
    // «%@%.%%» passerer det løse e-postmønsteret med vilje (ekte adresser er
    // rare). Med ilike traff den alle rader i regionen; med eq finnes ingen rad
    // med den bokstavelige adressen, så det blir en ny, ufarlig rad.
    eksisterende = null;
    const res = await post({ email: '%@%.%%', region: 'Oslo' });
    expect((await res.json()).status).toBe('sendt');
    expect(kall.flatMap((k) => k.filtre)).toContainEqual(['eq', 'email', '%@%.%%']);
  });

  it('lagrer hvor påmeldingen kom fra — samme cookie som kontoregistreringen', async () => {
    await post({ email: 'ny@example.com', region: 'Bergen' }, 'mycelet_kilde=bergen-snf/host-2026');
    expect(sisteAv('insert')?.payload).toMatchObject({ kilde: 'bergen-snf/host-2026', region: 'Bergen' });
  });

  it('uten cookie er kilden null — «ukjent», ikke gjettet', async () => {
    await post({ email: 'ny@example.com', region: 'Bergen' });
    expect(sisteAv('insert')?.payload).toMatchObject({ kilde: null });
  });

  it('reaktivering beholder første kilde, fyller bare inn når den mangler', async () => {
    eksisterende = { id: 'rad-1', confirmed_at: null, active: false, kilde: 'sok:google.no' };
    await post({ email: 'noen@example.com', region: 'Oslo' }, 'mycelet_kilde=partner-x');
    expect(sisteAv('update')?.payload).not.toHaveProperty('kilde');
    eksisterende = { id: 'rad-2', confirmed_at: null, active: false, kilde: null };
    await post({ email: 'noen@example.com', region: 'Oslo' }, 'mycelet_kilde=partner-x');
    expect(sisteAv('update')?.payload).toMatchObject({ kilde: 'partner-x' });
  });

  it('bekreftelseslenka bærer språket, så siden bekreft-ruta selv tegner følger e-posten', async () => {
    await post({ email: 'ny@example.com', region: 'Göteborg', locale: 'sv' });
    expect(sendteEposter[0].tekst).toContain('/api/soppvarsel/bekreft?t=ny-rad-token&sprak=sv');
    await post({ email: 'ny2@example.com', region: 'Oslo', locale: 'en' });
    expect(sendteEposter[1].tekst).toContain('/api/soppvarsel/bekreft?t=ny-rad-token&sprak=nb');
  });
});

describe('påmelding — tak per adresse', () => {
  // Trusselen: et skript som bytter IP (eller rir på instansvifta) sender
  // samme adresse inn igjen og igjen, og vi sender bekreftelse hver gang.

  it('lag 1 (minne): samme adresse fire ganger på en time fra fire IP-er → tre e-poster', async () => {
    ekteTak = true;
    const omrader = ['Oslo', 'Bergen', 'Trondheim', 'Stavanger'];
    const svar: Array<{ ok: boolean; status: string }> = [];
    for (const [i, region] of omrader.entries()) {
      klient = `ip:${i + 1}`;
      const forDetteKallet = kall.length;
      const res = await post({ email: 'Offer@Example.com', region });
      expect(res.status).toBe(200);
      svar.push(await res.json());
      // Det fjerde kallet stoppes FØR databasen: verken oppslag eller skriving.
      if (i === 3) expect(kall.length).toBe(forDetteKallet);
    }
    expect(sendteEposter).toHaveLength(3);
    // Stoppet og sluppet gjennom svarer likt — ellers røper svaret hvor taket går.
    expect(svar).toEqual(Array.from({ length: 4 }, () => ({ ok: true, status: 'sendt' })));
  });

  it('lag 1 teller per adresse, ikke per klient: en annen adresse fra samme IP går gjennom', async () => {
    ekteTak = true;
    for (const region of ['Oslo', 'Bergen', 'Trondheim', 'Stavanger']) await post({ email: 'offer@example.com', region });
    expect(sendteEposter).toHaveLength(3);
    await post({ email: 'en-annen@example.com', region: 'Oslo' });
    expect(sendteEposter).toHaveLength(4);
    // En time senere er vinduet over.
    vi.setSystemTime(new Date(Date.parse(NAA) + 61 * 60_000));
    klient = 'ip:9';
    await post({ email: 'offer@example.com', region: 'Stavanger' });
    expect(sendteEposter).toHaveLength(5);
  });

  it('adressen ligger aldri i klartekst i begrenserens nøkler — bare som hash, lik uansett store og små bokstaver', async () => {
    await post({ email: 'Offer@Example.com', region: 'Oslo' });
    await post({ email: 'offer@example.com', region: 'Bergen' });
    const adressenokler = takNokler.filter((n) => n.startsWith('varselpamelding-epost:'));
    expect(adressenokler).toHaveLength(2);
    expect(adressenokler[0]).toMatch(/^varselpamelding-epost:[0-9a-f]{64}$/);
    expect(adressenokler[1]).toBe(adressenokler[0]);
    expect(takNokler.join(' ')).not.toMatch(/example|offer/i);

    // Det samme gjelder når plassen gis tilbake (her: en utsending som feiler).
    sendingOk = false;
    await post({ email: 'OFFER@example.com', region: 'Trondheim' });
    expect(tilbakegitt).toEqual([adressenokler[0]]);
  });

  it('lag 2 (rad): ny innsending under ti minutter etter den forrige → ingen e-post, og tokenet står', async () => {
    // Raden venter på bekreftelse; e-posten gikk for tre minutter siden.
    eksisterende = { id: 'rad-1', confirmed_at: null, active: true, created_at: minutterSiden(3), updated_at: minutterSiden(3) };
    const res = await post({ email: 'noen@example.com', region: 'Oslo' });
    expect(await res.json()).toEqual({ ok: true, status: 'sendt' });
    expect(sendteEposter).toHaveLength(0);
    // Ingen skriving i det hele tatt: lenka som alt ligger i innboksen virker fortsatt.
    expect(kall.filter((k) => k.op !== 'select')).toEqual([]);
    // Og tellingen på tvers av områder trengs ikke engang.
    expect(kall).toHaveLength(1);
  });

  it('lag 2: etter ti minutter sendes bekreftelsen på nytt, med nytt token — folk mister e-poster', async () => {
    eksisterende = { id: 'rad-1', confirmed_at: null, active: true, created_at: minutterSiden(11), updated_at: minutterSiden(11) };
    ventende = 1;
    await post({ email: 'noen@example.com', region: 'Oslo' });
    expect(sendteEposter).toHaveLength(1);
    expect(sisteAv('update')?.payload?.confirm_token).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('lag 2: etter den første gjentakelsen går det en time mellom hver', async () => {
    // Opprettet for 40 min siden, sendt på nytt for 15 min siden.
    eksisterende = { id: 'rad-1', confirmed_at: null, active: true, created_at: minutterSiden(40), updated_at: minutterSiden(15) };
    await post({ email: 'noen@example.com', region: 'Oslo' });
    expect(sendteEposter).toHaveLength(0);
    expect(kall.filter((k) => k.op !== 'select')).toEqual([]);

    eksisterende = { id: 'rad-1', confirmed_at: null, active: true, created_at: minutterSiden(120), updated_at: minutterSiden(61) };
    await post({ email: 'noen@example.com', region: 'Oslo' });
    expect(sendteEposter).toHaveLength(1);
  });

  it('lag 2 gjelder IKKE en avmeldt rad: den kan melde seg på igjen med én gang', async () => {
    // Avmeldt for ett minutt siden — updated_at er fersk fra selve avmeldingen.
    eksisterende = {
      id: 'rad-1',
      confirmed_at: '2026-08-01T00:00:00Z',
      active: false,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: minutterSiden(1)
    };
    await post({ email: 'noen@example.com', region: 'Oslo' });
    expect(sendteEposter).toHaveLength(1);
    expect(sisteAv('update')?.payload).toMatchObject({ active: true, confirmed_at: null });
    expect(sendteEposter[0].tekst).toContain(String(sisteAv('update')?.payload?.confirm_token));
  });

  it('lag 3 (på tvers av områder): tre ubekreftede den siste timen → det fjerde området får ingen e-post', async () => {
    // Begrenseren i minnet er ute av spillet (ny instans): databasen holder taket.
    ventende = 3;
    const res = await post({ email: 'Offer@Example.com', region: 'Stavanger' });
    expect(await res.json()).toEqual({ ok: true, status: 'sendt' });
    expect(sendteEposter).toHaveLength(0);
    expect(kall.filter((k) => k.op !== 'select')).toEqual([]);

    // Tellingen: kontoløse, denne adressen, venter på bekreftelse, rørt siste time.
    const telling = kall.find((k) => k.op === 'select' && k.valg?.head === true);
    expect(telling?.valg).toEqual({ count: 'exact', head: true });
    expect(telling?.filtre).toEqual([
      ['is', 'user_id', null],
      ['eq', 'email', 'offer@example.com'],
      ['eq', 'active', true],
      ['is', 'confirmed_at', null],
      ['gte', 'updated_at', minutterSiden(60)]
    ]);
  });

  it('lag 3: to ubekreftede den siste timen slipper det tredje området gjennom', async () => {
    ventende = 2;
    await post({ email: 'noen@example.com', region: 'Trondheim' });
    expect(sendteEposter).toHaveLength(1);
    expect(sisteAv('insert')?.payload).toMatchObject({ region: 'Trondheim' });
  });

  it('lag 3 stopper også reaktivering av en avmeldt rad og en ny purring', async () => {
    ventende = 3;
    eksisterende = { id: 'rad-1', confirmed_at: '2026-08-01T00:00:00Z', active: false, created_at: '2026-08-01T00:00:00Z', updated_at: minutterSiden(500) };
    await post({ email: 'noen@example.com', region: 'Oslo' });
    eksisterende = { id: 'rad-2', confirmed_at: null, active: true, created_at: minutterSiden(30), updated_at: minutterSiden(30) };
    await post({ email: 'noen@example.com', region: 'Bergen' });
    expect(sendteEposter).toHaveLength(0);
    expect(kall.filter((k) => k.op !== 'select')).toEqual([]);
  });

  it('kan ikke tellingen leses, sendes ingenting — og svaret sier at noe gikk galt', async () => {
    tellFeil = { message: 'nede' };
    const res = await post({ email: 'noen@example.com', region: 'Oslo' });
    expect(await res.json()).toEqual({ ok: false, status: 'feil' });
    expect(sendteEposter).toHaveLength(0);
    expect(kall.filter((k) => k.op !== 'select')).toEqual([]);
  });

  it('et stoppet kall svarer nøyaktig som et vellykket — også for skjemaet, og aldri 429', async () => {
    const skjema = { email: 'noen@example.com', region: 'Oslo', locale: 'nb' };
    const gjennom = await postSkjema(skjema);
    ventende = 3;
    const stoppet = await postSkjema(skjema);
    expect(sendteEposter).toHaveLength(1);
    for (const res of [gjennom, stoppet]) {
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('https://www.mycelet.com/soppvarsel?status=sendt#status');
    }
  });
});

describe('påmelding — taket per klient', () => {
  it('skjemaet får «for mange forsøk», ikke «noe manglet»; JSON får 429', async () => {
    ekteTak = true;
    // Fem påmeldinger i timen per klient; ulike adresser, så adressetaket ikke slår inn.
    for (let i = 0; i < 5; i += 1) await postSkjema({ email: `person${i}@example.com`, region: 'Oslo', locale: 'nb' });
    expect(sendteEposter).toHaveLength(5);

    const skjema = await postSkjema({ email: 'person6@example.com', region: 'Oslo', locale: 'nb' });
    expect(skjema.status).toBe(303);
    expect(skjema.headers.get('location')).toBe('https://www.mycelet.com/soppvarsel?status=for-mange#status');
    expect((await post({ email: 'person7@example.com', region: 'Oslo' })).status).toBe(429);
    expect(sendteEposter).toHaveLength(5);

    // En annen klient er ikke berørt.
    klient = 'ip:2';
    expect((await postSkjema({ email: 'person8@example.com', region: 'Oslo', locale: 'nb' })).headers.get('location')).toContain(
      'status=sendt'
    );
  });

  it('en ugyldig adresse er fortsatt «noe manglet» — og teller ikke mot taket', async () => {
    ekteTak = true;
    for (let i = 0; i < 8; i += 1) {
      const res = await postSkjema({ email: 'ikke-en-adresse', region: 'Oslo', locale: 'nb' });
      expect(res.headers.get('location')).toBe('https://www.mycelet.com/soppvarsel?status=ugyldig#status');
    }
    expect((await postSkjema({ email: 'person@example.com', region: 'Oslo', locale: 'nb' })).headers.get('location')).toContain(
      'status=sendt'
    );
  });
});

describe('påmelding — skjemaet på områdesiden får svaret tilbake dit (retur)', () => {
  const mal = (res: Response) => res.headers.get('location');

  it('retur = slugen til området som meldes på: svaret går til områdesiden, ved skjemaet', async () => {
    const res = await postSkjema({ email: 'ola@example.com', region: 'Oslo', locale: 'nb', retur: 'oslo' });
    expect(res.status).toBe(303);
    expect(mal(res)).toBe('https://www.mycelet.com/soppforhold/oslo?status=sendt#varsel');
    expect(sendteEposter).toHaveLength(1);
  });

  it('svenske områder: slugen er ASCII, området står med sitt eget navn i skjemaet', async () => {
    const res = await postSkjema({ email: 'ola@example.com', region: 'Göteborg', locale: 'sv', retur: 'goteborg' });
    expect(mal(res)).toBe('https://www.mycelet.com/soppforhold/goteborg?status=sendt#varsel');
  });

  it('uten retur (skjemaet på /soppvarsel): svaret går dit, som før', async () => {
    const res = await postSkjema({ email: 'ola@example.com', region: 'Oslo', locale: 'nb' });
    expect(mal(res)).toBe('https://www.mycelet.com/soppvarsel?status=sendt#status');
  });

  it('retur som ikke er slugen til NETTOPP dette området ignoreres — fri tekst havner aldri i en redirect', async () => {
    for (const retur of [
      'bergen', // et ekte område, men ikke det som meldes på
      'Oslo', // navnet, ikke slugen
      'oslo/../../auth/login',
      '//evil.example',
      'https://evil.example',
      'oslo?status=bekreftet',
      'oslo#pameldt',
      ' '
    ]) {
      _resetAllBuckets();
      const res = await postSkjema({ email: 'ola@example.com', region: 'Oslo', locale: 'nb', retur });
      expect(mal(res), retur).toBe('https://www.mycelet.com/soppvarsel?status=sendt#status');
    }
  });

  it('ugyldig adresse med gyldig område og retur: beskjeden vises på områdesiden', async () => {
    const res = await postSkjema({ email: 'ikke-en-adresse', region: 'Oslo', locale: 'nb', retur: 'oslo' });
    expect(mal(res)).toBe('https://www.mycelet.com/soppforhold/oslo?status=ugyldig#varsel');
    expect(sendteEposter).toEqual([]);
  });

  it('ukjent område: retur kan ikke stemme med noe, så svaret går til /soppvarsel', async () => {
    const res = await postSkjema({ email: 'ola@example.com', region: 'Atlantis', locale: 'nb', retur: 'atlantis' });
    expect(mal(res)).toBe('https://www.mycelet.com/soppvarsel?status=ugyldig#status');
  });

  it('taket per klient og en feilet utsending svarer også på områdesiden', async () => {
    ekteTak = true;
    for (let i = 0; i < 5; i += 1) {
      await postSkjema({ email: `person${i}@example.com`, region: 'Oslo', locale: 'nb', retur: 'oslo' });
    }
    const stoppet = await postSkjema({ email: 'person6@example.com', region: 'Oslo', locale: 'nb', retur: 'oslo' });
    expect(mal(stoppet)).toBe('https://www.mycelet.com/soppforhold/oslo?status=for-mange#varsel');

    ekteTak = false;
    sendingOk = false;
    const feilet = await postSkjema({ email: 'kari@example.com', region: 'Oslo', locale: 'nb', retur: 'oslo' });
    expect(mal(feilet)).toBe('https://www.mycelet.com/soppforhold/oslo?status=feil#varsel');
  });

  it('JSON-kall har ingen retur: svaret er JSON uansett hva kroppen bærer', async () => {
    const res = await post({ email: 'ola@example.com', region: 'Oslo', retur: 'oslo' });
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.json()).toEqual({ ok: true, status: 'sendt' });
  });
});

describe('påmelding — en utsending som feiler rulles tilbake', () => {
  // Uten dette ville lag 2 svart «sjekk innboksen» på neste forsøk, ti
  // minutter i strekk, uten at det fantes noen e-post å finne.

  it('ny rad: slettes igjen — men bare så lenge den er ubekreftet', async () => {
    sendingOk = false;
    const res = await post({ email: 'noen@example.com', region: 'Oslo' });
    expect(await res.json()).toEqual({ ok: false, status: 'feil' });
    const slettet = sisteAv('delete');
    expect(slettet?.filtre).toEqual([
      ['eq', 'id', 'ny-rad'],
      ['is', 'user_id', null],
      ['is', 'confirmed_at', null]
    ]);

    // Raden er borte, så forsøket rett etterpå går gjennom og sender.
    sendingOk = true;
    eksisterende = null;
    expect((await (await post({ email: 'noen@example.com', region: 'Oslo' })).json()).status).toBe('sendt');
    expect(sendteEposter).toHaveLength(2);
  });

  it('funksjonen lever lenger enn fristen på utsendingen — ellers rekker ikke tilbakerullingen å kjøre', async () => {
    // Blir funksjonen drept mens Resend henger, står raden igjen ubekreftet, og
    // neste forsøk svares «sjekk innboksen» (lag 2) uten at noe er sendt.
    const { RESEND_FRIST_MS } = await vi.importActual<typeof import('@/lib/email/send')>('@/lib/email/send');
    expect(maxDuration * 1000).toBeGreaterThanOrEqual(RESEND_FRIST_MS + 10_000);
  });

  it('eksisterende rad: slås av igjen, slettes aldri', async () => {
    sendingOk = false;
    eksisterende = { id: 'rad-1', confirmed_at: null, active: true, created_at: minutterSiden(300), updated_at: minutterSiden(300) };
    const res = await post({ email: 'noen@example.com', region: 'Oslo' });
    expect((await res.json()).status).toBe('feil');
    expect(sisteAv('delete')).toBeNull();
    const angret = sisteAv('update');
    expect(angret?.payload).toEqual({ active: false });
    expect(angret?.filtre).toEqual([
      ['eq', 'id', 'rad-1'],
      ['is', 'confirmed_at', null]
    ]);

    // Avslått og ubekreftet: verken lag 2 eller lag 3 gjelder, så neste forsøk sender.
    sendingOk = true;
    eksisterende = { id: 'rad-1', confirmed_at: null, active: false, created_at: minutterSiden(300), updated_at: minutterSiden(0) };
    expect((await (await post({ email: 'noen@example.com', region: 'Oslo' })).json()).status).toBe('sendt');
    expect(sendteEposter).toHaveLength(2);
  });
});

describe('påmelding — taket per adresse teller e-poster som gikk ut, ikke forsøk', () => {
  // Laget i minnet telte hvert KALL, også de som endte i «noe gikk galt» og ble
  // rullet tilbake. Etter tre mislykkede forsøk var taket nådd, og det fjerde
  // ble svart «sjekk innboksen» — uten rad og uten e-post. Nå reserveres
  // plassen, og den gis tilbake på hver utgang der ingenting ble sendt.
  const SKJEMA = { email: 'noen@example.com', region: 'Oslo', locale: 'nb', retur: 'oslo' };
  const mal = (res: Response) => res.headers.get('location');
  const status = async (res: Response) => ((await res.json()) as { status: string }).status;

  it('tre utsendinger som feiler bruker ikke opp taket: det fjerde forsøket går gjennom og sender', async () => {
    // ⚠️ REGRESJONSVAKT. Resend er nede, og leseren prøver tre ganger.
    ekteTak = true;
    sendingOk = false;
    for (let i = 0; i < 3; i += 1) {
      expect(mal(await postSkjema(SKJEMA))).toBe('https://www.mycelet.com/soppforhold/oslo?status=feil#varsel');
    }
    // Hvert forsøk ble rullet tilbake, og ga plassen sin tilbake.
    expect(kall.filter((k) => k.op === 'delete')).toHaveLength(3);
    expect(tilbakegitt).toHaveLength(3);

    // Resend er oppe igjen. Samme klient, samme time — godt under taket per klient.
    sendingOk = true;
    const forsokFor = sendteEposter.length;
    expect(mal(await postSkjema(SKJEMA))).toBe('https://www.mycelet.com/soppforhold/oslo?status=sendt#varsel');
    // «Sjekk innboksen» er sant denne gangen: raden ble skrevet, og e-posten gikk.
    expect(sendteEposter).toHaveLength(forsokFor + 1);
    expect(sisteAv('insert')?.payload).toMatchObject({ email: 'noen@example.com', region: 'Oslo' });
    expect(kall.filter((k) => k.op === 'delete')).toHaveLength(3);
    expect(tilbakegitt).toHaveLength(3);
  });

  it('e-poster som gikk ut teller fortsatt: tre sendte fyller taket, uansett hvor mange forsøk som feilet imellom', async () => {
    ekteTak = true;
    const forsok: Array<[string, boolean]> = [
      ['Oslo', true],
      ['Bergen', false],
      ['Bergen', true],
      ['Trondheim', false],
      ['Trondheim', true]
    ];
    for (const [i, [region, ok]] of forsok.entries()) {
      klient = `ip:${i + 1}`; // holder taket per klient utenfor
      sendingOk = ok;
      expect(await status(await post({ email: 'offer@example.com', region }))).toBe(ok ? 'sendt' : 'feil');
    }

    // Tre bekreftelser er ute. Den fjerde stoppes FØR databasen — og svarer som de andre.
    klient = 'ip:9';
    sendingOk = true;
    const kallFor = kall.length;
    const forsokFor = sendteEposter.length;
    expect(await (await post({ email: 'offer@example.com', region: 'Stavanger' })).json()).toEqual({ ok: true, status: 'sendt' });
    expect(kall.length).toBe(kallFor);
    expect(sendteEposter).toHaveLength(forsokFor);
  });

  it('et kall som stoppes av taket tok aldri noen plass — og gir derfor ingen tilbake', async () => {
    // Ellers ville hvert stoppet kall frigjort en plass, og taket lekket.
    ekteTak = true;
    for (const [i, region] of ['Oslo', 'Bergen', 'Trondheim'].entries()) {
      klient = `ip:${i + 1}`;
      await post({ email: 'offer@example.com', region });
    }
    klient = 'ip:4';
    await post({ email: 'offer@example.com', region: 'Stavanger' });
    await post({ email: 'offer@example.com', region: 'Stavanger' });
    expect(tilbakegitt).toEqual([]);
    expect(sendteEposter).toHaveLength(3);
  });

  it('utganger uten e-post bruker heller ikke plass: allerede påmeldt, nylig sendt, tak på tvers av områder, telling som feiler', async () => {
    ekteTak = true;
    let n = 0;
    const forsok = async (region: string) => {
      klient = `ip:${(n += 1)}`; // holder taket per klient utenfor
      return status(await post({ email: 'noen@example.com', region }));
    };

    // Allerede påmeldt og bekreftet: stille suksess.
    eksisterende = { id: 'rad-1', confirmed_at: '2026-08-01T00:00:00Z', active: true };
    for (let i = 0; i < 3; i += 1) expect(await forsok('Oslo')).toBe('sendt');
    // Venter på bekreftelse, og lenka gikk for tre minutter siden: lag 2.
    eksisterende = { id: 'rad-2', confirmed_at: null, active: true, created_at: minutterSiden(3), updated_at: minutterSiden(3) };
    for (let i = 0; i < 3; i += 1) expect(await forsok('Bergen')).toBe('sendt');
    // Tre ubekreftede den siste timen (sendt fra en annen instans): lag 3.
    eksisterende = null;
    ventende = 3;
    for (let i = 0; i < 3; i += 1) expect(await forsok('Trondheim')).toBe('sendt');
    // Tellingen kan ikke leses: «noe gikk galt».
    ventende = 0;
    tellFeil = { message: 'nede' };
    for (let i = 0; i < 3; i += 1) expect(await forsok('Stavanger')).toBe('feil');

    expect(sendteEposter).toHaveLength(0);
    expect(tilbakegitt).toHaveLength(12);

    // Ingen av de tolv kallene sendte noe, så neste påmelding går gjennom.
    tellFeil = null;
    expect(await forsok('Stavanger')).toBe('sendt');
    expect(sendteEposter).toHaveLength(1);
    expect(sisteAv('insert')?.payload).toMatchObject({ region: 'Stavanger' });
  });

  it('kaster ruta underveis, står ikke plassen igjen', async () => {
    ekteTak = true;
    dbKaster = true;
    for (let i = 0; i < 3; i += 1) {
      await expect(post({ email: 'noen@example.com', region: 'Oslo' })).rejects.toThrow('databaseklienten kaster');
    }
    expect(tilbakegitt).toHaveLength(3);

    dbKaster = false;
    expect(await status(await post({ email: 'noen@example.com', region: 'Oslo' }))).toBe('sendt');
    expect(sendteEposter).toHaveLength(1);
  });

  it('en ugyldig adresse og taket per klient rører ikke taket per adresse', async () => {
    ekteTak = true;
    await postSkjema({ email: 'ikke-en-adresse', region: 'Oslo', locale: 'nb' });
    for (let i = 0; i < 5; i += 1) await postSkjema({ email: `person${i}@example.com`, region: 'Oslo', locale: 'nb' });
    expect(mal(await postSkjema(SKJEMA))).toContain('status=for-mange');
    expect(tilbakegitt).toEqual([]);
    expect(takNokler.filter((nokkel) => nokkel.startsWith('varselpamelding-epost:'))).toHaveLength(5);
  });
});
