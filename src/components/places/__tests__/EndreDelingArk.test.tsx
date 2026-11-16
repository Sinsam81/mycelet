// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EndreDelingArk } from '../EndreDelingArk';
import { SONE_OMGJORING_AAPEN } from '@/lib/findings/delingsendring';
import type { FunnIKort } from '@/lib/findings/mine-funn';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * «Endre deling» testes HER og ikke i nettleseren: et ekte trykk i en
 * innlogget økt ville endret et ekte funn i produksjonsdatabasen (det finnes
 * bare én). fetch er mocket, og testene ser på kroppen som ville gått ut.
 *
 * Arket bruker tekstene til lagringsflaten (AddFindingSheet, IdentifyResult).
 * Testene leser de ekte katalogene, og slår de LÅNTE tekstene opp der i
 * stedet for å skrive dem av: endrer lagringsflaten ordlyden, skal ikke
 * testene her falle — men forsvinner en nøkkel, gjør de det.
 *
 * Om et funn kan gjøres om til SONE, styres av bryteren SONE_OMGJORING_AAPEN
 * (delingsendring.ts), som står av til migrasjon 075 er bekreftet kjørt.
 * `rendrer` følger bryteren slik den står; `rendrerAapen` viser arket slik det
 * blir når den slås på. Begge utfall er testet, så bryteren kan slås på uten
 * at noe her må skrives om.
 */

/** Lagringsflatens tekster, på norsk og svensk. */
const L = nb.AddFindingSheet;
const LSV = sv.AddFindingSheet;

/** Fast klokke — testene skal ikke avhenge av dagens dato. */
const NAA = new Date('2026-11-10T12:00:00.000Z');
const omTimer = (timer: number) => new Date(NAA.getTime() + timer * 60 * 60 * 1000).toISOString();

const ID = '11111111-2222-3333-4444-555555555555';

function funn(over: Partial<FunnIKort> = {}): FunnIKort {
  return {
    id: ID,
    artsnavn: 'Kantarell',
    datoTekst: '12. sep. 2026',
    deling: 'approximate',
    soneNavn: null,
    soneKm: 5,
    notat: null,
    bilde: null,
    aapnesTidligst: null,
    ...over
  };
}

const fetchMock = vi.fn();
const onLukk = vi.fn();
const onLagret = vi.fn();
const onUtdatert = vi.fn();

/** `aapen` utelatt = bryteren slik den står i koden. */
function tre(over: Partial<FunnIKort> = {}, sprak: 'nb' | 'sv' = 'nb', aapen?: boolean) {
  return (
    <NextIntlClientProvider locale={sprak} messages={(sprak === 'nb' ? nb : sv) as never} timeZone="Europe/Oslo">
      <EndreDelingArk
        funn={funn(over)}
        onLukk={onLukk}
        onLagret={onLagret}
        onUtdatert={onUtdatert}
        {...(aapen === undefined ? {} : { soneOmgjoringAapen: aapen })}
      />
    </NextIntlClientProvider>
  );
}

function rendrer(over: Partial<FunnIKort> = {}, sprak: 'nb' | 'sv' = 'nb') {
  return render(tre(over, sprak));
}

/** Arket slik det er når omgjøring til sone er åpnet. */
function rendrerAapen(over: Partial<FunnIKort> = {}, sprak: 'nb' | 'sv' = 'nb') {
  return render(tre(over, sprak, true));
}

/** Arket slik det er til migrasjon 075 er bekreftet kjørt. */
function rendrerStengt(over: Partial<FunnIKort> = {}, sprak: 'nb' | 'sv' = 'nb') {
  return render(tre(over, sprak, false));
}

