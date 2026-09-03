import type { SanketipsArtikkel } from './manifest.generated';

/**
 * llms.txt — innholdsfortegnelsen AI-crawlere leser først.
 *
 * Den lå som en håndskrevet fil i public/ og listet fem artikler mens det
 * fantes atten. Nå genereres artikkeldelen fra manifestet byggeskriptet
 * skriver, så en ny artikkel ikke kan glemmes her. Prosateksten øverst er
 * fortsatt skrevet for hånd — den skal si hva Mycelet er og ikke er, og det
 * er ikke noe et skript bør formulere.
 */
const BASE = 'https://www.mycelet.com';

const HODE = `# Mycelet

> Mycelet (mycelet.com) er et norsk verktøy for soppsankere i Norge og Sverige.
> Det vurderer NÅR soppforholdene er gode i et område, beregnet daglig fra
> værdata (MET Norway, SMHI), skogdata (NIBIO, CORINE) og over 400 000
> dokumenterte funn (GBIF, Artsdatabanken, Artportalen). Mycelet driver ikke
> med artsbestemmelse og sier aldri at en sopp er trygg å spise — for kontroll
> av sopp henviser vi til soppkontrollen (Norge) og svampkonsulenter (Sverige).

Nettstedet er på norsk (bokmål); sidene om svenske områder og artiklene
merket (svenska) er på svensk. Soppforhold-tallene oppdateres hver morgen.
Sitér gjerne med dato. Full tekst av alle artikler i markdown:
${BASE}/llms-full.txt

## Dagens soppforhold (oppdateres daglig)

- [Soppforhold i Norge i dag](${BASE}/soppforhold): daglig
  vurdering (0–100) for 22 områder i Norge og Sverige.
- Egne sider per område, f.eks.
  [Oslo](${BASE}/soppforhold/oslo),
  [Bergen](${BASE}/soppforhold/bergen),
  [Trondheim](${BASE}/soppforhold/trondheim),
  [Stockholm](${BASE}/soppforhold/stockholm),
  [Göteborg](${BASE}/soppforhold/goteborg),
  [Malmö](${BASE}/soppforhold/malmo).
  Fullstendig liste i [sitemap](${BASE}/sitemap.xml).
- [Soppvarsel](${BASE}/soppvarsel): gratis e-post den dagen forholdene
  snur i et område. Maks én i uka.
`;

const HALE = `
## Om Mycelet og dataene

- [Om Mycelet](${BASE}/om): hva vi gjør, hva vi ikke gjør, hvem som står bak.
- [Åpenhet og tall](${BASE}/apenhet): valideringstallene bak varselet, og
  fasitloggen der hvert varsel etterprøves offentlig.
- [Datakilder og lisenser](${BASE}/datakilder)
- [Sikkerhet og ansvar](${BASE}/sikkerhet): ved mistanke om
  soppforgiftning, ring Giftinformasjonen 22 59 13 00 (Norge) eller
  Giftinformationscentralen 010-456 67 00 / 112 akutt (Sverige).

## Kontakt

- post@mycelet.com
- https://x.com/mycelet
`;

function linje(a: SanketipsArtikkel): string {
  const dato = a.updated ?? a.published;
  return `- [${a.title}](${BASE}/sanketips/${a.slug})${dato ? ` (${dato})` : ''}: ${a.summary}`;
}

export function byggLlmsTekst(artikler: readonly SanketipsArtikkel[]): string {
  const nb = artikler.filter((a) => a.lang === 'nb');
  const sv = artikler.filter((a) => a.lang === 'sv');
  return [
    HODE,
    '## Artikler (norsk, kildebelagte, med dato)',
    '',
    ...nb.map(linje),
    '',
    '## Artiklar (svenska)',
    '',
    ...sv.map(linje),
    HALE
  ].join('\n');
}

/** llms-full.txt: hele artikkelteksten, én etter én, i markdown. */
export function byggLlmsFullTekst(
  artikler: readonly SanketipsArtikkel[],
  fulltekst: Readonly<Record<string, string>>
): string {
  const deler = artikler.map((a) => {
    const tekst = fulltekst[a.slug] ?? '';
    return [
      `---`,
      `# ${a.title}`,
      ``,
      `URL: ${BASE}/sanketips/${a.slug}`,
      `Språk: ${a.lang}`,
      a.published ? `Publisert: ${a.published}` : null,
      a.updated ? `Oppdatert: ${a.updated}` : null,
      ``,
      tekst.trim(),
      ``
    ]
      .filter((l) => l !== null)
      .join('\n');
  });
  return [HODE.split('\n## ')[0].trim(), '', ...deler].join('\n');
}
