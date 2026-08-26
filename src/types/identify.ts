export interface IdentifyLookAlike {
  name: string;
  danger: string;
  speciesId?: number;
  imageUrl?: string | null;
  edibility?: string | null;
  /** Why the two get confused (similarity_description). */
  whySimilar?: string | null;
  /** How to tell them apart (difference_description) — the actionable bit. */
  howToTell?: string | null;
}

export interface IdentifySuggestion {
  name: string;
  norwegianName?: string;
  commonNames: string[];
  probability: number;
  edibility: string;
  description: string | null;
  taxonomy: Record<string, string> | null;
  similarImages: string[];
  speciesId?: number;
  /** The app's curated species photo (mushroom_species.primary_image_url). */
  imageUrl?: string | null;
  // Local context fused from the app's own data (see identify-ranking.ts)
  inSeason?: boolean;
  peakSeason?: boolean;
  nearbyFindings?: number;
  dangerousLookAlikes?: IdentifyLookAlike[];
  /**
   * Hva vi VET om forvekslingsarter for dette forslaget. Uten dette feltet
   * rendrer «ingen registrert» og «sjekket, ingen farlige» helt likt.
   */
  lookAlikeData?: 'present' | 'none_recorded' | 'unavailable';
}

export interface IdentifyResultPayload {
  /**
   * Raden i identifiseringshistorikken denne visningen hører til.
   *
   * null når historikkraden ikke ble skrevet (databasefeil — identifiseringen
   * gikk likevel bra). Da skal klienten hverken laste opp et historikkbilde
   * eller prøve å koble et lagret funn til en rad som ikke finnes.
   */
  identificationId?: string | null;
  /**
   * Stien historikkbildet skal lastes opp til i den private bøtta. Regnet ut av
   * serveren ved innsetting (den er determinert av rad-id-en), så klienten
   * slipper både et ekstra oppslag og en ekstra skriveoperasjon.
   */
  historyImagePath?: string | null;
  /**
   * Første (og viktigste) bilde — hero på resultatsiden og funnfotoet ved lagring.
   *
   * To former, med vilje:
   *   • `data:image/jpeg;base64,…` når visningen kommer rett fra en
   *     identifisering (bildet ligger fortsatt i økta)
   *   • en signert `https://…supabase.co/…`-URL når visningen er hydrert fra
   *     historikken (bildet ligger i den private bøtta)
   * Lagringsflyten må håndtere begge — se handleSave på resultatsiden.
   *
   * null kun ved hydrering fra historikken uten bevart bilde.
   */
  originalImageDataUrl: string | null;
  /**
   * Alle innsendte bilder i rekkefølge (1–3: hatt, underside, stilk).
   * Valgfri: payloads skrevet før flerbilde (åpne faner, gammel sessionStorage)
   * mangler feltet — lesere må falle tilbake til [originalImageDataUrl].
   */
  originalImageDataUrls?: string[];
  location: {
    latitude: number | null;
    longitude: number | null;
  };
  suggestions: IdentifySuggestion[];
  isPlant: boolean;
  /**
   * Satt når serveren ikke fikk lest spiselighet eller farlige
   * forvekslingsarter for ett eller flere forslag. Fraværet av en advarsel
   * betyr da IKKE at det er trygt — bare at vi ikke vet.
   */
  safetyDataIncomplete?: boolean;
  /**
   * Satt ved hydrering fra historikken når identifiseringen ALLEREDE er lagret
   * som funn. Da skal resultatsiden vise det i stedet for å invitere til en
   * duplikat-lagring.
   */
  savedFindingId?: string | null;
}