const kall = () => fetchMock.mock.calls[0] as [string, RequestInit];
const kroppen = () => JSON.parse(kall()[1].body as string);
const valg = (navn: string) => screen.getByRole('radio', { name: navn }) as HTMLInputElement;
const finnesValg = (navn: string) => screen.queryByRole('radio', { name: navn }) !== null;
const lagre = (navn = 'Lagre') => screen.getByRole('button', { name: navn }) as HTMLButtonElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NAA);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
  vi.stubGlobal('fetch', fetchMock);
  onLukk.mockReset();
  onLagret.mockReset();
  onUtdatert.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('EndreDelingArk — valgene', () => {
  it('viser lagringsflatens tre nivåer, med lagringsflatens egne ord', () => {
    rendrerAapen();
    expect(valg(L.sharingApproximate).checked).toBe(true);
    expect(valg(L.sharingZone).checked).toBe(false);
    expect(valg(L.sharingPrivate).checked).toBe(false);
    expect(screen.getByText(`Deles nå: ${L.sharingApproximate}`)).toBeTruthy();
    // Forklaringen fra AI-resultatsiden, ordrett.
    expect(screen.getByText(nb.IdentifyResult.sharingHelp)).toBeTruthy();
  });

  /**
   * Å legge ut det eksakte stedet til et funn i etterkant er den ene
   * endringen som ikke kan tas tilbake. Arket finnes for å stramme inn.
   */
  it('tilbyr ikke eksakt punkt', () => {
    rendrerAapen();
    expect(screen.queryByRole('radio', { name: L.sharingPublic })).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByText(/Eksakt punkt kan ikke slås på herfra/)).toBeTruthy();

    cleanup();
    rendrerStengt();
    expect(screen.queryByRole('radio', { name: L.sharingPublic })).toBeNull();
    expect(screen.getByText(/Eksakt punkt kan ikke slås på herfra/)).toBeTruthy();
  });

  it('viser et offentlig funn som det, uten å forhåndsvelge noe nytt nivå', () => {
    rendrer({ deling: 'public' });
    expect(screen.getByText(`Deles nå: ${L.sharingPublic}`)).toBeTruthy();
    expect(screen.getByText(/Alle ser nøyaktig hvor funnet er gjort/)).toBeTruthy();
    expect(screen.getAllByRole('radio').every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect(lagre().disabled).toBe(true);
  });

  it('lar ikke en uendret deling lagres', () => {
    rendrer();
    expect(lagre().disabled).toBe(true);
    fireEvent.click(valg(L.sharingPrivate));
    expect(lagre().disabled).toBe(false);
    fireEvent.click(valg(L.sharingApproximate));
    expect(lagre().disabled).toBe(true);
  });
});

