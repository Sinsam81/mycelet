/**
 * Adressen en ny konto nettopp ble registrert med, husket i fanens
 * sessionStorage fra registreringsskjemaet til innloggingssiden.
 *
 * Innloggingssiden viser «Vi sendte e-posten til …» og forhåndsutfyller
 * feltet — den vanligste grunnen til at en konto aldri ble bekreftet var en
 * tastefeil i adressen, og den så brukeren aldri igjen.
 *
 * Aldri i URL-en: adresser hører ikke hjemme i historikk, logger eller
 * sidevisningsmåling. sessionStorage kan kaste (privat modus i WKWebView),
 * så alt er pakket inn og siden virker uten.
 */

const NOKKEL = 'mycelet:registrert-epost';

export function huskRegistrertEpost(epost: string): void {
  try {
    window.sessionStorage.setItem(NOKKEL, epost);
  } catch {
    // Uten lagring vises bare den generelle beskjeden.
  }
}

export function lesRegistrertEpost(): string | null {
  try {
    const verdi = window.sessionStorage.getItem(NOKKEL);
    return verdi && verdi.includes('@') && verdi.length <= 254 ? verdi : null;
  } catch {
    return null;
  }
}

export function glemRegistrertEpost(): void {
  try {
    window.sessionStorage.removeItem(NOKKEL);
  } catch {
    // Ingenting å rydde.
  }
}
