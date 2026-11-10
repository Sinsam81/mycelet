/**
 * AI-resultatet som ligger i sessionStorage mellom identify-siden og
 * resultatsiden — og hva som skal skje med det når funnet er lagret.
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