describe('EndreDelingArk — lagring', () => {
  it('gjør funnet privat', async () => {
    rendrer();
    fireEvent.click(valg(L.sharingPrivate));
    fireEvent.click(lagre());

    await waitFor(() => expect(onLagret).toHaveBeenCalledTimes(1));
    expect(kall()[0]).toBe(`/api/findings/${ID}`);
    expect(kall()[1].method).toBe('PATCH');
    expect(kroppen()).toEqual({ visibility: 'private', isZoneFinding: false });
  });

  it('strammer et offentlig funn inn til omtrentlig', async () => {
    rendrer({ deling: 'public' });
    fireEvent.click(valg(L.sharingApproximate));
    fireEvent.click(lagre());

    await waitFor(() => expect(onLagret).toHaveBeenCalled());
    expect(kroppen()).toEqual({ visibility: 'approximate', isZoneFinding: false });
  });

  it('sender aldri posisjon, notat eller eksakt synlighet', async () => {
    rendrer({ notat: 'Bak hytta' });
    fireEvent.click(valg(L.sharingPrivate));
    fireEvent.click(lagre());

    await waitFor(() => expect(onLagret).toHaveBeenCalled());
    expect(Object.keys(kroppen()).sort()).toEqual(['isZoneFinding', 'visibility']);
  });

  it('krever sonenavn før noe sendes — med lagringsflatens feiltekst', () => {
    rendrerAapen();
    fireEvent.click(valg(L.sharingZone));
    expect(screen.getByText(L.zoneInfo)).toBeTruthy();
    fireEvent.click(lagre());

    expect(screen.getByRole('alert').textContent).toBe(L.errorZoneLabelRequired);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * Ingen rutestørrelse i kroppen: utelatt betyr «den funnet står med», og det
   * er den eneste ruta har lov til å skrive (delingsendring.ts, «SONERUTA»).
   */
  it('gjør funnet til sone-funn med navn — og uten å be om en rutestørrelse', async () => {
    rendrerAapen();
    fireEvent.click(valg(L.sharingZone));
    fireEvent.change(screen.getByLabelText(L.zoneName), { target: { value: '  Nordmarka sør ' } });
    fireEvent.click(lagre());

    await waitFor(() => expect(onLagret).toHaveBeenCalled());
    expect(kroppen()).toEqual({ visibility: 'approximate', isZoneFinding: true, zoneLabel: 'Nordmarka sør' });
  });

  it.each([
    ['åpen', true],
    ['stengt', false]
  ] as const)('lar et sone-funn bytte navn uten å bytte nivå eller rute (omgjøring %s)', async (_stilling, aapen) => {
    render(tre({ deling: 'zone', soneNavn: 'Nordmarka', soneKm: 3 }, 'nb', aapen));
    expect(lagre().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(L.zoneName), { target: { value: 'Marka nord' } });
    fireEvent.click(lagre());

    await waitFor(() => expect(onLagret).toHaveBeenCalled());
    expect(kroppen()).toEqual({ visibility: 'approximate', isZoneFinding: true, zoneLabel: 'Marka nord' });
  });

  it('viser serverens beskjed og blir stående åpent når lagringen avvises', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: 'Funnet er endret det siste døgnet.', code: 'sharing_cooldown' })
    });
    rendrer({ deling: 'private' });
    fireEvent.click(valg(L.sharingApproximate));
    fireEvent.click(lagre());

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Funnet er endret det siste døgnet.'));
    expect(onLagret).not.toHaveBeenCalled();
    expect(onLukk).not.toHaveBeenCalled();
    // Og knappen er tilbake — ikke et ark låst i «Lagrer …».
    expect(lagre().disabled).toBe(false);
  });

  /**
   * Serveren sa nei til noe arket trodde var lov: funnet er endret et annet
   * sted (en annen fane, appen). Arket ber om at lista hentes på nytt, og når
   * den kommer, er valget grået ut — ikke en knapp som gir samme nei igjen.
   */
  it('ber om ny liste når serveren kjenner en karantene siden ikke visste om, og sperrer så valget', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: 'Funnet er endret det siste døgnet.', code: 'sharing_cooldown' })
    });
    const { rerender } = rendrer({ deling: 'private' });
    fireEvent.click(valg(L.sharingApproximate));
    fireEvent.click(lagre());

    await waitFor(() => expect(onUtdatert).toHaveBeenCalledTimes(1));
    expect(onUtdatert).toHaveBeenCalledWith('karantene', 'Funnet er endret det siste døgnet.');

    // Lista er hentet på nytt: funnet står nå med karantenen.
    rerender(tre({ deling: 'private', aapnesTidligst: omTimer(22) }));
    expect(valg(L.sharingApproximate).disabled).toBe(true);
    expect(lagre().disabled).toBe(true);
    // Beskjeden fra serveren står fortsatt.
    expect(screen.getByRole('alert').textContent).toBe('Funnet er endret det siste døgnet.');
  });

  /** Er funnet borte, forsvinner arket med raden — kallstedet må få teksten. */
  it('sier fra til kallstedet når funnet er slettet et annet sted', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Fant ikke funnet', code: 'not_found' })
    });
    rendrer();
    fireEvent.click(valg(L.sharingPrivate));
    fireEvent.click(lagre());

    await waitFor(() => expect(onUtdatert).toHaveBeenCalledWith('borte', 'Fant ikke funnet'));
    expect(onLagret).not.toHaveBeenCalled();
  });

  it('ber ikke om ny liste for en vanlig feil', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Kunne ikke lagre endringen. Prøv igjen.', code: 'update_failed' })
    });
    rendrer();
    fireEvent.click(valg(L.sharingPrivate));
    fireEvent.click(lagre());

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(onUtdatert).not.toHaveBeenCalled();
  });

  it('sier fra med egne ord når nettet faller ut', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    rendrer();
    fireEvent.click(valg(L.sharingPrivate));
    fireEvent.click(lagre());

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Kunne ikke lagre endringen. Prøv igjen.')
    );
  });
});

