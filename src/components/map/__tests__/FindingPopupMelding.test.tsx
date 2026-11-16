// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { FindingPopup } from '../FindingPopup';
import { REPORT_REASONS } from '@/lib/moderation/report-reasons';
import { TREFF_44 } from '../trykkflate';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Melding og blokkering fra kartpopupen.
 *
 * Kartet er appens hovedflate, og et funn med et støtende bilde, en rødlistet
 * art eller noens private eiendom kunne ikke meldes der det ble sett — bare i
 * forumet. Disse testene låser det som gjør flaten trygg:
 *  1. Knappene vises BARE på andres funn, og bare når kartet har sendt inn en
 *     handling (innlogget leser).
 *  2. Blokkering spør først. Melding sendes først på «Send rapport».
 *  3. En feil blir stående der brukeren ser på, og låser ikke popupen.
 *  4. Popupen viser aldri koordinater, og ingenting om hvem som har meldt.
 */

const finding = {
  id: '11111111-2222-3333-4444-555555555555',
  user_id: 'bruker-2',
  username: 'sopper',
  species_id: 1,
  norwegian_name: 'Kantarell',
  latin_name: 'Cantharellus cibarius',
  edibility: 'edible' as const,
  display_lat: 59.91234,
  display_lng: 10.75678,
  thumbnail_url: null,
  verification_status: 'unverified',
  found_at: '2026-08-15T10:00:00Z',
  quantity: null,
  notes: 'Ved den store grana',
  is_zone_finding: false,
  zone_label: null,
  zone_precision_km: null
};

type Props = Partial<React.ComponentProps<typeof FindingPopup>>;

function rendrer(props: Props = {}, locale: 'nb' | 'sv' = 'nb') {
  return render(
    <NextIntlClientProvider locale={locale} messages={(locale === 'sv' ? sv : nb) as never} timeZone="Europe/Oslo">
      <FindingPopup finding={finding} {...props} />
    </NextIntlClientProvider>
  );
}

const MELD = nb.FindingPopup.report;
const BLOKKER = nb.FindingPopup.block;

afterEach(cleanup);

describe('når knappene vises', () => {
  it('ikke uten handlinger fra kartet — en utlogget leser får ingen knapper', () => {
    rendrer();
    expect(screen.queryByRole('button', { name: MELD })).toBeNull();
    expect(screen.queryByRole('button', { name: BLOKKER })).toBeNull();
  });

  it('ikke på eget funn, selv om handlingene skulle være sendt inn', () => {
    rendrer({ canDelete: true, onDelete: vi.fn(), onReport: vi.fn(), onBlock: vi.fn() });
    expect(screen.queryByRole('button', { name: MELD })).toBeNull();
    expect(screen.queryByRole('button', { name: BLOKKER })).toBeNull();
    expect(screen.getByText(nb.FindingPopup.delete)).toBeTruthy();
  });

  it('begge på en annens funn', () => {
    rendrer({ onReport: vi.fn(), onBlock: vi.fn() });
    expect(screen.getByRole('button', { name: MELD })).toBeTruthy();
    expect(screen.getByRole('button', { name: BLOKKER })).toBeTruthy();
    // Og ingen sletteknapp: funnet er ikke leserens.
    expect(screen.queryByText(nb.FindingPopup.delete)).toBeNull();
  });

  it('bare melding når funnet ikke har en bruker å blokkere', () => {
    rendrer({ onReport: vi.fn() });
    expect(screen.getByRole('button', { name: MELD })).toBeTruthy();
    expect(screen.queryByRole('button', { name: BLOKKER })).toBeNull();
  });
});

