import { PREDICTION_TILE_REGIONS } from '@/lib/prediction/tile-regions';
import { regionSlug } from '@/lib/prediction/region-slug';
import type { Omslag } from '@/lib/x/innlegg';

/**
 * Presse-varselet — e-posten til eieren de morgenene soppvarselet slår ut.
 *
 * Presse-pitchen (docs/presse-pitch-soppvarsel.md) er bygd rundt ÉN ting:
 * den sendes på omslagsdagen, med dagens tall i emnefeltet. Det krever at
 * noen faktisk vet at det snudde i natt — og det er det maskinen vet, ikke
 * mennesket. Denne e-posten flytter kunnskapen dit den trengs: hver region
 * som snudde, med pitchen ferdig utfylt (tall, lenke, språk etter land) og
 * hvem den skal til. Eieren kopierer og sender. Ingenting sendes til noen
 * redaksjon automatisk — det er et menneskelig valg hver gang.
 *
 * Mottakeren er PRESSE_VARSEL_TIL i miljøet. Uten den finnes ikke e-posten.
 * Teksten her SKAL holdes i takt med pitchen i docs/ — det er samme ord.
 */

interface Redaksjon {
  avis: string;
  kringkasting: string;
}

/** Fra mottakerlista i docs/presse-pitch-soppvarsel.md. Adresser sjekkes før sending. */
const REDAKSJONER: Record<string, Redaksjon> = {
  Oslo: { avis: 'Aftenposten (tips@aftenposten.no)', kringkasting: 'NRK Stor-Oslo' },
  Bergen: { avis: 'Bergens Tidende (tips@bt.no)', kringkasting: 'NRK Vestland' },
  Trondheim: { avis: 'Adresseavisen (tips@adressa.no)', kringkasting: 'NRK Trøndelag' },
  Stavanger: { avis: 'Stavanger Aftenblad (tips@aftenbladet.no)', kringkasting: 'NRK Rogaland' },
  Kristiansand: { avis: 'Fædrelandsvennen (tips@fvn.no)', kringkasting: 'NRK Sørlandet' },
  Innlandet: { avis: 'Hamar Arbeiderblad / Oppland Arbeiderblad', kringkasting: 'NRK Innlandet' },
  Ålesund: { avis: 'Sunnmørsposten (tips@smp.no)', kringkasting: 'NRK Møre og Romsdal' },
  Bodø: { avis: 'Avisa Nordland (tips@an.no)', kringkasting: 'NRK Nordland' },
  Tromsø: { avis: 'Nordlys (tips@nordlys.no)', kringkasting: 'NRK Troms' },
  Stockholm: { avis: 'Dagens Nyheter / Mitt i', kringkasting: 'SVT Stockholm' },
  Göteborg: { avis: 'Göteborgs-Posten', kringkasting: 'SVT Väst' },
  Malmö: { avis: 'Sydsvenskan', kringkasting: 'SVT Skåne' },
  Uppsala: { avis: 'Upsala Nya Tidning', kringkasting: 'SVT Uppsala' },
  Umeå: { avis: 'Västerbottens-Kuriren', kringkasting: 'SVT Västerbotten' },
  Sundsvall: { avis: 'Sundsvalls Tidning', kringkasting: 'SVT Mitt' },
  Östersund: { avis: 'Östersunds-Posten', kringkasting: 'SVT Jämtland' },
  Linköping: { avis: 'Östgöta Correspondenten', kringkasting: 'SVT Öst' },
  Örebro: { avis: 'Nerikes Allehanda', kringkasting: 'SVT Örebro' }
};

/**
 * Områdenavn som leseren vil tolke videre enn boksen faktisk er. «Innlandet»
 * er hos oss en rute rundt Hamar–Elverum, ikke fylket — en journalist i HA
 * leser fylket. Presisjonen er hele troverdigheten i pitchen.
 */
const OMRAADE_PRESIST: Record<string, string> = {
  Innlandet: 'Hamar–Elverum-området (Mycelets «Innlandet»-område)'
};

function omraadeNavn(region: string): string {
  return OMRAADE_PRESIST[region] ?? region;
}

const UKEDAG = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

function pitchNb(o: Omslag, url: string): { emne: string; tekst: string } {
  return {
    emne: `Soppforholdene i ${o.region} er ${o.til} av 100 i dag — gratis varsel med offentlig fasit`,
    tekst: `Hei redaksjonen,

Kort tips i soppsesongen: forholdene i ${omraadeNavn(o.region)} snudde i natt — fra ${o.fra} til ${o.til} av 100 den siste uka, ifølge Mycelets daglige beregning. Tallet er vær, jordfuktighet, temperatur og sesong for området, og det ligger åpent her, uten innlogging:

${url}

Det som er nytt i år, og som kanskje er en sak: Mycelet tilbyr et gratis soppvarsel på e-post — én melding den dagen forholdene snur i leserens område, aldri mer enn én i uka, ingen konto nødvendig. Og hvert varsel får en offentlig fasit: funntall fra Artsobservasjoner uken etter varselet mot uken før, publisert uansett utfall på mycelet.com/apenhet. Så vidt vi vet er det ingen andre som publiserer fasit på soppvarsler.

Tjenesten er bygd på åpne data (Meteorologisk institutt, NIBIO, Artsdatabanken og GBIF — 428 000 registrerte soppfunn) og dekker 22 områder i Norge og Sverige. Den lover aldri funn, og sier aldri at en sopp er trygg å spise — det er et bevisst valg vi gjerne forklarer.

Svarer gjerne på spørsmål på e-post, og kan sende skjermbilder eller tall for flere områder om det er nyttig.

Vennlig hilsen
Mycelet
post@mycelet.com · mycelet.com`
  };
}