/**
 * Regelen står i delingsendring.ts. Arket skal vise den FØR brukeren trykker,
 * så ingen får et nei de ikke kunne se komme.
 */
describe('EndreDelingArk — karantenen er synlig før trykket', () => {
  it('gråer ut omtrentlig deling på et privat funn som nylig er endret, og sier når den åpner', () => {
    rendrerAapen({ deling: 'private', aapnesTidligst: omTimer(22) });
    expect(valg(L.sharingApproximate).disabled).toBe(true);
    // Sone (når den er et valg) og privat er ikke karantenebelagt.
    expect(valg(L.sharingZone).disabled).toBe(false);
    expect(valg(L.sharingPrivate).disabled).toBe(false);
    // 12:00 UTC + 22 t = 10:00 UTC = kl. 11:00 norsk tid 11. november.
    const grunn = screen.getByText(/Omtrentlig deling kan velges igjen 11\. november.*11:00/);
    // Grunnen er knyttet til valget, så en skjermleser leser dem sammen.
    expect(valg(L.sharingApproximate).getAttribute('aria-describedby')).toBe(grunn.id);
    expect(valg(L.sharingPrivate).getAttribute('aria-describedby')).toBeNull();
  });

  it('gråer ut omtrentlig deling også for et nylig endret sone-funn', () => {
    rendrer({ deling: 'zone', soneNavn: 'Nordmarka', aapnesTidligst: omTimer(5) });
    expect(valg(L.sharingApproximate).disabled).toBe(true);
  });

  it('lar et offentlig funn strammes inn til omtrentlig selv om det nylig er endret', () => {
    rendrer({ deling: 'public', aapnesTidligst: omTimer(22) });
    expect(valg(L.sharingApproximate).disabled).toBe(false);
  });

  it('sperrer ingenting når karantenen er over', () => {
    rendrer({ deling: 'private', aapnesTidligst: omTimer(-0.5) });
    expect(valg(L.sharingApproximate).disabled).toBe(false);
    expect(screen.queryByText(/kan velges igjen/)).toBeNull();
  });

  it('sier fra før et delt funn skjules: omtrentlig kan da ikke velges igjen samme døgn', () => {
    rendrer();
    expect(screen.queryByText(/tidligst deles omtrentlig igjen/)).toBeNull();
    fireEvent.click(valg(L.sharingPrivate));
    expect(screen.getByText(/tidligst deles omtrentlig igjen om 24 timer/)).toBeTruthy();
  });

  /**
   * Hver lagring starter karantenen på nytt — også den som gjør et privat
   * funn til sone, eller bare gir sonen et nytt navn.
   */
  it('sier det samme før et privat funn blir sone, og før en sone får nytt navn', () => {
    rendrerAapen({ deling: 'private' });
    expect(screen.queryByText(/tidligst deles omtrentlig igjen/)).toBeNull();
    fireEvent.click(valg(L.sharingZone));
    expect(screen.getByText(/tidligst deles omtrentlig igjen om 24 timer/)).toBeTruthy();

    cleanup();
    rendrer({ deling: 'zone', soneNavn: 'Nordmarka', soneKm: 3 });
    expect(screen.queryByText(/tidligst deles omtrentlig igjen/)).toBeNull();
    fireEvent.change(screen.getByLabelText(L.zoneName), { target: { value: 'Marka nord' } });
    expect(screen.getByText(/tidligst deles omtrentlig igjen om 24 timer/)).toBeTruthy();
  });

  it('sier det ikke til den som strammer et offentlig funn inn til omtrentlig', () => {
    rendrer({ deling: 'public' });
    fireEvent.click(valg(L.sharingApproximate));
    expect(screen.queryByText(/tidligst deles omtrentlig igjen/)).toBeNull();
  });
});

