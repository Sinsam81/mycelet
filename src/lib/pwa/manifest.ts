/**
 * Hvilket PWA-manifest en bruker skal få.
 *
 * Manifestet er statisk (public/), mens resten av <head> bygges per forespørsel
 * fra brukerens locale. Uten dette valget fikk en svensk bruker som la appen på
 * hjemskjermen et installasjonskort som beskrev produktet som «Norsk soppapp»,
 * og operativsystemet fikk lang="nb" for et grensesnitt hen ser på svensk.
 *
 * Ett manifest per språk er den enkleste løsningen: manifestfilen kan ikke
 * lokaliseres av seg selv, og alt annet i den (ikoner, farger, scope) er likt.
 */
export function manifestPathForLocale(locale: string): string {
  return locale === 'sv' ? '/manifest.sv.json' : '/manifest.json';
}
