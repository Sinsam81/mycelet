import { intlLocale } from '@/lib/utils/intl-locale';

/**
 * Når et foruminnlegg eller en kommentar ble skrevet.
 *
 * Innleggene hadde ingen dato, og for soppmeldinger er det halve
 * informasjonen: «fant kantareller her» fra i fjor er noe annet enn fra i går.
 * Året står derfor alltid med.
 *
 * Fast sone (Europe/Oslo) og eksplisitt språkkode: uten dem formaterer
 * serveren i UTC og nettleseren i brukerens sone, og samme tidspunkt kan bli
 * to forskjellige dager. Ingen relativ «for 5 minutter siden» — den ville
 * vært ulik på server og klient.
 */
const SONE = 'Europe/Oslo';

function gyldig(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const dato = new Date(iso);
  return Number.isNaN(dato.getTime()) ? null : dato;
}

/** «16. nov. 2026» / «16 nov. 2026». Tom streng for en ugyldig dato. */
export function forumDato(iso: string | null | undefined, locale: string): string {
  const dato = gyldig(iso);
  if (!dato) return '';
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: SONE
  }).format(dato);
}

/** Dato og klokkeslett, til kommentarer: «16. nov. 2026, 21:05». */
export function forumTidspunkt(iso: string | null | undefined, locale: string): string {
  const dato = gyldig(iso);
  if (!dato) return '';
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: SONE
  }).format(dato);
}