/**
 * Til migrasjon 075 er bekreftet kjørt, røper sone-stempelet funnets eksakte
 * breddegrad. Arket skal da ikke tilby «Sone-funn (hemmeligsted-vennlig)» som
 * en innstramming — det ville lagt ut mer enn prikken det erstatter. Og
 * rutestørrelsen kan aldri endres: flere ruter for samme funn snevrer inn hvor
 * stedet er. Begge deler er begrunnet i delingsendring.ts («SONERUTA»).
 */
describe('EndreDelingArk — sone', () => {
  it.each(['approximate', 'private', 'public'] as const)(
    'tilbyr ikke sone for et %s funn så lenge omgjøringen er stengt',
    (deling) => {
      rendrerStengt({ deling });
      expect(finnesValg(L.sharingZone)).toBe(false);
      expect(screen.getAllByRole('radio')).toHaveLength(2);
      expect(finnesValg(L.sharingApproximate)).toBe(true);
      expect(finnesValg(L.sharingPrivate)).toBe(true);
      // Og ikke noe sonefelt å fylle ut.
      expect(screen.queryByText(L.zoneInfo)).toBeNull();
    }
  );

  it('viser et funn som alt er sone, som sone — og lar det strammes inn', async () => {
    rendrerStengt({ deling: 'zone', soneNavn: 'Nordmarka', soneKm: 3 });
    expect(valg(L.sharingZone).checked).toBe(true);
    expect(screen.getByText(`Deles nå: ${L.sharingZone}`)).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);

    fireEvent.click(valg(L.sharingPrivate));
    fireEvent.click(lagre());
    await waitFor(() => expect(onLagret).toHaveBeenCalled());
    expect(kroppen()).toEqual({ visibility: 'private', isZoneFinding: false });
  });

  /**
   * Med stengt omgjøring er sone en dør som bare går én vei: gjøres funnet
   * om, er sone ikke et valg neste gang arket åpnes. Si det før trykket.
   */
  it('sier fra før et sone-funn gjøres om: det kan ikke bli sone igjen herfra', () => {
    rendrerStengt({ deling: 'zone', soneNavn: 'Nordmarka', soneKm: 3 });
    const beskjed = /Bytter du delingsnivå nå, kan du foreløpig ikke gjøre funnet til sone-funn igjen herfra/;
    expect(screen.queryByText(beskjed)).toBeNull();

    fireEvent.click(valg(L.sharingPrivate));
    expect(screen.getByText(beskjed)).toBeTruthy();
    fireEvent.click(valg(L.sharingApproximate));
    expect(screen.getByText(beskjed)).toBeTruthy();

    // Tilbake på sone: ingenting å advare om.
    fireEvent.click(valg(L.sharingZone));
    expect(screen.queryByText(beskjed)).toBeNull();
  });

  it('sier det ikke når omgjøringen er åpen, eller for et funn som aldri var sone', () => {
    const beskjed = /sone-funn igjen herfra/;
    rendrerAapen({ deling: 'zone', soneNavn: 'Nordmarka', soneKm: 3 });
    fireEvent.click(valg(L.sharingPrivate));
    expect(screen.queryByText(beskjed)).toBeNull();

    cleanup();
    rendrerStengt({ deling: 'approximate' });
    fireEvent.click(valg(L.sharingPrivate));
    expect(screen.queryByText(beskjed)).toBeNull();
  });

  it('følger bryteren i delingsendring.ts når ingenting annet er sagt', () => {
    rendrer();
    expect(finnesValg(L.sharingZone)).toBe(SONE_OMGJORING_AAPEN);
  });

  it.each([
    ['åpen', true],
    ['stengt', false]
  ] as const)('viser rutestørrelsen uten å la den endres (omgjøring %s)', (_stilling, aapen) => {
    render(tre({ deling: 'zone', soneNavn: 'Nordmarka', soneKm: 3 }, 'nb', aapen));
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByText(`${L.zoneGranularity}:`, { exact: false }).textContent).toBe(
      `${L.zoneGranularity}: ${L.zonePrecisionKm.replace('{km}', '3')}`
    );
    expect(screen.getByText(/Grovheten kan ikke endres etter at funnet er lagret/)).toBeTruthy();
  });

  it('viser størrelsen funnet står med, også når det gjøres om til sone', () => {
    rendrerAapen({ deling: 'approximate', soneKm: 5 });
    fireEvent.click(valg(L.sharingZone));
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByText(`${L.zoneGranularity}:`, { exact: false }).textContent).toContain('5 km');
  });

  it('sier det samme på svensk', () => {
    rendrerStengt({ deling: 'zone', soneNavn: 'Kolmården', soneKm: 3 }, 'sv');
    expect(screen.getByText(/Grovheten kan inte ändras efter att fyndet har sparats/)).toBeTruthy();
    expect(screen.getByText(`${LSV.zoneGranularity}:`, { exact: false }).textContent).toContain('3 km');

    fireEvent.click(valg(LSV.sharingPrivate));
    expect(screen.getByText(/kan du tills vidare inte göra fyndet till zonfynd igen härifrån/)).toBeTruthy();
  });

  /** Serveren sier nei til en omgjøring arket trodde var lov: beskjeden vises, arket står. */
  it('viser serverens beskjed når omgjøringen til sone avvises', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ error: 'Funnet er IKKE endret.', code: 'zone_unavailable' })
    });
    rendrerAapen();
    fireEvent.click(valg(L.sharingZone));
    fireEvent.change(screen.getByLabelText(L.zoneName), { target: { value: 'Nordmarka' } });
    fireEvent.click(lagre());

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Funnet er IKKE endret.'));
    expect(onLagret).not.toHaveBeenCalled();
    expect(onUtdatert).not.toHaveBeenCalled();
  });
});