function pitchSv(o: Omslag, url: string): { emne: string; tekst: string } {
  return {
    emne: `Svampförhållandena i ${o.region} är ${o.til} av 100 i dag — gratis varning med offentligt facit`,
    tekst: `Hej redaktionen,

Ett kort tips mitt i svampsäsongen: förhållandena i ${omraadeNavn(o.region)} vände i natt — från ${o.fra} till ${o.til} av 100 den senaste veckan, enligt Mycelets dagliga beräkning. Siffran bygger på väder, markfuktighet, temperatur och säsong för området, och ligger öppet här utan inloggning:

${url}

Det nya i år, och kanske en artikel: Mycelet erbjuder en gratis svampvarning via mejl — ett meddelande den dag förhållandena vänder i läsarens område, aldrig mer än ett i veckan, inget konto behövs. Och varje varning får ett offentligt facit: fyndantal från Artportalen/GBIF veckan efter varningen mot veckan innan, publicerat oavsett utfall på mycelet.com/apenhet. Såvitt vi vet publicerar ingen annan facit på svampvarningar.

Tjänsten bygger på öppna data (SMHI, Artdatabanken och GBIF — över 400 000 registrerade svampfynd) och täcker 22 områden i Sverige och Norge. Den lovar aldrig fynd, och säger aldrig att en svamp är säker att äta — ett medvetet val vi gärna förklarar.

Svarar gärna på frågor via mejl, och kan skicka skärmbilder eller siffror för fler områden om det är till nytta.

Vänliga hälsningar
Mycelet
post@mycelet.com · mycelet.com`
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function byggPresseVarsel(omslag: Omslag[], datoIso: string, appUrl = 'https://www.mycelet.com') {
  const ukedag = UKEDAG[new Date(`${datoIso}T00:00:00Z`).getUTCDay()];
  const godDag = ['tirsdag', 'onsdag', 'torsdag'].includes(ukedag);
  const timing = godDag
    ? `I dag er ${ukedag} — send før kl. 10, så treffer du redaksjonsmøtene.`
    : `I dag er ${ukedag}. Beste dager er tirsdag–torsdag før kl. 10 — vurder å vente, men hent da et ferskt tall fra /soppforhold samme morgen.`;

  const blokker = omslag.map((o) => {
    const region = PREDICTION_TILE_REGIONS.find((r) => r.name === o.region);
    const url = `${appUrl}/soppforhold/${regionSlug(o.region)}`;
    const pitch = region?.country === 'SE' ? pitchSv(o, url) : pitchNb(o, url);
    const red = REDAKSJONER[o.region];
    const mottakere = red
      ? `${red.avis} · ${red.kringkasting}`
      : 'regionavis + distriktskontor — se docs/presse-pitch-soppvarsel.md';
    return { o, url, pitch, mottakere };
  });

  const emne = `Omslag i dag: ${omslag.map((o) => o.region).join(', ')} — send pitchen`;

  const html = `<!doctype html>
<html lang="nb">
  <body style="font-family: -apple-system, system-ui, sans-serif; color: #1f2937; max-width: 640px; margin: 24px auto; padding: 0 16px;">
    <h1 style="font-size: 20px; color: #1A3409;">🍄 Soppvarselet slo ut i natt — presse-vinduet er åpent</h1>
    <p style="font-size: 14px;">${escapeHtml(timing)}</p>
    <p style="font-size: 13px; color: #4b5563;">Sjekk e-postadressen på redaksjonens nettside før du sender. Én e-post per redaksjon. Hele oppskriften: docs/presse-pitch-soppvarsel.md.</p>
${blokker
  .map(
    ({ o, url, pitch, mottakere }) => `
    <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;">
    <h2 style="font-size: 17px; color: #1A3409;">${escapeHtml(o.region)}: ${o.fra} → ${o.til} av 100</h2>
    <p style="font-size: 13px;"><a href="${url}">${url}</a></p>
    <p style="font-size: 13px;"><strong>Til:</strong> ${escapeHtml(mottakere)}</p>
    <p style="font-size: 13px;"><strong>Emne:</strong> ${escapeHtml(pitch.emne)}</p>
    <pre style="white-space: pre-wrap; font-family: inherit; font-size: 13px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px;">${escapeHtml(pitch.tekst)}</pre>`
  )
  .join('')}
    <p style="font-size: 12px; color: #9ca3af; margin-top: 28px;">Mycelet — automatisk presse-varsel til eieren. Ingenting er sendt til noen redaksjon.</p>
  </body>
</html>`;

  const tekst = `Soppvarselet slo ut i natt — presse-vinduet er åpent

${timing}
Sjekk e-postadressen på redaksjonens nettside før du sender. Én e-post per redaksjon.

${blokker
  .map(
    ({ o, url, pitch, mottakere }) => `------------------------------
${o.region}: ${o.fra} → ${o.til} av 100
${url}
Til: ${mottakere}
Emne: ${pitch.emne}

${pitch.tekst}
`
  )
  .join('\n')}
Mycelet — automatisk presse-varsel til eieren. Ingenting er sendt til noen redaksjon.`;

  return { emne, html, tekst };
}
