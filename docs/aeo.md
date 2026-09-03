# AEO — svarmotor-optimalisering (status og gjøremål)

Skrevet 2026-09-03. AEO (Answer Engine Optimization) er å bli *sitert* som
svar av ChatGPT, Perplexity, Google AI-oversikter og Bing Copilot, ikke bare
rangert som en blå lenke. Tre ting kreves: maskinene får lese, de forstår hva
siden er, og teksten gir et svar de kan løfte ut.

## Gjort (verifisert)

| Tiltak | Hvor |
|---|---|
| robots.txt tillater alle roboter, ingen AI-sperrer | `src/app/robots.ts` |
| `llms.txt` generert fra artikkelmanifestet — alle 18 artikler, med dato | `src/app/llms.txt/route.ts`, `src/lib/sanketips/llms.ts` |
| `llms-full.txt` med hele artikkelteksten i markdown | `src/app/llms-full.txt/route.ts` |
| sitemap.xml fra samme manifest, med ekte `lastmod` og hreflang-par | `src/app/sitemap.ts` |
| FAQPage-schema på alle 18 artikler, generert fra en synlig «Spørsmål og svar»-seksjon | `scripts/build-articles.mjs`, `content/sanketips/*.md` |
| FAQPage + Organization + WebSite på forsiden (nb og sv) | `public/landing/index*.html` |
| Én Organization-definisjon med `sameAs` (X) på alle sider | `src/lib/seo/organisasjon.ts` |
| «Om Mycelet»-side med AboutPage-schema | `src/app/om/page.tsx` |
| Vaktest: manifest = mappa, FAQ overalt, ingen drift i Organization | `src/lib/sanketips/__tests__/manifest.test.ts` |

Områdesidene (`/soppforhold/<omrade>`) leverte allerede tall, dato og
forklaring i ren HTML uten JavaScript — det er den viktigste forutsetningen,
for AI-crawlere kjører ikke JavaScript.

## Regler for nye artikler

1. Skriv markdown i `content/sanketips/`. Frontmatter: `published`, `updated`,
   `slug`, `kicker`, `summary`, og `lang: sv` + `alternate: <slug>` for
   søsterspråk.
2. Avslutt med en H2 **«Spørsmål og svar»** (sv: «Frågor och svar») med
   H3-spørsmål og ett avsnitt svar hver, minst to. Svarene skal være hentet
   fra artikkelen — aldri nye påstander. Det er samme innhold i to formater;
   byggeskriptet gjør det til FAQPage-schema.
3. Kjør `node scripts/build-articles.mjs`. Det skriver HTML, manifest og
   fulltekst. Commit alt. Sitemap og llms.txt oppdaterer seg selv.
4. `npm run test -- src/lib/sanketips` sier fra hvis noe mangler.

## Gjenstår — krever kontoer (eieren)

**Bing Webmaster Tools.** ChatGPT bruker Bings indeks. Om mycelet.com er
indeksert der er ikke verifisert.

1. Gå til bing.com/webmasters og logg inn (Microsoft-konto, kan være Google-kontoen).
2. Velg **«Importer fra Google Search Console»** — da slipper du ny
   verifisering, og sitemap følger med.
3. Sjekk under «Nettstedutforsker» at forsiden, `/soppforhold` og
   `/sanketips/…` er indeksert. Er de ikke det etter en uke: «Send inn
   URL-er» manuelt.

**Google Search Console.** Etter deploy: be om indeksering av `/om` og de
tolv artiklene som ikke sto i sitemap før (URL-inspeksjon → «Be om
indeksering»). Sjekk «Forbedringer» for at FAQ-schemaet leses uten feil.

**Validering.** Lim en artikkel-URL inn i validator.schema.org og i Googles
test for gode resultater (search.google.com/test/rich-results). Begge skal
vise Article + FAQPage uten feil.

## Bevisst ikke gjort

- Ingen JavaScript på landingssiden eller artiklene. Alt schema er statisk.
- Ingen `speakable`-schema: Google bruker det bare for nyhetsutgivere.
- Ingen IndexNow ennå. Kan legges til hvis Bing-indekseringen viser seg treg.