describe('knappene i den smale popupen', () => {
  it('viser forumets korte ord, mens det opplest navnet sier hele handlingen', () => {
    for (const [locale, katalog] of [
      ['nb', nb],
      ['sv', sv]
    ] as const) {
      rendrer({ onReport: vi.fn(), onBlock: vi.fn() }, locale);
      const meld = screen.getByRole('button', { name: katalog.FindingPopup.report });
      const blokker = screen.getByRole('button', { name: katalog.FindingPopup.block });
      expect(meld.textContent?.trim()).toBe(katalog.ReportButton.report);
      expect(blokker.textContent?.trim()).toBe(katalog.BlockUser.block);
      // Det synlige ordet er med i navnet (WCAG 2.5.3) — talestyring finner knappen.
      expect(katalog.FindingPopup.report.startsWith(katalog.ReportButton.report)).toBe(true);
      expect(katalog.FindingPopup.block.startsWith(katalog.BlockUser.block)).toBe(true);
      cleanup();
    }
  });

  it('de to står på én rad som ikke brytes — brøt den, lå treffflatene oppå hverandre', () => {
    rendrer({ onReport: vi.fn(), onBlock: vi.fn() });
    const meld = screen.getByRole('button', { name: MELD });
    const blokker = screen.getByRole('button', { name: BLOKKER });
    expect(meld.parentElement).toBe(blokker.parentElement);
    expect(meld.parentElement!.className.split(' ')).not.toContain('flex-wrap');
    for (const knapp of [meld, blokker]) {
      expect(knapp.className).toContain(TREFF_44);
      expect(knapp.className.split(' ')).toContain('relative');
      expect(knapp.className.split(' ')).toContain('whitespace-nowrap');
    }
  });

  it('knappene i skjemaene er 44 px høye og kan brytes når popupen er smal', () => {
    rendrer({ onReport: vi.fn(), onBlock: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: MELD }));
    const send = screen.getByRole('button', { name: nb.ReportButton.submit });
    const avbryt = screen.getByRole('button', { name: nb.FindingPopup.reportCancel });
    for (const knapp of [send, avbryt]) expect(knapp.className).toContain('min-h-[44px]');
    expect(send.parentElement!.className.split(' ')).toContain('flex-wrap');
    expect(screen.getByLabelText(nb.FindingPopup.reportReason).className.split(' ')).toContain('h-11');

    fireEvent.click(screen.getByRole('button', { name: BLOKKER }));
    const ja = screen.getByRole('button', { name: nb.BlockUser.confirmYes });
    expect(ja.className).toContain('min-h-[44px]');
    expect(ja.parentElement!.className.split(' ')).toContain('flex-wrap');
  });

  it('«Del i forumet» og «Slett funn» har også flate på 44 px', () => {
    rendrer({ canDelete: true, onDelete: vi.fn() });
    expect(screen.getByRole('link', { name: nb.FindingPopup.shareInForum }).className).toContain(TREFF_44);
    expect(screen.getByRole('button', { name: nb.FindingPopup.delete }).className).toContain(TREFF_44);
    fireEvent.click(screen.getByRole('button', { name: nb.FindingPopup.delete }));
    expect(screen.getByRole('button', { name: nb.FindingPopup.deleteConfirm }).className).toContain('min-h-[44px]');
    expect(screen.getByRole('button', { name: nb.FindingPopup.deleteCancel }).className).toContain('min-h-[44px]');
  });

  it('tekstene i det nye feltet er <div>, ikke <p> — Leaflet gir <p> i en popup 1,3em marg', () => {
    const { container } = rendrer({ onReport: vi.fn(), onBlock: vi.fn() });
    const felt = screen.getByRole('button', { name: MELD }).parentElement!.parentElement!;
    fireEvent.click(screen.getByRole('button', { name: BLOKKER }));
    expect(felt.querySelectorAll('p')).toHaveLength(0);
    expect(container.contains(felt)).toBe(true);
  });
});

