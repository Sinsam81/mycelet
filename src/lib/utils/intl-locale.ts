import type { Locale } from '@/i18n/config';

/**
 * Oversetter appens språkkode til en BCP 47-tag `Intl` forstår.
 *
 * Appen bruker `nb` og `sv`. `Intl.DateTimeFormat` og `toLocaleDateString`
 * trenger `nb-NO` og `sv-SE`. Den oversettelsen var skrevet ut for hånd fire
 * steder og glemt sytten andre, så en svensk bruker leste «Medlem siden
 * desember 2025» på profilen og «15. august» i slettingsvarselet.
 *
 * Én funksjon i stedet for tjueen strengliteraler: neste utvikler som formaterer
 * en dato finner regelen i stedet for å gjenta hardkodingen.
 *
 * Merk hva dette IKKE er: en oversettelse av selve teksten. Det er `Intl` som
 * gir «augusti» i stedet for «august» — vi gir den bare riktig språkkode.
 */
export function intlLocale(locale: Locale | string): 'nb-NO' | 'sv-SE' {
  return locale === 'sv' ? 'sv-SE' : 'nb-NO';
}
