import type { MetadataRoute } from 'next';
import { alleRegionSlugs } from '@/lib/prediction/region-slug';

/**
 * sitemap.xml — fantes ikke. `GET /sitemap.xml` ga 404 fram til 2026-08-08.
 *
 * Her står bare sider som er OFFENTLIGE og som har selvstendig verdi i et
 * søkeresultat. To grupper er bevisst utelatt:
 *
 *  · alt bak innlogging (PROTECTED_PATHS) — ville bare gitt omdirigeringer
 *  · /species/[id] og /forum/[id] — de kommer fra databasen, og et sitemap som
 *    må slå opp i Supabase ved hver forespørsel er en driftsrisiko for en
 *    gevinst vi ikke har målt. Legges til når vi vet at artssidene rangerer.
 *
 * De tre sanketips-artiklene er de viktigste oppføringene: de er skrevet for å
 * bli funnet i søk, de er lange og kildebelagte, og de er den eneste kanalen
 * som gir trafikk uten at noen betaler for den.
 */
const BASE = 'https://www.mycelet.com';

/** Artiklene i content/sanketips/, servert som rene URL-er via next.config.js. */
const SANKETIPS = ['les-terrenget', 'fem-forvekslinger', 'sopp-etter-regn'];

export default function sitemap(): MetadataRoute.Sitemap {
  const nå = new Date();

  const sider: Array<{ sti: string; prioritet: number; frekvens: 'daily' | 'weekly' | 'monthly' | 'yearly' }> = [
    { sti: '', prioritet: 1.0, frekvens: 'daily' },
    // Den delbare siden — oppdateres daglig og er hele poenget med å bli funnet.
    { sti: '/soppforhold', prioritet: 0.95, frekvens: 'daily' },
    // Soppforholdene endrer seg hver dag — det er hele produktet.
    { sti: '/calendar', prioritet: 0.8, frekvens: 'daily' },
    { sti: '/species', prioritet: 0.8, frekvens: 'weekly' },
    { sti: '/pricing', prioritet: 0.7, frekvens: 'monthly' },
    { sti: '/forum', prioritet: 0.6, frekvens: 'daily' },
    { sti: '/sikkerhet', prioritet: 0.6, frekvens: 'monthly' },
    { sti: '/datakilder', prioritet: 0.4, frekvens: 'monthly' },
    { sti: '/kontakt', prioritet: 0.4, frekvens: 'yearly' },
    // Juridiske sider: må være funnbare, men skal ikke konkurrere med innholdet.
    { sti: '/personvern', prioritet: 0.3, frekvens: 'yearly' },
    { sti: '/vilkar', prioritet: 0.3, frekvens: 'yearly' },
    { sti: '/kjopsvilkar', prioritet: 0.3, frekvens: 'yearly' }
  ];

  return [
    ...sider.map((s) => ({
      url: `${BASE}${s.sti}`,
      lastModified: nå,
      changeFrequency: s.frekvens,
      priority: s.prioritet
    })),
    ...SANKETIPS.map((slug) => ({
      url: `${BASE}/sanketips/${slug}`,
      lastModified: nå,
      changeFrequency: 'monthly' as const,
      priority: 0.9
    })),
    // Områdesidene: «soppforhold Oslo» er søket folk faktisk gjør. Slugene
    // kommer fra kodens regionliste (ingen databaseoppslag — se filhodet).
    // Kun Norge foreløpig — de svenske sidene publiseres med den svenske
    // språkrunden (se src/app/soppforhold/[omrade]/page.tsx).
    ...alleRegionSlugs('NO').map((slug) => ({
      url: `${BASE}/soppforhold/${slug}`,
      lastModified: nå,
      changeFrequency: 'daily' as const,
      priority: 0.85
    }))
  ];
}