describe('melding', () => {
  it('første trykk åpner skjemaet og sender ingenting', () => {
    const onReport = vi.fn().mockResolvedValue(undefined);
    rendrer({ onReport });
    const knapp = screen.getByRole('button', { name: MELD });
    expect(knapp.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(knapp);
    expect(knapp.getAttribute('aria-expanded')).toBe('true');
    expect(onReport).not.toHaveBeenCalled();
  });

  it('feltene har etiketter — de manglet i forumets skjema', () => {
    rendrer({ onReport: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: MELD }));
    expect(screen.getByLabelText(nb.FindingPopup.reportReason).tagName).toBe('SELECT');
    expect(screen.getByLabelText(nb.ReportButton.descriptionPlaceholder).tagName).toBe('TEXTAREA');
  });

  it('tilbyr alle meldegrunnene databasen godtar, med forumets tekster', () => {
    rendrer({ onReport: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: MELD }));
    const valg = Array.from(screen.getByLabelText(nb.FindingPopup.reportReason).querySelectorAll('option'));
    expect(valg.map((o) => o.value)).toEqual(REPORT_REASONS.map((r) => r.value));
    const tekster = nb.ReportButton as Record<string, string>;
    expect(valg.map((o) => o.textContent)).toEqual(REPORT_REASONS.map((r) => tekster[r.labelKey]));
    // Grunnene som bare gir mening for funn, er med.
    expect(valg.map((o) => o.value)).toEqual(expect.arrayContaining(['protected_species', 'privacy']));
  });

  it('sender funnets id, grunnen og beskrivelsen — og bare det', async () => {
    const onReport = vi.fn().mockResolvedValue(undefined);
    rendrer({ onReport });
    fireEvent.click(screen.getByRole('button', { name: MELD }));
    fireEvent.change(screen.getByLabelText(nb.FindingPopup.reportReason), { target: { value: 'protected_species' } });
    fireEvent.change(screen.getByLabelText(nb.ReportButton.descriptionPlaceholder), {
      target: { value: '  Rødlistet art  ' }
    });
    fireEvent.click(screen.getByRole('button', { name: nb.ReportButton.submit }));

    await waitFor(() => expect(onReport).toHaveBeenCalledTimes(1));
    expect(onReport).toHaveBeenCalledWith(finding.id, { reason: 'protected_species', description: 'Rødlistet art' });
  });

  it('en tom beskrivelse sendes ikke som en tom streng', async () => {
    const onReport = vi.fn().mockResolvedValue(undefined);
    rendrer({ onReport });
    fireEvent.click(screen.getByRole('button', { name: MELD }));
    fireEvent.click(screen.getByRole('button', { name: nb.ReportButton.submit }));
    await waitFor(() => expect(onReport).toHaveBeenCalledWith(finding.id, { reason: 'misinformation', description: undefined }));
  });

  it('kvitterer, lukker skjemaet og lar ikke samme funn meldes en gang til ved et dobbelttrykk', async () => {
    const onReport = vi.fn().mockResolvedValue(undefined);
    rendrer({ onReport, onBlock: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: MELD }));
    fireEvent.click(screen.getByRole('button', { name: nb.ReportButton.submit }));

    const kvittering = await screen.findByText(nb.ReportButton.success);
    expect(kvittering.getAttribute('role')).toBe('status');
    expect(screen.queryByRole('button', { name: MELD })).toBeNull();
    expect(screen.queryByRole('button', { name: nb.ReportButton.submit })).toBeNull();
    // Blokkering er fortsatt mulig etter en melding.
    expect(screen.getByRole('button', { name: BLOKKER })).toBeTruthy();
    // Knappen som hadde fokus er borte; kvitteringen har fått det.
    await waitFor(() => expect(document.activeElement).toBe(kvittering));
  });

  it('viser feilen kartet kaster, og lar skjemaet stå med det brukeren skrev', async () => {
    const onReport = vi.fn().mockRejectedValue(new Error('Du må logge inn først.'));
    rendrer({ onReport });
    fireEvent.click(screen.getByRole('button', { name: MELD }));
    fireEvent.change(screen.getByLabelText(nb.ReportButton.descriptionPlaceholder), { target: { value: 'Feil art' } });
    fireEvent.click(screen.getByRole('button', { name: nb.ReportButton.submit }));

    const feil = await screen.findByRole('alert');
    expect(feil.textContent).toBe('Du må logge inn først.');
    expect((screen.getByLabelText(nb.ReportButton.descriptionPlaceholder) as HTMLTextAreaElement).value).toBe('Feil art');
    // Ikke låst i «sender …».
    expect((screen.getByRole('button', { name: nb.ReportButton.submit }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(nb.ReportButton.success)).toBeNull();
  });

  it('en feil uten tekst gir forumets egen feiltekst, aldri en tom linje', async () => {
    const onReport = vi.fn().mockRejectedValue(new Error(''));
    rendrer({ onReport });
    fireEvent.click(screen.getByRole('button', { name: MELD }));
    fireEvent.click(screen.getByRole('button', { name: nb.ReportButton.submit }));
    expect((await screen.findByRole('alert')).textContent).toBe(nb.ReportButton.submitError);
  });

  it('«Avbryt» lukker uten å sende', () => {
    const onReport = vi.fn();
    rendrer({ onReport });
    fireEvent.click(screen.getByRole('button', { name: MELD }));
    fireEvent.click(screen.getByRole('button', { name: nb.FindingPopup.reportCancel }));
    expect(onReport).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(nb.FindingPopup.reportReason)).toBeNull();
    expect(screen.getByRole('button', { name: MELD })).toBeTruthy();
  });
});

