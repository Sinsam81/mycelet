import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { utenBlokkerte } from '@/lib/moderation/blokkering';
import { BLOKKERTE_FRIST_MS, lagBlokkerteHusk, type BlokkerteSvar } from '../blokkerte-brukere';

/**
 * Kartet må vite hvem leseren har blokkert FØR funnlaget tegnes — ellers
 * blinker den blokkertes funn fram ved hver åpning. Reglene her er de fire i
 * toppen av blokkerte-brukere.ts.
 */

const svar = (...ider: string[]): BlokkerteSvar => ({ data: ider.map((blocked_id) => ({ blocked_id })), error: null });

/** Oppslag testen selv avgjør — eller lar henge, som en forespørsel uten svar. */
function hengende() {
  const kall: Array<{ svar: (v: BlokkerteSvar) => void; feil: (e: unknown) => void }> = [];
  const hent = vi.fn(
    () =>
      new Promise<BlokkerteSvar>((svar, feil) => {
        kall.push({ svar, feil });
      })
  );
  return { hent, kall };
}

function folg<T>(lofte: Promise<T>) {
  const status: { ferdig: boolean; verdi: T | undefined } = { ferdig: false, verdi: undefined };
  void lofte.then((verdi) => {
    status.ferdig = true;
    status.verdi = verdi;
  });
  return status;
}

/** La løfter som alt er avgjort, kjøre ferdig — uten å flytte klokka. */
const tikk = () => vi.advanceTimersByTimeAsync(0);

describe('lagBlokkerteHusk', () => {
  it('gir id-ene fra oppslaget', async () => {
    const husk = lagBlokkerteHusk(async () => svar('a', 'b'));
    expect([...(await husk.ider())].sort()).toEqual(['a', 'b']);
  });

  it('henter én gang, uansett hvor mange ganger kartet flyttes', async () => {
    const hent = vi.fn(async () => svar('a'));
    const husk = lagBlokkerteHusk(hent);
    await Promise.all([husk.ider(), husk.ider()]);
    await husk.ider();
    expect(hent).toHaveBeenCalledTimes(1);
  });

  it('henter ikke før noen spør', () => {
    const hent = vi.fn(async () => svar());
    lagBlokkerteHusk(hent);
    expect(hent).not.toHaveBeenCalled();
  });

  it('en tom liste er et svar — den hentes ikke på nytt', async () => {
    const hent = vi.fn(async () => svar());
    const husk = lagBlokkerteHusk(hent);
    expect((await husk.ider()).size).toBe(0);
    await husk.ider();
    expect(hent).toHaveBeenCalledTimes(1);
  });

  it('en feil gir en tom liste, ikke et avvist løfte — funnene vises da ufiltrert', async () => {
    const husk = lagBlokkerteHusk(async () => ({ data: null, error: { message: 'nettet falt ut' } }));
    await expect(husk.ider()).resolves.toEqual(new Set());
  });

  it('en feil huskes ikke: neste lasting prøver igjen, og filteret virker fra da', async () => {
    const hent = vi
      .fn<() => Promise<BlokkerteSvar>>()
      .mockResolvedValueOnce({ data: null, error: new Error('timeout') })
      .mockResolvedValueOnce(svar('a'));
    const husk = lagBlokkerteHusk(hent);
    expect((await husk.ider()).size).toBe(0);
    expect([...(await husk.ider())]).toEqual(['a']);
    await husk.ider();
    expect(hent).toHaveBeenCalledTimes(2);
  });

  it('tåler en henter som kaster — med en gang eller senere', async () => {
    const kasterStraks = lagBlokkerteHusk(() => {
      throw new Error('ingen klient');
    });
    await expect(kasterStraks.ider()).resolves.toEqual(new Set());

    const avvises = lagBlokkerteHusk(() => Promise.reject(new Error('avbrutt')));
    await expect(avvises.ider()).resolves.toEqual(new Set());
  });

  it('en blokkering gjort fra kartet gjelder straks, uten ny henting', async () => {
    const hent = vi.fn(async () => svar('a'));
    const husk = lagBlokkerteHusk(hent);
    await husk.ider();
    husk.leggTil('b');
    expect([...(await husk.ider())].sort()).toEqual(['a', 'b']);
    expect(hent).toHaveBeenCalledTimes(1);
  });

  it('en blokkering gjelder også når oppslaget feiler', async () => {
    const husk = lagBlokkerteHusk(async () => ({ data: null, error: new Error('nede') }));
    husk.leggTil('b');
    expect([...(await husk.ider())]).toEqual(['b']);
  });

  it('en blokkering gjort mens oppslaget er underveis blir med', async () => {
    let slipp: (v: BlokkerteSvar) => void = () => {};
    const husk = lagBlokkerteHusk(() => new Promise<BlokkerteSvar>((resolve) => (slipp = resolve)));
    const underveis = husk.ider();
    husk.leggTil('b');
    // Henteren kalles i en mikrooppgave; vent til den har overtatt `slipp`.
    await Promise.resolve();
    slipp(svar('a'));
    expect([...(await underveis)].sort()).toEqual(['a', 'b']);
  });

  it('hopper over rader uten id', async () => {
    const husk = lagBlokkerteHusk(async () => ({
      data: [{ blocked_id: 'a' }, { blocked_id: null }, { blocked_id: '' }, {}, { blocked_id: 7 }],
      error: null
    }));
    expect([...(await husk.ider())]).toEqual(['a']);
  });

  it('en tom id legges ikke til', async () => {
    const husk = lagBlokkerteHusk(async () => svar());
    husk.leggTil('');
    expect((await husk.ider()).size).toBe(0);
  });
});