describe('EndreDelingArk — lukking og språk', () => {
  it('lukkes med Avbryt og med Escape', () => {
    rendrer();
    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }));
    expect(onLukk).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onLukk).toHaveBeenCalledTimes(2);
  });

  it('kan ikke lukkes mens lagringen pågår', async () => {
    let slipp: (v: unknown) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise((resolve) => (slipp = resolve)));
    rendrer();
    fireEvent.click(valg(L.sharingPrivate));
    fireEvent.click(lagre());

    await waitFor(() => expect(screen.getByRole('button', { name: 'Lagrer …' })).toBeTruthy());
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }));
    expect(onLukk).not.toHaveBeenCalled();

    slipp({ ok: true, json: () => Promise.resolve({ ok: true }) });
    await waitFor(() => expect(onLagret).toHaveBeenCalled());
  });

  it('er oversatt til svensk, også tekstene arket låner', () => {
    rendrerAapen({ deling: 'private', aapnesTidligst: omTimer(22) }, 'sv');
    expect(screen.getByRole('heading', { name: 'Ändra delning' })).toBeTruthy();
    expect(screen.getByText(`Delas nu: ${LSV.sharingPrivate}`)).toBeTruthy();
    expect(valg(LSV.sharingApproximate).disabled).toBe(true);
    expect(valg(LSV.sharingZone)).toBeTruthy();
    expect(screen.getByText(/Ungefärlig delning kan väljas igen 11 november.*11:00/)).toBeTruthy();
    expect(screen.getByText(/Exakt punkt kan inte slås på härifrån/)).toBeTruthy();
    expect(lagre('Spara')).toBeTruthy();
  });
});
