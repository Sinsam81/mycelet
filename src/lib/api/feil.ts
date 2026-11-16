import { NextResponse } from 'next/server';
import { getUserLocale } from '@/i18n/locale';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';
import { LEGAL_ENTITY } from '@/lib/legal/entity';
import type { LogContext, Logger } from '@/lib/log';

/**
 * Feilsvar fra API-rutene, på leserens språk.
 *
 * Bare for server: språket leses fra cookies (next/headers). Importer aldri
 * denne fila fra en klientkomponent.
 *
 * HVORFOR
 * Tekst som lages på serveren dekkes ikke av next-intl (se i18n-avsnittet i
 * CLAUDE.md). Rundt et dusin brukervendte ruter svarte hardkodet norsk —
 * «Kunne ikke slette konto», «Kunne ikke lagre tilbakemeldingen» — og
 * klientene viser serverens tekst FØR sin egen oversettelse
 * (`body.details || body.error || t(...)`). En svensk bruker fikk dermed norsk
 * midt i et svensk grensesnitt, akkurat der det teller mest: feil,
 * kontosletting, dataeksport. Tre ruter sendte i tillegg den rå
 * databasemeldingen (`error.message`) rett til nettleseren, og én navnet på en
 * miljøvariabel.
 *
 * REGELEN
 * Et feilsvar er `{ error, code }`:
 *
 *   • `error` er teksten, hentet fra tabellen under på leserens språk.
 *   • `code` er stabil og maskinlesbar. Klienter forgrener på den, aldri på
 *     teksten — en klient som leter etter en norsk delstreng slutter å virke
 *     i det svaret blir oversatt (/api/identify lærte det på den harde måten).
 *
 * Teksten kan BARE komme fra tabellen: `apiFeil` tar en kode, ikke fritekst.
 * Det er hele vernet mot lekkasje — en rute kan ikke sende en databasemelding
 * til klienten gjennom denne hjelperen. Den rå feilen hører hjemme i loggen;
 * se `loggFeil` nederst.
 *
 * Svarformen er den samme som før, med ett felt til: alt som var `{ error }`
 * er nå `{ error, code }`, og `details` står der den sto. Ingen felt er døpt
 * om, og ingen statuskode er endret.
 *
 * NY FEIL? Legg til en rad her, med begge språk. Svensken skal være svensk
 * (ord som «feedback» og «varning» følger messages/sv.json), ikke norsk med
 * svenske endelser. Testen i __tests__/feil.test.ts feiler om et språk mangler.
 */
