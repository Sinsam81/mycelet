import { timeZoneForLocale } from '@/i18n/config';
import { osloIDag } from '@/lib/api/oslo-dag';
import { dagerMellom } from '@/lib/billing/prove-paaminnelse-app';
import { intlLocale } from './intl-locale';

/** Nøklene i Home-navnerommet som tidsangivelsen bruker. */
export type TidSidenNokkel = 'timeAgoToday' | 'timeAgoYesterday' | 'timeAgoDays' | 'timeAgoWeeks';

/** Det som trengs av next-intl-oversetteren: forsiden sender sin egen `t`. */
export type TidSidenOversetter = (nokkel: TidSidenNokkel, verdier?: Record<string, number>) => string;

/**
 * Når et funn ble gjort, slik lista «Siste funn fra fellesskapet» på forsiden
 * viser det: «i dag», «i går», «for 3 dager siden», «for 2 uker siden» — og
 * datoen fra 30 dager og eldre.
 *
 * HVORFOR KALENDERDAGER I OSLO
 * Forsiden rendres på en server i UTC. Dagene ble regnet som timer delt på 24
 * og rundet av, så et funn fra kl. 23.30 i går ble «i dag» kl. 08 neste
 * morgen, og et funn fra kl. 00.30 ble «i går» samme kveld. Datoen for eldre
 * funn ble formatert i UTC: et funn like over midnatt norsk tid fikk
 * gårsdagens dato. Nå teller vi Oslo-datoer (oslo-dag.ts — Norge og Sverige
 * deler sone), og datoen formateres i leserens tidssone, som på /mine-steder.
 *
 * Uker først fra 14 dager: 7–10 dager ga «for 1 uker siden» / «för 1 veckor
 * sedan», og meldingene har ingen entallsform.
 *
 * Et tidspunkt litt fram i tid (klokka på telefonen går for fort) er «i dag»,
 * ikke «for -1 dager siden». Tidspunktet sendes inn, så testene aldri avhenger
 * av dagens dato.
 */
export function formatTimeAgo(iso: string, t: TidSidenOversetter, locale: string, naa: Date = new Date()): string {
  const funnet = new Date(iso);
  if (!Number.isFinite(funnet.getTime())) return '';

  const days = dagerMellom(osloIDag(funnet).dato, osloIDag(naa).dato);
  if (days <= 0) return t('timeAgoToday');
  if (days === 1) return t('timeAgoYesterday');
  if (days < 14) return t('timeAgoDays', { days });
  if (days < 30) return t('timeAgoWeeks', { weeks: Math.round(days / 7) });
  return funnet.toLocaleDateString(intlLocale(locale), {
    day: '2-digit',
    month: 'short',
    timeZone: timeZoneForLocale(locale)
  });
}