describe('ventingen har en frist — ett oppslag som henger, holder ikke funnlaget tomt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fristen er to–tre sekunder', () => {
    expect(BLOKKERTE_FRIST_MS).toBeGreaterThanOrEqual(2000);
    expect(BLOKKERTE_FRIST_MS).toBeLessThanOrEqual(3000);
  });

  it('et oppslag som aldri svarer: etter fristen gis det som er kjent, og funnene kan tegnes', async () => {
    const { hent } = hengende();
    const husk = lagBlokkerteHusk(hent);
    const s = folg(husk.ider());

    await vi.advanceTimersByTimeAsync(BLOKKERTE_FRIST_MS - 1);
    expect(s.ferdig).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.ferdig).toBe(true);
    expect(s.verdi?.size).toBe(0);
  });

  it('et svar i tide venter ikke ut fristen, og lar ingen tidtaker stå igjen', async () => {
    const { hent, kall } = hengende();
    const husk = lagBlokkerteHusk(hent);
    const s = folg(husk.ider());

    await vi.advanceTimersByTimeAsync(200);
    kall[0].svar(svar('a'));
    await tikk();
    expect([...(s.verdi ?? [])]).toEqual(['a']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('en feil venter heller ikke ut fristen', async () => {
    const { hent, kall } = hengende();
    const husk = lagBlokkerteHusk(hent);
    const s = folg(husk.ider());

    await tikk();
    kall[0].feil(new Error('nettet falt ut'));
    await tikk();
    expect(s.ferdig).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('lastinger innenfor fristen deler ett oppslag, og slippes samtidig', async () => {
    const { hent } = hengende();
    const husk = lagBlokkerteHusk(hent);
    const forste = folg(husk.ider());
    await vi.advanceTimersByTimeAsync(2000);
    // Kartet er flyttet: en ny lasting, mens oppslaget fortsatt er ute.
    const andre = folg(husk.ider());
    await tikk();
    expect(hent).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(BLOKKERTE_FRIST_MS - 2000);
    expect(forste.ferdig).toBe(true);
    expect(andre.ferdig).toBe(true);
  });

  it('et hengende oppslag huskes ikke: neste lasting starter et nytt, og svaret på det gjelder', async () => {
    const { hent, kall } = hengende();
    const husk = lagBlokkerteHusk(hent);
    void husk.ider();
    await vi.advanceTimersByTimeAsync(BLOKKERTE_FRIST_MS);
    expect(hent).toHaveBeenCalledTimes(1);

    const neste = folg(husk.ider());
    await tikk();
    expect(hent).toHaveBeenCalledTimes(2);
    kall[1].svar(svar('a'));
    await tikk();
    expect([...(neste.verdi ?? [])]).toEqual(['a']);

    // Og fra nå av er lista husket: ingen flere oppslag, ingen venting.
    expect([...(await husk.ider())]).toEqual(['a']);
    expect(hent).toHaveBeenCalledTimes(2);
  });

  it('svaret som kommer etter fristen, tas i bruk — og er med i settet som alt er delt ut', async () => {
    const { hent, kall } = hengende();
    const husk = lagBlokkerteHusk(hent);
    const vedFristen = folg(husk.ider());
    await vi.advanceTimersByTimeAsync(BLOKKERTE_FRIST_MS);
    const delt = vedFristen.verdi as ReadonlySet<string>;
    expect(delt.size).toBe(0);

    // Forespørselen som hang, svarer likevel.
    kall[0].svar(svar('b'));
    await tikk();
    // En lasting som fikk svaret sitt ved fristen og tegner først nå (funnene
    // kom senere enn lista), filtrerer med det som er kjent i det den tegner.
    expect([...delt]).toEqual(['b']);
    expect([...(await husk.ider())]).toEqual(['b']);
    expect(hent).toHaveBeenCalledTimes(1);
  });

  it('det første svaret gjelder: et eldre oppslag som svarer etter et nyere, endrer ingenting', async () => {
    const { hent, kall } = hengende();
    const husk = lagBlokkerteHusk(hent);
    void husk.ider();
    await vi.advanceTimersByTimeAsync(BLOKKERTE_FRIST_MS);
    void husk.ider();
    await tikk();
    kall[1].svar(svar('a'));
    await tikk();

    kall[0].svar(svar('gammel'));
    await tikk();
    expect([...(await husk.ider())]).toEqual(['a']);
  });

  it('et eldre oppslag som FEILER etter fristen, river ikke det nyere som er underveis', async () => {
    const { hent, kall } = hengende();
    const husk = lagBlokkerteHusk(hent);
    void husk.ider();
    await vi.advanceTimersByTimeAsync(BLOKKERTE_FRIST_MS);
    const andre = folg(husk.ider());
    await tikk();
    expect(hent).toHaveBeenCalledTimes(2);

    kall[0].feil(new Error('ga opp etter et minutt'));
    await tikk();
    // Den nyere lastingen venter fortsatt på SITT oppslag …
    expect(andre.ferdig).toBe(false);
    // … og en tredje deler det, i stedet for å starte enda et.
    void husk.ider();
    await tikk();
    expect(hent).toHaveBeenCalledTimes(2);

    kall[1].svar(svar('a'));
    await tikk();
    expect([...(andre.verdi ?? [])]).toEqual(['a']);
  });

  it('en blokkering gjort fra kartet gjelder også mens oppslaget henger', async () => {
    const { hent } = hengende();
    const husk = lagBlokkerteHusk(hent);
    const s = folg(husk.ider());
    husk.leggTil('b');
    await vi.advanceTimersByTimeAsync(BLOKKERTE_FRIST_MS);
    expect([...(s.verdi ?? [])]).toEqual(['b']);
  });

  it('fristen kan settes av den som lager husken', async () => {
    const { hent } = hengende();
    const husk = lagBlokkerteHusk(hent, { fristMs: 400 });
    const s = folg(husk.ider());
    await vi.advanceTimersByTimeAsync(399);
    expect(s.ferdig).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.ferdig).toBe(true);
  });
});

describe('naarHentet — kartet får vite at lista er inne', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('løses med lista når oppslaget svarer i tide', async () => {
    const husk = lagBlokkerteHusk(async () => svar('a', 'b'));
    const inne = folg(husk.naarHentet());
    await husk.ider();
    await tikk();
    expect([...(inne.verdi ?? [])].sort()).toEqual(['a', 'b']);
  });

  it('løses når et oppslag som hang, til slutt svarer — det er da kartet har tegnet uten lista', async () => {
    const { hent, kall } = hengende();
    const husk = lagBlokkerteHusk(hent);
    const inne = folg(husk.naarHentet());
    void husk.ider();
    await vi.advanceTimersByTimeAsync(BLOKKERTE_FRIST_MS);
    expect(inne.ferdig).toBe(false);

    kall[0].svar(svar('b'));
    await tikk();
    expect([...(inne.verdi ?? [])]).toEqual(['b']);
  });

  it('løses ikke av en feil — da er det ingen liste å rydde etter', async () => {
    const { hent, kall } = hengende();
    const husk = lagBlokkerteHusk(hent);
    const inne = folg(husk.naarHentet());
    void husk.ider();
    await tikk();
    kall[0].feil(new Error('nede'));
    await vi.advanceTimersByTimeAsync(BLOKKERTE_FRIST_MS * 2);
    expect(inne.ferdig).toBe(false);

    // Neste lasting lykkes: da løses det.
    void husk.ider();
    await tikk();
    kall[1].svar(svar('a'));
    await tikk();
    expect([...(inne.verdi ?? [])]).toEqual(['a']);
  });

  it('starter ikke noe oppslag selv', async () => {
    const { hent } = hengende();
    const husk = lagBlokkerteHusk(hent);
    void husk.naarHentet();
    await vi.advanceTimersByTimeAsync(BLOKKERTE_FRIST_MS);
    expect(hent).not.toHaveBeenCalled();
  });

  it('den som spør etter at lista er inne, får den med en gang — med blokkeringer gjort fra kartet', async () => {
    const husk = lagBlokkerteHusk(async () => svar('a'));
    await husk.ider();
    husk.leggTil('b');
    expect([...(await husk.naarHentet())].sort()).toEqual(['a', 'b']);
  });
});

describe('sammen med filteret kartet bruker', () => {
  const funn = [
    { id: '1', user_id: 'a' },
    { id: '2', user_id: 'b' },
    { id: '3', user_id: 'c' }
  ];

  it('tar ut funnene til den som er blokkert, og lar resten stå', async () => {
    const husk = lagBlokkerteHusk(async () => svar('b'));
    expect(utenBlokkerte(funn, await husk.ider()).map((f) => f.id)).toEqual(['1', '3']);
  });

  it('tar ut funnene til en som nettopp ble blokkert fra kartet', async () => {
    const husk = lagBlokkerteHusk(async () => svar('b'));
    husk.leggTil('c');
    expect(utenBlokkerte(funn, await husk.ider()).map((f) => f.id)).toEqual(['1']);
  });

  it('viser alt når oppslaget feiler', async () => {
    const husk = lagBlokkerteHusk(async () => ({ data: null, error: new Error('nede') }));
    expect(utenBlokkerte(funn, await husk.ider())).toHaveLength(3);
  });

  it('viser alt når oppslaget henger — og filtrerer når lista så kommer', async () => {
    vi.useFakeTimers();
    try {
      const { hent, kall } = hengende();
      const husk = lagBlokkerteHusk(hent);
      const s = folg(husk.ider());
      await vi.advanceTimersByTimeAsync(BLOKKERTE_FRIST_MS);
      const ider = s.verdi as ReadonlySet<string>;
      // Funnene var inne først: de tegnes uten lista.
      expect(utenBlokkerte(funn, ider)).toHaveLength(3);

      kall[0].svar(svar('b'));
      await tikk();
      // Samme sett, lest på nytt — som en lasting der funnene kom ETTER lista.
      expect(utenBlokkerte(funn, ider).map((f) => f.id)).toEqual(['1', '3']);
    } finally {
      vi.useRealTimers();
    }
  });
});