describe('blokkering', () => {
  it('spør før den blokkerer — første trykk kaller ingenting', () => {
    const onBlock = vi.fn().mockResolvedValue(undefined);
    rendrer({ onBlock });
    fireEvent.click(screen.getByRole('button', { name: BLOKKER }));
    expect(onBlock).not.toHaveBeenCalled();
    expect(screen.getByText('Blokkere sopper?')).toBeTruthy();
    // Hva blokkering betyr står der FØR bekreftelsen — også at funnene på kartet forsvinner.
    expect(screen.getByText(nb.BlockUser.explain)).toBeTruthy();
    expect(nb.BlockUser.explain).toContain('funn på kartet');
  });

  it('blokkerer først på bekreftelsen, og sender funnet til kartet', async () => {
    const onBlock = vi.fn().mockResolvedValue(undefined);
    rendrer({ onBlock });
    fireEvent.click(screen.getByRole('button', { name: BLOKKER }));
    fireEvent.click(screen.getByRole('button', { name: nb.BlockUser.confirmYes }));
    await waitFor(() => expect(onBlock).toHaveBeenCalledTimes(1));
    expect(onBlock.mock.calls[0][0]).toMatchObject({ id: finding.id, user_id: 'bruker-2', username: 'sopper' });
  });

  it('blir popupen stående etterpå, viser den kvitteringen i stedet for knappene', async () => {
    rendrer({ onReport: vi.fn(), onBlock: vi.fn().mockResolvedValue(undefined) });
    fireEvent.click(screen.getByRole('button', { name: BLOKKER }));
    fireEvent.click(screen.getByRole('button', { name: nb.BlockUser.confirmYes }));
    expect(await screen.findByText('sopper er blokkert')).toBeTruthy();
    expect(screen.queryByRole('button', { name: BLOKKER })).toBeNull();
    expect(screen.queryByRole('button', { name: MELD })).toBeNull();
  });

  it('avbryter uten å blokkere', () => {
    const onBlock = vi.fn();
    rendrer({ onBlock });
    fireEvent.click(screen.getByRole('button', { name: BLOKKER }));
    fireEvent.click(screen.getByRole('button', { name: nb.BlockUser.cancel }));
    expect(onBlock).not.toHaveBeenCalled();
    expect(screen.queryByText('Blokkere sopper?')).toBeNull();
  });

  it('viser feilen og lar brukeren prøve igjen', async () => {
    const onBlock = vi.fn().mockRejectedValue(new Error(nb.BlockUser.failed));
    rendrer({ onBlock });
    fireEvent.click(screen.getByRole('button', { name: BLOKKER }));
    fireEvent.click(screen.getByRole('button', { name: nb.BlockUser.confirmYes }));
    expect((await screen.findByRole('alert')).textContent).toBe(nb.BlockUser.failed);
    expect((screen.getByRole('button', { name: nb.BlockUser.confirmYes }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('et funn uten brukernavn spør om «Ukjent bruker», ikke om ingenting', () => {
    render(
      <NextIntlClientProvider locale="nb" messages={nb as never} timeZone="Europe/Oslo">
        <FindingPopup finding={{ ...finding, username: '' }} onBlock={vi.fn()} />
      </NextIntlClientProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: BLOKKER }));
    expect(screen.getByText(`Blokkere ${nb.BlockedUsers.unknown}?`)).toBeTruthy();
  });
});

describe('ett av gangen', () => {
  it('å åpne blokkeringen lukker meldeskjemaet — begge åpne blir høyere enn kartet', () => {
    rendrer({ onReport: vi.fn(), onBlock: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: MELD }));
    expect(screen.getByLabelText(nb.FindingPopup.reportReason)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: BLOKKER }));
    expect(screen.queryByLabelText(nb.FindingPopup.reportReason)).toBeNull();
    expect(screen.getByText('Blokkere sopper?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: MELD }));
    expect(screen.queryByText('Blokkere sopper?')).toBeNull();
    expect(screen.getByLabelText(nb.FindingPopup.reportReason)).toBeTruthy();
  });

  it('et nytt trykk på samme knapp lukker igjen', () => {
    rendrer({ onReport: vi.fn(), onBlock: vi.fn() });
    const knapp = screen.getByRole('button', { name: BLOKKER });
    fireEvent.click(knapp);
    fireEvent.click(knapp);
    expect(screen.queryByText('Blokkere sopper?')).toBeNull();
    expect(knapp.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('det popupen ikke viser', () => {
  it('aldri koordinatene — heller ikke med skjemaene åpne', () => {
    const { container } = rendrer({ onReport: vi.fn(), onBlock: vi.fn() });
    const utenKoordinater = () => {
      expect(container.innerHTML).not.toContain('59.9');
      expect(container.innerHTML).not.toContain('10.7');
    };
    utenKoordinater();
    fireEvent.click(screen.getByRole('button', { name: MELD }));
    utenKoordinater();
    fireEvent.click(screen.getByRole('button', { name: BLOKKER }));
    utenKoordinater();
  });

  it('beskrivelsesfeltet starter tomt — ingenting om funnet fylles inn for brukeren', () => {
    rendrer({ onReport: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: MELD }));
    expect((screen.getByLabelText(nb.ReportButton.descriptionPlaceholder) as HTMLTextAreaElement).value).toBe('');
  });
});

describe('svensk', () => {
  it('samme flyt på svensk', async () => {
    const onReport = vi.fn().mockResolvedValue(undefined);
    rendrer({ onReport, onBlock: vi.fn() }, 'sv');
    fireEvent.click(screen.getByRole('button', { name: sv.FindingPopup.block }));
    expect(screen.getByText('Blockera sopper?')).toBeTruthy();
    expect(screen.getByText(sv.BlockUser.explain)).toBeTruthy();
    expect(sv.BlockUser.explain).toContain('fynd på kartan');

    fireEvent.click(screen.getByRole('button', { name: sv.FindingPopup.report }));
    expect(screen.getByLabelText(sv.FindingPopup.reportReason)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: sv.ReportButton.submit }));
    expect(await screen.findByText(sv.ReportButton.success)).toBeTruthy();
  });

  it('de nye tekstene er svenske, ikke norske', () => {
    expect(sv.FindingPopup.report).toBe('Rapportera fyndet');
    expect(sv.FindingPopup.block).toBe('Blockera användaren');
    expect(sv.FindingPopup.reportReason).toBe('Vad gäller det?');
    expect(sv.FindingPopup.reportSending).toBe('Skickar …');
  });
});
