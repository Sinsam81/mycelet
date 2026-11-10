// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

const { IDENTIFY_STILLSTAND_MS, IDENTIFY_SVARFRIST_MS, IdentifyError, sendIdentifisering, useIdentify } = await import(
  '../useIdentify'
);

/** Så mye av EventTarget som sendIdentifisering bruker. */
class Lyttere {
  private lyttere: Record<string, Array<(hendelse: unknown) => void>> = {};
  addEventListener(type: string, lytter: (hendelse: never) => void) {
    (this.lyttere[type] ??= []).push(lytter as (hendelse: unknown) => void);
  }
  fyr(type: string, hendelse: unknown = {}) {
    for (const lytter of this.lyttere[type] ?? []) lytter(hendelse);
  }
}

/**
 * En XMLHttpRequest testen styrer hendelse for hendelse. Bare det
 * sendIdentifisering bruker — og ingenting skjer av seg selv: uten et kall til
 * framdrift()/opplastet()/svar()/brudd() er forbindelsen helt stille.
 */
class FalskXhr extends Lyttere {
  static siste: FalskXhr | null = null;
  upload = new Lyttere();
  status = 0;
  responseText = '';
  metode = '';
  url = '';
  hoder: Record<string, string> = {};
  kropp: string | null = null;
  avbrutt = false;

  constructor() {
    super();
    FalskXhr.siste = this;
  }
  open(metode: string, url: string) {
    this.metode = metode;
    this.url = url;
  }
  setRequestHeader(navn: string, verdi: string) {
    this.hoder[navn] = verdi;
  }
  send(kropp: string) {
    this.kropp = kropp;
  }
  abort() {
    this.avbrutt = true;
  }

  /** Nettleseren melder at `sendt` av `totalt` byte er levert til nettverket. */
  framdrift(sendt: number, totalt = 1000) {
    this.upload.fyr('progress', { lengthComputable: true, loaded: sendt, total: totalt });
  }
  opplastet() {
    this.upload.fyr('load');
  }
  svar(status: number, tekst: string) {
    this.status = status;
    this.responseText = tekst;
    this.fyr('load');
  }
  brudd() {
    this.fyr('error');
  }
}

/** Forespørselen som nettopp ble sendt. */
function xhr(): FalskXhr {
  if (!FalskXhr.siste) throw new Error('ingen forespørsel er sendt');
  return FalskXhr.siste;
}

/** Starter kallet og fanger utfallet, så testen kan spørre uten uhåndterte avvisninger. */
function send() {
  const utfall: { svar?: { status: number; tekst: string }; feil?: unknown } = {};
  const lofte = sendIdentifisering('{"images":["abc"]}').then(
    (svar) => {
      utfall.svar = svar;
    },
    (feil: unknown) => {
      utfall.feil = feil;
    }
  );
  return { utfall, lofte };
}