const TEKSTER = {
  // ── Felles ────────────────────────────────────────────────────────────────
  unauthenticated: {
    nb: 'Du må være logget inn.',
    sv: 'Du måste vara inloggad.'
  },
  forbidden: {
    nb: 'Du har ikke tilgang til dette.',
    sv: 'Du har inte åtkomst till detta.'
  },
  invalid_request: {
    nb: 'Ugyldig forespørsel.',
    sv: 'Ogiltig förfrågan.'
  },
  unexpected: {
    nb: 'Noe gikk galt. Prøv igjen om litt.',
    sv: 'Något gick fel. Försök igen om en stund.'
  },

  // ── Kontosletting (/api/me/delete) ────────────────────────────────────────
  delete_bad_confirm: {
    nb: 'Bekreftelsen mangler eller er feil.',
    sv: 'Bekräftelsen saknas eller är felaktig.'
  },
  // Tjenestenøkkelen mangler hos oss. Brukeren kan ikke gjøre noe med det, og
  // navnet på variabelen er vår sak. Det som betyr noe for dem er tilstanden:
  // ingenting er slettet ennå (klienten opprettes FØR første sletting).
  delete_unavailable: {
    nb: 'Kontosletting er ikke tilgjengelig akkurat nå.',
    sv: 'Kontoradering är inte tillgänglig just nu.'
  },
  delete_unavailable_details: {
    nb: `Kontoen din ble IKKE slettet, og ingenting er fjernet. Feilen ligger hos oss — kontakt ${LEGAL_ENTITY.privacyEmail}, så hjelper vi deg.`,
    sv: `Ditt konto raderades INTE, och inget har tagits bort. Felet ligger hos oss — kontakta ${LEGAL_ENTITY.privacyEmail} så hjälper vi dig.`
  },
  delete_findings_failed: {
    nb: 'Kunne ikke fjerne dine personlige funn før kontosletting.',
    sv: 'Kunde inte ta bort dina personliga fynd före kontoraderingen.'
  },
  delete_removed_findings_failed: {
    nb: 'Kunne ikke fjerne funn du allerede hadde slettet.',
    sv: 'Kunde inte ta bort fynd som du redan hade raderat.'
  },
  delete_observations_failed: {
    nb: 'Kunne ikke fjerne private observasjoner før kontosletting.',
    sv: 'Kunde inte ta bort privata observationer före kontoraderingen.'
  },
  delete_coarsen_failed: {
    nb: 'Kunne ikke anonymisere posisjonen på observasjonene dine.',
    sv: 'Kunde inte anonymisera positionen för dina observationer.'
  },
  delete_images_failed: {
    nb: 'Kunne ikke fjerne bildene dine.',
    sv: 'Kunde inte ta bort dina bilder.'
  },
  // Påmeldinger gjort uten konto, på brukerens egen adresse (migrasjon 057).
  delete_alerts_failed: {
    nb: 'Kunne ikke fjerne soppvarsel-påmeldingen din.',
    sv: 'Kunde inte ta bort din anmälan till svampvarningen.'
  },
  delete_subscription_failed: {
    nb: 'Kunne ikke si opp abonnementet ditt hos Stripe.',
    sv: 'Kunde inte säga upp din prenumeration hos Stripe.'
  },
  delete_account_failed: {
    nb: 'Kunne ikke slette kontoen.',
    sv: 'Kunde inte radera kontot.'
  },
  // Samme beskjed uansett hvilket steg som røk: hva er tilstanden, og hva gjør
  // du nå. Klienten viser `details` FØR `error`, så denne bærer meningen —
  // kontoen står, noe kan være borte, og det er trygt å gjenta.
  delete_retry_safe: {
    nb: 'Kontoen din er IKKE slettet, men noe av innholdet ditt kan være fjernet. Prøv igjen — det er trygt å gjenta, og andre forsøk rydder resten. Vedvarer feilen, kontakt oss.',
    sv: 'Ditt konto är INTE raderat, men en del av ditt innehåll kan ha tagits bort. Försök igen — det är ofarligt att upprepa, och nästa försök tar bort resten. Kontakta oss om felet kvarstår.'
  },

  // ── Dataeksport (/api/me/export) ──────────────────────────────────────────
  export_incomplete: {
    nb: 'Kunne ikke hente ut alle dataene dine.',
    sv: 'Kunde inte hämta ut alla dina data.'
  },
  export_server_error_details: {
    nb: `Eksporten ble avbrutt på grunn av en serverfeil. Du har IKKE fått en ufullstendig fil. Prøv igjen om litt — vedvarer feilen, kontakt ${LEGAL_ENTITY.privacyEmail}.`,
    sv: `Exporten avbröts på grund av ett serverfel. Du har INTE fått en ofullständig fil. Försök igen om en stund — kontakta ${LEGAL_ENTITY.privacyEmail} om felet kvarstår.`
  },
  export_dataset_failed_details: {
    nb: `Eksporten ble avbrutt fordi minst ett datasett ikke kunne leses. Du har IKKE fått en ufullstendig fil. Prøv igjen om litt — vedvarer feilen, kontakt ${LEGAL_ENTITY.privacyEmail}.`,
    sv: `Exporten avbröts eftersom minst en datamängd inte kunde läsas. Du har INTE fått en ofullständig fil. Försök igen om en stund — kontakta ${LEGAL_ENTITY.privacyEmail} om felet kvarstår.`
  },

  // ── Varsel om automatisk sletting (/api/me/extend-retention) ──────────────
  retention_cancel_failed: {
    nb: 'Kunne ikke avbryte slettingen. Prøv igjen.',
    sv: 'Kunde inte avbryta raderingen. Försök igen.'
  },

  // ── Mine steder som GPX (/api/me/gpx) ─────────────────────────────────────
  gpx_failed: {
    nb: 'Kunne ikke hente funnene.',
    sv: 'Kunde inte hämta fynden.'
  },

  // ── Soppvarselet på kontoen (/api/me/soppvarsel) ──────────────────────────
  alert_load_failed: {
    nb: 'Kunne ikke hente varselet.',
    sv: 'Kunde inte hämta varningen.'
  },
  alert_unknown_area: {
    nb: 'Ukjent område.',
    sv: 'Okänt område.'
  },
  alert_save_failed: {
    nb: 'Kunne ikke lagre varselet.',
    sv: 'Kunde inte spara varningen.'
  },

  // ── «Fant du sopp her?» (/api/spot-feedback) ──────────────────────────────
  feedback_invalid: {
    nb: 'Ugyldig tilbakemelding.',
    sv: 'Ogiltig feedback.'
  },
  feedback_save_failed: {
    nb: 'Kunne ikke lagre tilbakemeldingen.',
    sv: 'Kunde inte spara din feedback.'
  },

  // ── Stedssøk (/api/places) ────────────────────────────────────────────────
  search_too_long: {
    nb: 'Søketeksten er for lang.',
    sv: 'Söktexten är för lång.'
  },

  // ── Soppforhold per region (/api/prediction/regions) ──────────────────────
  regions_unavailable: {
    nb: 'Kunne ikke hente soppforholdene.',
    sv: 'Kunde inte hämta svampförhållandena.'
  },

  // ── Verifiserte plukkere (/api/admin/verified-foragers) ───────────────────
  admin_load_failed: {
    nb: 'Kunne ikke hente data.',
    sv: 'Kunde inte hämta data.'
  },
  admin_save_failed: {
    nb: 'Kunne ikke lagre.',
    sv: 'Kunde inte spara.'
  },
  admin_remove_failed: {
    nb: 'Kunne ikke fjerne.',
    sv: 'Kunde inte ta bort.'
  }
} as const satisfies Record<string, Record<Locale, string>>;

