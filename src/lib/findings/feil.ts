import { DEFAULT_LOCALE, timeZoneForLocale, type Locale } from '@/i18n/config';
import { intlLocale } from '@/lib/utils/intl-locale';

/**
 * Feiltekstene til /api/findings-rutene — én stabil kode per feil, og teksten
 * på leserens språk.
 *
 * Rutene svarte bare på norsk («Fant ikke funnet», «Ugyldig synlighet»), og
 * klienten viser `error` rått. Tekst som lages på serveren dekkes ikke av
 * next-intl, så en svensk bruker fikk norsk beskjed hver gang noe gikk galt
 * med et funn. Koden er det klienter skal forgrene på; teksten er til å vise.
 *
 * Ren modul uten next/headers, så den kan testes og brukes fra begge sider.
 */
export const FUNN_FEIL = {
  // ── Felles ────────────────────────────────────────────────────────────────
  // Ordrett den samme som i src/lib/api/feil.ts: én kode, én tekst i hele
  // appen. Den fila leser språket fra cookies og kan ikke importeres fra en
  // ren modul som denne — testen holder de to like.
  unauthenticated: { nb: 'Du må være logget inn.', sv: 'Du måste vara inloggad.' },
  invalid_id: { nb: 'Ugyldig funn-id', sv: 'Ogiltigt fynd-id' },
  not_found: { nb: 'Fant ikke funnet', sv: 'Hittade inte fyndet' },
  feature_not_enabled: { nb: 'Funksjonen er ikke slått på ennå', sv: 'Funktionen är inte aktiverad ännu' },

  // ── Lagring av nytt funn ──────────────────────────────────────────────────
  save_failed: { nb: 'Kunne ikke lagre funnet', sv: 'Kunde inte spara fyndet' },
  invalid_body: { nb: 'Ugyldig funn', sv: 'Ogiltigt fynd' },
  invalid_latitude: { nb: 'Ugyldig breddegrad', sv: 'Ogiltig latitud' },
  invalid_longitude: { nb: 'Ugyldig lengdegrad', sv: 'Ogiltig longitud' },
  invalid_visibility: { nb: 'Ugyldig synlighet', sv: 'Ogiltig synlighet' },
  invalid_fields: { nb: 'Et eller flere felt er ugyldige', sv: 'Ett eller flera fält är ogiltiga' },
  invalid_zone_precision: { nb: 'Ugyldig sonepresisjon', sv: 'Ogiltig zonprecision' },
  zone_label_missing: { nb: 'Sonenavn mangler', sv: 'Zonnamn saknas' },
  zone_requires_approximate: { nb: 'Sonefunn må være omtrentlige', sv: 'Zonfynd måste vara ungefärliga' },
  invalid_ai_confidence: { nb: 'Ugyldig AI-konfidens', sv: 'Ogiltig AI-konfidens' },
  ai_response_too_large: { nb: 'AI-responsen er for stor', sv: 'AI-svaret är för stort' },
  // Sonevakta fikk ikke gjort funnet privat, og fjernet det i stedet — se
  // sonevakt.ts. Ingenting er delt; brukeren må lagre på nytt.
  zone_not_saved: {
    nb: 'Funnet er IKKE lagret. Sone-deling er midlertidig utilgjengelig. Lagre det som privat eller omtrentlig i stedet.',
    sv: 'Fyndet har INTE sparats. Zondelning är tillfälligt otillgänglig. Spara det som privat eller ungefärligt i stället.'
  },

  // ── Endring av eget funn ──────────────────────────────────────────────────
  update_failed: { nb: 'Kunne ikke lagre endringen. Prøv igjen.', sv: 'Kunde inte spara ändringen. Försök igen.' },
  empty_patch: { nb: 'Ingen endringer å lagre', sv: 'Inga ändringar att spara' },
  unknown_field: { nb: 'Dette feltet kan ikke endres', sv: 'Det här fältet kan inte ändras' },
  position_not_editable: {
    nb: 'Posisjonen til et funn kan ikke endres. Står funnet feil, slett det og lagre det på nytt.',
    sv: 'Positionen för ett fynd kan inte ändras. Om fyndet ligger fel, radera det och spara det på nytt.'
  },
  visibility_required: {
    nb: 'Oppgi delingsnivå sammen med soneinnstillingene',
    sv: 'Ange delningsnivå tillsammans med zoninställningarna'
  },
  unknown_species: { nb: 'Fant ikke arten', sv: 'Hittade inte arten' },
  guard_missing: {
    nb: 'Dette funnet kan ikke endres akkurat nå. Ingenting er lagret. Du kan fortsatt gjøre det privat.',
    sv: 'Det här fyndet kan inte ändras just nu. Inget har sparats. Du kan fortfarande göra det privat.'
  },
  // Sone-ruta — begge er begrunnet under «SONERUTA» i delingsendring.ts.
  zone_unavailable: {
    nb: 'Funnet er IKKE endret. Funn kan ikke gjøres om til sone-funn herfra ennå. Du kan når som helst gjøre det privat.',
    sv: 'Fyndet har INTE ändrats. Fynd kan inte göras om till zonfynd härifrån ännu. Du kan när som helst göra det privat.'
  },
  zone_size_locked: {
    nb: 'Funnet er IKKE endret. Grovheten til et sone-funn kan ikke endres etter at funnet er lagret: flere ruter for samme funn ville snevret inn hvor stedet er. Du kan når som helst gjøre det privat.',
    sv: 'Fyndet har INTE ändrats. Grovheten för ett zonfynd kan inte ändras efter att fyndet har sparats: flera rutor för samma fynd skulle snäva in var platsen är. Du kan när som helst göra det privat.'
  },
  // {tid} byttes ut av delingKaranteneTekst — bruk den, ikke denne råteksten.
  sharing_cooldown: {
    nb: 'Funnet er endret det siste døgnet. For at ingen skal kunne regne seg fram til stedet, kan det tidligst deles mer åpent igjen {tid}. Du kan når som helst gjøre det privat.',
    sv: 'Fyndet har ändrats det senaste dygnet. För att ingen ska kunna räkna ut platsen kan det tidigast delas mer öppet igen {tid}. Du kan när som helst göra det privat.'
  },

  // ── Sletting og gjenoppretting ────────────────────────────────────────────
  delete_failed: { nb: 'Kunne ikke slette funnet', sv: 'Kunde inte radera fyndet' },
  restore_failed: { nb: 'Kunne ikke gjenopprette funnet', sv: 'Kunde inte återställa fyndet' },

  // ── «details» når en migrasjon mangler ────────────────────────────────────
  // Slettingen rakk aldri å skje — si det, så brukeren ikke tror funnet er borte.
  delete_migration_missing: {
    nb: 'Funnet ditt er trygt og IKKE slettet. Denne funksjonen mangler en databaseoppdatering som ikke er kjørt ennå. Prøv igjen senere.',
    sv: 'Ditt fynd är tryggt och INTE raderat. Den här funktionen saknar en databasuppdatering som inte har körts ännu. Försök igen senare.'
  },
  restore_migration_missing: {
    nb: 'Kunne ikke gjenopprette funnet — denne funksjonen mangler en databaseoppdatering som ikke er kjørt ennå. Prøv igjen senere.',
    sv: 'Kunde inte återställa fyndet — den här funktionen saknar en databasuppdatering som inte har körts ännu. Försök igen senare.'
  },
  update_migration_missing: {
    nb: 'Funnet er IKKE endret. Denne funksjonen mangler en databaseoppdatering som ikke er kjørt ennå. Prøv igjen senere.',
    sv: 'Fyndet har INTE ändrats. Den här funktionen saknar en databasuppdatering som inte har körts ännu. Försök igen senare.'
  }
} as const satisfies Record<string, Record<Locale, string>>;

