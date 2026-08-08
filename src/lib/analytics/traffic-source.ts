/**
 * Hvor kom den besøkende fra?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVORFOR DETTE MÅLES PÅ SERVEREN, IKKE I NETTLESEREN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Landingssiden (public/landing/index.html) er den ENESTE siden en besøkende
 * utenfra ser før de registrerer seg. Da den ble produksjonsherdet, ble ALL
 * JavaScript strippet for å gjøre den rask — inkludert Google Analytics.
 *
 * Målt 2026-08-08 på det som faktisk serveres fra www.mycelet.com:
 *   antall <script>-tagger : 0
 *   nevner gtag / GA       : nei
 *
 * Google Analytics er riktig satt opp og virker — men bare på app-sidene, som
 * ligger bak innlogging. Følgen er at vi hadde 16 registrerte fremmede og NULL
 * data om hvor noen av dem kom fra. Vi visste ikke engang om det hadde vært 20
 * besøkende eller 2000.
 *
 * Å legge JavaScript tilbake på landingssiden ville kostet nettopp det den ble
 * strippet for. Og et samtykkebanner på siden folk lander på, koster
 * registreringer. Serveren ser derimot henvisningsadressen uansett — den står i
 * `Referer`-headeren på forespørselen — så målingen kan gjøres uten én byte JS.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVA SOM LOGGES, OG HVA SOM IKKE GJØR DET
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Logges:  hvilken TJENESTE de kom fra (google, facebook …) og eventuell
 *          kampanjemerking fra lenka.
 * Logges IKKE: IP-adresse, nettleserkjennetegn, informasjonskapsler, eller den
 *          fulle henvisningsadressen — bare vertsnavnet.
 *
 * Dette teller altså trafikk, det sporer ikke personer, og krever derfor ikke
 * samtykke. Det er samme opplysning enhver webserver skriver i loggen sin.
 */

export type TrafficKind = 'direkte' | 'søk' | 'sosialt' | 'henvisning' | 'intern';

export interface TrafficSource {
  /** Grov kategori — det du vil gruppere på. */
  kind: TrafficKind;
  /** Vertsnavnet de kom fra, uten www. `null` når vi ikke vet. */
  host: string | null;
  /** utm_source fra lenka, hvis satt. Overstyrer gjetningen fra verten. */
  campaign: string | null;
}

/** Søkemotorer. Substreng-treff, så «google.no» og «news.google.com» dekkes. */
const SEARCH = ['google.', 'bing.', 'duckduckgo.', 'ecosia.', 'yahoo.', 'yandex.', 'baidu.', 'startpage.', 'kvasir.'];

/**
 * Sosiale nettverk. `t.co` er X/Twitters lenkeforkorter, `lm.facebook.com` og
 * `l.facebook.com` er Facebooks — de dekkes av substrengen «facebook.».
 */
const SOCIAL = [
  'facebook.', 'fb.', 'instagram.', 't.co', 'x.com', 'twitter.',
  'linkedin.', 'lnkd.in', 'reddit.', 'pinterest.', 'tiktok.',
  'youtube.', 'snapchat.', 'threads.'
];

function stripWww(host: string): string {
  return host.replace(/^www\./, '').toLowerCase();
}

/**
 * @param referer  Innholdet i `Referer`-headeren, eller null.
 * @param ownHost  Vår egen vert, så interne klikk ikke telles som henvisninger.
 * @param utmSource `utm_source` fra adressen, hvis den finnes.
 */
export function classifyTrafficSource(
  referer: string | null | undefined,
  ownHost: string,
  utmSource?: string | null
): TrafficSource {
  const campaign = utmSource ? utmSource.slice(0, 60) : null;

  if (!referer) {
    // Ingen henvisning: skrevet inn direkte, åpnet fra en app, eller — like
    // vanlig — en side som skjuler henvisningen sin. «Direkte» er derfor et
    // gulv, ikke et mål på hvor mange som faktisk kjente adressen fra før.
    return { kind: 'direkte', host: null, campaign };
  }

  let host: string;
  try {
    host = stripWww(new URL(referer).hostname);
  } catch {
    return { kind: 'direkte', host: null, campaign };
  }

  if (host === stripWww(ownHost)) return { kind: 'intern', host, campaign };
  if (SEARCH.some((s) => host.includes(s))) return { kind: 'søk', host, campaign };
  if (SOCIAL.some((s) => host.includes(s))) return { kind: 'sosialt', host, campaign };
  return { kind: 'henvisning', host, campaign };
}
