/**
 * Mycelet som schema.org-Organization — ÉN definisjon for alle sidene.
 *
 * `sameAs` er det svarmotorer (Google AI-oversikter, ChatGPT, Perplexity)
 * bruker for å knytte nettstedet til en identitet utenfor det. Uten den er
 * «Mycelet» bare et ord på en side; med den er det en aktør med en konto de
 * kan slå opp. Legg til flere profiler her etter hvert som de finnes.
 *
 * scripts/build-articles.mjs kan ikke importere TypeScript og har derfor en
 * kopi. Testen i src/lib/sanketips/__tests__/manifest.test.ts sjekker at de
 * bygde artiklene bærer nøyaktig disse verdiene, så kopiene ikke driver.
 */
export const ORGANISASJON = {
  '@type': 'Organization',
  name: 'Mycelet',
  url: 'https://www.mycelet.com',
  logo: 'https://www.mycelet.com/icons/icon-512.png',
  email: 'post@mycelet.com',
  sameAs: ['https://x.com/mycelet']
} as const;