export type FunnFeilKode = keyof typeof FUNN_FEIL;

export function funnFeilTekst(kode: FunnFeilKode, locale: Locale): string {
  return FUNN_FEIL[kode][locale] ?? FUNN_FEIL[kode][DEFAULT_LOCALE];
}

/**
 * Beskjeder til et VELLYKKET kall — lagringen gikk, men ikke helt slik
 * brukeren ba om. Svaret bærer dem som `notice: { code, message }`, og
 * klientene viser `message` (resultatsiden etter AI-identifisering, og
 * funnskjemaet på kartet).
 */
export const FUNN_BESKJED = {
  // Sonevakta (sonevakt.ts): sone-ruta ville røpet mer enn ruta, så funnet ble
  // lagret som privat. Teksten forklarer ikke hullet — bare hva som skjedde.
  zone_saved_private: {
    nb: 'Funnet ble lagret som privat, fordi sone-deling er midlertidig utilgjengelig. Du kan endre delingen senere under Mine steder.',
    sv: 'Fyndet sparades som privat, eftersom zondelning är tillfälligt otillgänglig. Du kan ändra delningen senare under Mina platser.'
  }
} as const satisfies Record<string, Record<Locale, string>>;

export type FunnBeskjedKode = keyof typeof FUNN_BESKJED;

export function funnBeskjedTekst(kode: FunnBeskjedKode, locale: Locale): string {
  return FUNN_BESKJED[kode][locale] ?? FUNN_BESKJED[kode][DEFAULT_LOCALE];
}

/**
 * Teksten når en åpnere deling må vente (se delingsendring.ts), med
 * tidspunktet skrevet ut i leserens språk og tidssone — serveren står i UTC,
 * og «kl. 13:32» ville vært en time feil for alle som leser den.
 */
export function delingKaranteneTekst(tidligstMs: number, locale: Locale): string {
  const tid = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: timeZoneForLocale(locale),
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(tidligstMs));
  return funnFeilTekst('sharing_cooldown', locale).replace('{tid}', tid);
}
