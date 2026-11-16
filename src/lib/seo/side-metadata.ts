import type { Metadata } from 'next';
import type { Locale } from '@/i18n/config';

/** Adressen sidene er kanoniske på — samme som sitemap.ts og robots.ts bruker. */
export const NETTSTED = 'https://www.mycelet.com';

/**
 * «Den adressen som faktisk ble bedt om.» Next løser en sti som starter med
 * './' mot forespørselens egen sti, og setter metadataBase foran.
 *
 * Til layouter som ligger rundt flere ruter: en fast sti der ville blitt arvet
 * av hver underside som ikke setter sin egen canonical.
 */
export const SAMME_ADRESSE = './';

interface SideMetadataInn {
  /** Stien siden er kanonisk på, med ledende skråstrek ('/calendar') — eller SAMME_ADRESSE. */
  sti: string;
  /** UTEN merkenavn — rot-layoutens mal ('%s — Mycelet') legger det på. */
  tittel: string;
  beskrivelse: string;
  locale: Locale | string;
}

/**
 * Metadata for en offentlig side med egen tittel, beskrivelse og kanonisk
 * adresse.
 *
 * Bakgrunn: /species og /calendar står i sitemap.xml med prioritet 0,8, men
 * hadde ingen egne metadata. Begge arvet rot-layoutens forsidetittel og
 * forsidebeskrivelse, uten canonical — to av de viktigste oppslagssidene sto i
 * søketreff og delinger som «Mycelet — soppkart, soppvarsel og
 * AI-soppidentifikasjon».
 *
 * Tre ting det er lett å gjøre feil, og som derfor ligger her og ikke i hver
 * side:
 *
 *  · openGraph må skrives ut i sin helhet. Next slår ikke sammen nestede
 *    objekter: en side som setter `openGraph: { title }` mister siteName,
 *    locale og type fra rot-layouten.
 *  · Adressene trenger metadataBase. Rot-layouten setter ingen, og uten den
 *    blir en sti stående som sti i canonical og og:url.
 *  · Ingen `alternates.languages`. Språket følger en cookie, ikke adressen, så
 *    norsk og svensk utgave har SAMME URL — en hreflang-lenke fra en adresse
 *    til seg selv ville vært en påstand vi ikke kan stå for.
 */
export function sideMetadata({ sti, tittel, beskrivelse, locale }: SideMetadataInn): Metadata {
  return {
    metadataBase: new URL(NETTSTED),
    title: tittel,
    description: beskrivelse,
    alternates: { canonical: sti },
    openGraph: {
      siteName: 'Mycelet',
      type: 'website',
      locale: locale === 'sv' ? 'sv_SE' : 'nb_NO',
      title: tittel,
      description: beskrivelse,
      url: sti
    }
  };
}