export type ApiFeilKode = keyof typeof TEKSTER;

/** Alle kodene, for testene og for den som vil liste dem. */
export const API_FEILKODER = Object.keys(TEKSTER) as ApiFeilKode[];

/** Teksten for en kode på et gitt språk. Ren, så den kan brukes uten en forespørsel. */
export function apiFeilTekst(kode: ApiFeilKode, locale: Locale): string {
  return TEKSTER[kode][locale] ?? TEKSTER[kode][DEFAULT_LOCALE];
}

/**
 * Leserens språk, uten å kunne kaste.
 *
 * Oppslaget leser cookies, som kaster utenfor en request-kontekst. Et feilsvar
 * skal aldri bli en 500 fordi vi ikke fant språket — samme vakt som
 * rateLimitResponse har.
 */
export async function apiSprak(): Promise<Locale> {
  try {
    return await getUserLocale();
  } catch {
    return DEFAULT_LOCALE;
  }
}

export interface ApiFeilSvar {
  error: string;
  code: ApiFeilKode;
  details?: string;
  hint?: string;
}

export interface ApiFeilValg {
  /**
   * Språket, når ruta alt har slått det opp (eller det følger av noe annet enn
   * leseren, som `?locale=` i /api/prediction/regions). Uten den finner
   * hjelperen språket selv — som rateLimitResponse, og av samme grunn: en
   * valgfri parameter hvert kallsted kunne glemme, ville latt norsk bli
   * stående der noen glemte den.
   */
  locale?: Locale;
  /** Koden til en utdypende tekst. Sendes oversatt i `details`, der klientene alt leser den. */
  detaljer?: ApiFeilKode;
  /**
   * Utviklertekst om hva kallet skulle sett ut som — ikke oversatt, og ikke
   * vist av noen klient. Aldri en feilmelding fra en leverandør.
   */
  hint?: string;
}

/**
 * Bygger feilsvaret: `{ error, code }` på leserens språk, med valgfri
 * `details` og `hint`.
 *
 *   if (!user) return apiFeil('unauthenticated', 401);
 *
 *   if (error) {
 *     loggFeil(log, 'spot_feedback.insert_failed', error);
 *     return apiFeil('feedback_save_failed', 500);
 *   }
 */
export async function apiFeil(
  kode: ApiFeilKode,
  status: number,
  valg: ApiFeilValg = {}
): Promise<NextResponse<ApiFeilSvar>> {
  const locale = valg.locale ?? (await apiSprak());
  const svar: ApiFeilSvar = { error: apiFeilTekst(kode, locale), code: kode };
  if (valg.detaljer) svar.details = apiFeilTekst(valg.detaljer, locale);
  if (valg.hint) svar.hint = valg.hint;
  return NextResponse.json(svar, { status });
}

/** Feltene i en leverandørfeil som hører hjemme i loggen. */
const LOGGFELT = ['code', 'message', 'details', 'hint', 'status'] as const;

/**
 * Den rå feilen — til loggen, aldri til klienten.
 *
 * Supabase-klienten returnerer feil som rene objekter (`{ code, message,
 * details, hint }`), ikke som `Error`. `log.error(hendelse, feil)` gjør et slikt
 * objekt om til teksten «[object Object]»: loggen sier AT noe feilet, men
 * koden og meldingen er borte — og det var nettopp de vi skulle ha når vi
 * slutter å sende dem til nettleseren. Denne legger feltene i konteksten i
 * stedet. En ekte `Error` går som før, med stakken sin.
 */
export function loggFeil(log: Pick<Logger, 'error'>, hendelse: string, feil: unknown, ctx: LogContext = {}): void {
  if (feil instanceof Error) {
    log.error(hendelse, feil, ctx);
    return;
  }
  const felt: LogContext = {};
  if (typeof feil === 'string') {
    felt.message = feil;
  } else if (feil && typeof feil === 'object') {
    for (const navn of LOGGFELT) {
      const verdi = (feil as Record<string, unknown>)[navn];
      if (typeof verdi === 'string' || typeof verdi === 'number') felt[navn] = verdi;
    }
  }
  log.error(hendelse, undefined, { ...felt, ...ctx });
}
