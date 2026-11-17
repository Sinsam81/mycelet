/**
 * AI-resultatet som ligger i sessionStorage mellom identify-siden og
 * resultatsiden — når posisjonen i det ble målt (medPosisjonstid, nederst), og
 * hva som skal skje med det når funnet er lagret.
 *
 * Feilen dette retter: nøkkelen ble aldri ryddet etter en vellykket lagring.
 * Gikk brukeren tilbake fra kartet, leste resultatsiden den samme payloaden
 * på nytt og tilbød «Lagre som funn» én gang til — ett trykk fra et
 * duplikatfunn av samme sopp fra samme bilde.
 *
 * Resultatet beholdes (brukeren kan fortsatt se hva AI-en foreslo), men
 * merkes med `savedFindingId`. Det er det samme feltet historikkvisningen
 * setter, så resultatsiden viser «allerede lagret» i stedet for lagre-knappen.
 * Kan det ikke merkes — funn-ID-en mangler, eller lageret er fullt — fjernes
 * det heller: en tilbake-navigering lander da på identify-siden, som er bedre
 * enn en ny lagre-knapp.
 */

/** Nøkkelen identify-siden skriver og resultatsiden leser. */
export const OKT_RESULTAT_NOKKEL = 'identifyResult';

type Lager = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function merkOktresultatSomLagret(
  lager: Lager,
  lagret: {
    /** Historikkraden visningen som ble lagret hører til (null = ingen rad). */
    identificationId: string | null | undefined;
    /** Funnet som ble opprettet. null når /api/findings ikke ga en ID tilbake. */
    findingId: string | null | undefined;
    /**
     * Sann når visningen kom rett fra økta (ingen ?id=). Da ER det lagrede
     * resultatet det som ble lagret. Fra historikken (?id=) gjelder det bare
     * hvis raden er den samme — ellers ligger det en ANNEN, ulagret
     * identifisering i økta, og den skal få stå.
     */
    fraOkta: boolean;
  }
): void {
  try {
    const raa = lager.getItem(OKT_RESULTAT_NOKKEL);
    if (!raa) return;

    let iOkta: Record<string, unknown>;
    try {
      const tolket: unknown = JSON.parse(raa);
      if (tolket == null || typeof tolket !== 'object') throw new Error('ikke et objekt');
      iOkta = tolket as Record<string, unknown>;
    } catch {
      // Uleselig innhold kan uansett ikke vises — rydd.
      lager.removeItem(OKT_RESULTAT_NOKKEL);
      return;
    }

    const sammeRad =
      lagret.identificationId != null && iOkta.identificationId === lagret.identificationId;
    if (!lagret.fraOkta && !sammeRad) return;

    if (!lagret.findingId) {
      lager.removeItem(OKT_RESULTAT_NOKKEL);
      return;
    }
    try {
      lager.setItem(OKT_RESULTAT_NOKKEL, JSON.stringify({ ...iOkta, savedFindingId: lagret.findingId }));
    } catch {
      lager.removeItem(OKT_RESULTAT_NOKKEL);
    }
  } catch {
    // sessionStorage kan være sperret (privat modus). Funnet ER lagret; dette
    // er bare opprydding og skal aldri kunne felle lagringsflyten.
  }
}

/**
 * Når ble posisjonen i resultatet målt? Fixets eget tidsstempel — men aldri
 * senere enn da appen fikk posisjonen.
 *
 * Resultatsiden regner posisjonens alder fra `location.timestamp`
 * (maaltTidspunkt i src/lib/findings/resultatposisjon.ts) og bruker den uten
 * å spørre bare de første ti minuttene. Uten tidsstempelet regnet den fra da
 * den selv leste resultatet. Men i iOS-skallet ser GPS-pluginen bort fra
 * maximumAge, og CoreLocation kan svare med en posisjon fra en time siden —
 * den gikk da gjennom som «for under ett minutt siden», og funnet ble lagret
 * der telefonen sist hadde en posisjon, ikke der soppen sto.
 *
 * Taket er mottakstiden fordi tidsstempelet og enhetens klokke ikke alltid er
 * samme klokke: på Android kan en GPS-måling bære satellittenes tid (se
 * src/lib/map/fersk-posisjon.ts). Går enhetens klokke for sakte, ville et
 * tidsstempel «i framtiden» gjort posisjonen yngre enn den er, så lenge
 * siden er åpen. Med taket blir alderen aldri kortere enn tiden siden appen
 * fikk posisjonen. Går klokka for fort, blir alderen for lang og brukeren
 * spurt — den veien er det trygt å ta feil.
 *
 * @param fixTidsstempel ms siden epoken, fra plattformen (MaaltFix.timestamp)
 * @param mottattMs      enhetens klokke i det posisjonen kom fram
 * @returns undefined når plattformen ikke ga et brukbart tidsstempel — da
 *          faller resultatsiden tilbake på sin egen, omtrentlige tid
 */
export function posisjonstid(fixTidsstempel: number | null | undefined, mottattMs: number): number | undefined {
  if (typeof fixTidsstempel !== 'number' || !Number.isFinite(fixTidsstempel) || fixTidsstempel <= 0) return undefined;
  if (!Number.isFinite(mottattMs)) return undefined;
  return Math.min(fixTidsstempel, mottattMs);
}

/**
 * Resultatet slik identify-siden legger det i økta: med posisjonens måletid i
 * `location.timestamp` når plattformen ga en (se posisjonstid). Uten posisjon,
 * eller uten et brukbart tidsstempel, er resultatet uendret.
 */
export function medPosisjonstid<T extends { location: { latitude: number | null; longitude: number | null } }>(
  resultat: T,
  fix: { timestamp?: number | null } | null | undefined,
  mottattMs: number
): T {
  const maaletid = posisjonstid(fix?.timestamp, mottattMs);
  if (maaletid === undefined || resultat.location.latitude == null || resultat.location.longitude == null) {
    return resultat;
  }
  return { ...resultat, location: { ...resultat.location, timestamp: maaletid } };
}