beforeEach(() => {
  FalskXhr.siste = null;
  vi.stubGlobal('XMLHttpRequest', FalskXhr);
  // Date fakes med: søvn-vakta i sendIdentifisering måler veggklokketid. Fast
  // starttid, så ingenting her avhenger av dagen testen kjøres.
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-15T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('sendIdentifisering — fristen følger framdriften, ikke klokka', () => {
  it('sender kroppen som JSON til /api/identify', async () => {
    const { utfall, lofte } = send();
    expect(xhr()).toMatchObject({ metode: 'POST', url: '/api/identify', kropp: '{"images":["abc"]}' });
    expect(xhr().hoder['Content-Type']).toBe('application/json');
    xhr().opplastet();
    xhr().svar(200, '{"suggestions":[]}');
    await lofte;
    expect(utfall.svar).toEqual({ status: 200, tekst: '{"suggestions":[]}' });
  });

  it('en treg opplasting som beveger seg, kuttes aldri — heller ikke etter ti minutter', async () => {
    // Selve feilen: ett tak på 75 s fra trykket kuttet tre bilder på en
    // 0,25 Mbit/s-opplink (~70 s opplasting) på hvert eneste forsøk.
    const { utfall, lofte } = send();
    const runder = Math.ceil((10 * 60_000) / (IDENTIFY_STILLSTAND_MS - 1000));
    for (let i = 1; i <= runder; i++) {
      await vi.advanceTimersByTimeAsync(IDENTIFY_STILLSTAND_MS - 1000);
      xhr().framdrift(i, runder + 1);
    }
    expect(utfall.feil).toBeUndefined();
    expect(xhr().avbrutt).toBe(false);

    xhr().opplastet();
    xhr().svar(200, '{}');
    await lofte;
    expect(utfall.svar?.status).toBe(200);
  });

  it('opplastingen står stille → upload_stalled, og forespørselen avbrytes', async () => {
    const { utfall, lofte } = send();
    xhr().framdrift(300);
    await vi.advanceTimersByTimeAsync(IDENTIFY_STILLSTAND_MS - 1);
    expect(utfall.feil).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await lofte;
    expect(utfall.feil).toBeInstanceOf(IdentifyError);
    expect(utfall.feil).toMatchObject({ code: 'upload_stalled' });
    expect(xhr().avbrutt).toBe(true);
  });

  it('samme bytetall en gang til er ikke framdrift', async () => {
    const { utfall, lofte } = send();
    xhr().framdrift(300);
    await vi.advanceTimersByTimeAsync(IDENTIFY_STILLSTAND_MS - 1000);
    xhr().framdrift(300);
    await vi.advanceTimersByTimeAsync(1000);
    await lofte;
    expect(utfall.feil).toMatchObject({ code: 'upload_stalled' });
  });

  it('når hele kroppen er sendt, får serveren hele budsjettet sitt — og mer', async () => {
    // Den andre halvdelen av feilen: opplastingen ble ferdig på 70 s, ruta
    // brukte kvoteenheten og kreditten, og klienten ga opp på 75 s.
    const { utfall, lofte } = send();
    xhr().framdrift(500);
    xhr().opplastet();
    // Serverens maxDuration er 60 s. Stillstandsfristen gjelder ikke lenger.
    await vi.advanceTimersByTimeAsync(Math.max(IDENTIFY_STILLSTAND_MS, 60_000) + 30_000);
    expect(utfall.feil).toBeUndefined();
    xhr().svar(200, '{"suggestions":[]}');
    await lofte;
    expect(utfall.svar?.status).toBe(200);
    expect(xhr().avbrutt).toBe(false);
  });

  it('svaret kommer aldri etter at alt er sendt → timeout, ikke upload_stalled', async () => {
    const { utfall, lofte } = send();
    xhr().framdrift(500);
    xhr().opplastet();
    await vi.advanceTimersByTimeAsync(IDENTIFY_SVARFRIST_MS - 1);
    expect(utfall.feil).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await lofte;
    expect(utfall.feil).toMatchObject({ code: 'timeout' });
    expect(xhr().avbrutt).toBe(true);
  });

  it('siste framdriftshendelse (alt sendt) teller som ferdig opplasting, også uten load-hendelsen', async () => {
    const { utfall } = send();
    xhr().framdrift(400);
    xhr().framdrift(1000, 1000);
    await vi.advanceTimersByTimeAsync(IDENTIFY_STILLSTAND_MS + 1000);
    expect(utfall.feil).toBeUndefined();
  });

  it('er alt først meldt sendt, kan ikke en forsinket framdriftshendelse gjøre utfallet til upload_stalled', async () => {
    // upload_stalled betyr «bildene kom aldri fram — prøv igjen». Det må aldri
    // kunne sies om en forespørsel serveren kan ha fått i sin helhet.
    const { utfall, lofte } = send();
    xhr().framdrift(500);
    xhr().opplastet();
    xhr().framdrift(100);
    await vi.advanceTimersByTimeAsync(IDENTIFY_SVARFRIST_MS - 1);
    expect(utfall.feil).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await lofte;
    expect(utfall.feil).toMatchObject({ code: 'timeout' });
  });

  it('en nettleser som aldri melder framdrift, kuttes ikke på stillstandsfristen', async () => {
    // Uten framdriftssignalet vet vi ikke om stillhet betyr stillstand. Da
    // gjelder bare den lange fristen, og utfallet er «vet ikke hva serveren rakk».
    const { utfall, lofte } = send();
    await vi.advanceTimersByTimeAsync(IDENTIFY_SVARFRIST_MS - 1);
    expect(utfall.feil).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await lofte;
    expect(utfall.feil).toMatchObject({ code: 'timeout' });
  });

  it('tåler en XMLHttpRequest uten upload — svarfristen står alene', async () => {
    class UtenUpload extends FalskXhr {
      constructor() {
        super();
        (this as unknown as { upload: undefined }).upload = undefined;
      }
    }
    vi.stubGlobal('XMLHttpRequest', UtenUpload);
    const { utfall, lofte } = send();
    xhr().svar(200, '{}');
    await lofte;
    expect(utfall.svar?.status).toBe(200);
  });

  it('sender nettleseren kroppen på nytt (ny forbindelse), er det framdrift igjen', async () => {
    const { utfall } = send();
    xhr().framdrift(800);
    await vi.advanceTimersByTimeAsync(IDENTIFY_STILLSTAND_MS - 1000);
    // Tallet går NED: den gjenbrukte forbindelsen var død, og alt sendes om igjen.
    xhr().framdrift(100);
    await vi.advanceTimersByTimeAsync(IDENTIFY_STILLSTAND_MS - 1000);
    expect(utfall.feil).toBeUndefined();
  });
});

describe('sendIdentifisering — forbindelsen ryker', () => {
  it('før hele kroppen er sendt → TypeError, som fetch kastet (siden viser «sjekk dekningen»)', async () => {
    const { utfall, lofte } = send();
    xhr().framdrift(300);
    xhr().brudd();
    await lofte;
    expect(utfall.feil).toBeInstanceOf(TypeError);
  });

  it('etter at hele kroppen er sendt → response_lost: serveren kan ha gjort jobben', async () => {
    const { utfall, lofte } = send();
    xhr().framdrift(300);
    xhr().opplastet();
    xhr().brudd();
    await lofte;
    expect(utfall.feil).toBeInstanceOf(IdentifyError);
    expect(utfall.feil).toMatchObject({ code: 'response_lost' });
  });

  it('etter at svaret er kommet, går ingen tidtaker videre — heller ikke om en forsinket hendelse dukker opp', async () => {
    const { lofte } = send();
    xhr().framdrift(300);
    xhr().opplastet();
    xhr().svar(200, '{}');
    await lofte;
    xhr().framdrift(400);
    xhr().opplastet();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(IDENTIFY_SVARFRIST_MS);
    expect(xhr().avbrutt).toBe(false);
  });

  it('en frist som alt har avgjort saken, overstyres ikke av hendelser som kommer etterpå', async () => {
    const { utfall, lofte } = send();
    xhr().framdrift(300);
    await vi.advanceTimersByTimeAsync(IDENTIFY_STILLSTAND_MS);
    await lofte;
    xhr().svar(200, '{}');
    xhr().brudd();
    expect(utfall.svar).toBeUndefined();
    expect(utfall.feil).toMatchObject({ code: 'upload_stalled' });
  });
});

describe('sendIdentifisering — siden har sovet (låst skjerm, appen i bakgrunnen)', () => {
  it('en tidtaker som fyrer for sent, avbryter ikke: hendelsene som ventet, får komme først', async () => {
    const { utfall, lofte } = send();
    xhr().framdrift(500);
    xhr().opplastet();
    // Telefonen låses i fem minutter. Tidtakerne står, veggklokka går.
    vi.setSystemTime(Date.now() + 5 * 60_000);
    await vi.advanceTimersByTimeAsync(IDENTIFY_SVARFRIST_MS);
    expect(utfall.feil).toBeUndefined();
    expect(xhr().avbrutt).toBe(false);
    // Svaret lå og ventet, og leveres i det siden våkner.
    xhr().svar(200, '{"suggestions":[]}');
    await lofte;
    expect(utfall.svar?.status).toBe(200);
  });

  it('… men kommer det ingenting etter oppvåkningen heller, gir den opp som vanlig', async () => {
    const { utfall, lofte } = send();
    xhr().framdrift(500);
    vi.setSystemTime(Date.now() + 5 * 60_000);
    await vi.advanceTimersByTimeAsync(IDENTIFY_STILLSTAND_MS);
    expect(utfall.feil).toBeUndefined();
    await vi.advanceTimersByTimeAsync(IDENTIFY_STILLSTAND_MS);
    await lofte;
    expect(utfall.feil).toMatchObject({ code: 'upload_stalled' });
  });
});

describe('fristene henger sammen med serveren', () => {
  it('svarfristen ligger godt over rutens maxDuration (60 s)', async () => {
    const { maxDuration } = await import('@/app/api/identify/route');
    // Ikke bare «over»: nettleseren melder kroppen som sendt før de siste
    // bytene er framme, så margen må romme en treg linje også.
    expect(IDENTIFY_SVARFRIST_MS).toBeGreaterThanOrEqual((maxDuration + 60) * 1000);
  });

  it('stillstandsfristen er kortere enn svarfristen — ellers var den ikke en stillstandsfrist', () => {
    expect(IDENTIFY_STILLSTAND_MS).toBeLessThan(IDENTIFY_SVARFRIST_MS);
  });
});

function lagKrok() {
  const klient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={klient}>{children}</QueryClientProvider>;
  return renderHook(() => useIdentify(), { wrapper }).result;
}

const FORESPORSEL = {
  imagesBase64: ['abc'],
  originalImageDataUrls: ['data:image/jpeg;base64,abc'],
  latitude: 59.9,
  longitude: 10.7
};

/** Kjører kroken til forespørselen er sendt, lar testen svare, og gir utfallet. */
async function gjennomKroken(svar: (x: FalskXhr) => void) {
  const krok = lagKrok();
  const lofte = krok.current.mutateAsync(FORESPORSEL).then(
    (resultat) => ({ resultat, feil: undefined as unknown }),
    (feil: unknown) => ({ resultat: undefined, feil })
  );
  // mutateAsync starter mutationFn i en mikrooppgave.
  await vi.advanceTimersByTimeAsync(0);
  svar(xhr());
  return lofte;
}

describe('useIdentify — feilen bærer status og om svaret var rutens JSON', () => {
  it('sender bildene og posisjonen i kroppen', async () => {
    await gjennomKroken((x) => x.svar(200, '{"suggestions":[]}'));
    expect(JSON.parse(xhr().kropp ?? '')).toEqual({ images: ['abc'], latitude: 59.9, longitude: 10.7 });
  });

  it('Vercels 413 er HTML: status 413, ikke JSON, generisk tekst', async () => {
    const { feil } = await gjennomKroken((x) => x.svar(413, '<html>Request Entity Too Large</html>'));
    expect(feil).toBeInstanceOf(IdentifyError);
    expect(feil).toMatchObject({ status: 413, json: false, code: undefined, message: 'Identifikasjon feilet' });
  });

  it('rutens 401 er JSON: status, kode og serverens tekst bevares', async () => {
    const { feil } = await gjennomKroken((x) =>
      x.svar(401, JSON.stringify({ error: 'Ikke autentisert', code: 'unauthenticated' }))
    );
    expect(feil).toMatchObject({ status: 401, json: true, code: 'unauthenticated', message: 'Ikke autentisert' });
  });

  it('et tidsavbrudd hos Vercel (504 HTML) skilles fra en feil i ruta (500 JSON)', async () => {
    const tidsavbrudd = await gjennomKroken((x) => x.svar(504, 'An error occurred'));
    const iRuta = await gjennomKroken((x) =>
      x.svar(500, JSON.stringify({ error: 'En feil oppstod. Prøv igjen.', code: 'unexpected' }))
    );
    expect(tidsavbrudd.feil).toMatchObject({ status: 504, json: false });
    expect(iRuta.feil).toMatchObject({ status: 500, json: true, code: 'unexpected' });
  });

  it('et vellykket svar blir resultatet siden lagrer, med bildene og posisjonen fra forespørselen', async () => {
    const { resultat } = await gjennomKroken((x) =>
      x.svar(
        200,
        JSON.stringify({
          suggestions: [{ name: 'Cantharellus cibarius' }],
          isMushroom: true,
          freeQuotaRemaining: 3,
          identificationId: 'id-1',
          imagePath: 'bruker/id-1.jpg'
        })
      )
    );
    expect(resultat).toMatchObject({
      identificationId: 'id-1',
      historyImagePath: 'bruker/id-1.jpg',
      originalImageDataUrl: 'data:image/jpeg;base64,abc',
      location: { latitude: 59.9, longitude: 10.7 },
      isMushroom: true,
      freeQuotaRemaining: 3
    });
    expect(resultat?.suggestions).toHaveLength(1);
  });

  it('klientens egne utfall går uendret gjennom kroken, med koden bevart', async () => {
    const { feil } = await gjennomKroken((x) => {
      x.opplastet();
      x.brudd();
    });
    expect(feil).toMatchObject({ code: 'response_lost', status: undefined, json: undefined });
  });
});
