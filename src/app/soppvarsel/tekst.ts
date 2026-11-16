import type { Metadata } from 'next';
import type { Locale } from '@/i18n/config';

/**
 * Tekstene på /soppvarsel, og statuslinja påmeldingen svarer med.
 *
 * COPY-tabell i stedet for next-intl fordi siden er en ren serverkomponent —
 * samme dokumenterte mønster som prediksjonstekstene. Skilt ut av page.tsx så
 * statuslinja kan testes, og så områdesidene (/soppforhold/[omrade]) kan vise
 * den samme linja over sitt eget påmeldingsskjema uten en kopi av tekstene.
 * Skjemaet der (VarselCta) leser også feltetiketten, samtykkesetningen og
 * lenketeksten til personvernerklæringen herfra: det er ETT samtykke, og det
 * skal ha én ordlyd uansett hvor skjemaet står.
 *
 * Teksten holder samme ærlighetslinje som selve varselet (se alerts/email.ts):
 * vi lover flanken («vi sier fra når det snur»), aldri funn.
 *
 * ── «SJEKK INNBOKSEN» MÅ VÆRE SANN OGSÅ NÅR INGENTING SENDES ────────────────
 *
 * Påmeldingsruta svarer «sendt» i fire tilfeller, og bare i ett av dem går det
 * en e-post akkurat nå: adressen kan være påmeldt fra før (stille suksess), ha
 * fått lenka for få minutter siden, eller ha nådd taket per adresse. Svaret er
 * likt med vilje — et eget svar ville røpet om adressen er abonnent. Teksten
 * sa likevel bare «Vi har sendt deg en bekreftelseslenke», så den som meldte
 * seg på to ganger (usikker på om det virket) ventet på en e-post som aldri
 * kom. Nå sier den hva som gjelder i alle fire, uten å si HVILKET.
 *
 * FORVENTNINGEN UTENOM SESONGEN. Varselet fyrer bare når et område krysser
 * terskelen, og det skjer i praksis ikke om vinteren. Kvitteringen etter
 * bekreftelse får derfor en ekstra setning når kalenderen sier desember–mai
 * (sesongtilstand). Ingenting loves om NÅR det snur.
 */

export const COPY = {
  nb: {
    // Uten merkenavnet: rot-layouten har template '%s — Mycelet'.
    metaTittel: 'Soppvarsel på e-post',
    metaBeskrivelse:
      'Få én e-post den dagen soppforholdene snur i området ditt — aldri mer enn én i uka. Gratis og uten konto. Vi lover aldri funn, bare at forholdene ligger til rette.',
    tittel: 'Soppvarselet',
    ingress:
      'Én e-post når forholdene snur i ditt område — aldri mer enn én i uka, og ingen støy imellom. Vi følger vær, sesong og skogtype hver natt, og sier fra den dagen det faktisk er nytt.',
    slikVirker: 'Slik virker det',
    punkt1: 'Hver natt regner vi ut soppforholdene (0–100) for 22 områder i Norge og Sverige.',
    punkt2: 'Du får e-post når området ditt krysser fra dårlige til gode forhold — selve omslaget, ikke en daglig rapport. Utenom sesongen kan det gå måneder mellom hver e-post.',
    punkt3: 'Maks én e-post i uka. Avmeldingslenke i hver eneste e-post.',
    forbehold:
      'Tallet gjelder et område, ikke skogen der du står — og vi lover aldri funn, bare at forholdene ligger til rette.',
    skjemaTittel: 'Meld deg på',
    epost: 'E-postadressen din',
    omrade: 'Område',
    // Første valg i nedtrekkslista, før et område er valgt. Samme ordlyd som
    // områdevalget i profilkortet for soppvarselet (SoppvarselCard).
    velgOmrade: 'Velg område …',
    norge: 'Norge',
    sverige: 'Sverige',
    knapp: 'Få soppvarsel',
    samtykke:
      'Du bekrefter påmeldingen med en lenke vi sender deg på e-post, og kan melde deg av når som helst. Adressen brukes kun til soppvarselet.',
    statusSendt:
      '📬 Sjekk innboksen! Vi har sendt en bekreftelseslenke — trykk på den, så er du påmeldt. Er du allerede påmeldt for området, eller har adressen nettopp fått en lenke, sender vi ikke en ny.',
    statusBekreftet: '✅ Da er du påmeldt! Neste gang forholdene snur i området ditt, hører du fra oss.',
    statusBekreftetUtenomSesong:
      'Akkurat nå er det utenom hovedsesongen, så det kan gå måneder før den første e-posten kommer — påmeldingen står til det snur.',
    statusUgyldig: 'Noe manglet — sjekk at e-postadressen er riktig og at du har valgt et område.',
    statusUgyldigEpost: 'E-postadressen ser ikke riktig ut — sjekk den og prøv igjen.',
    statusUgyldigLenke: 'Lenken er ugyldig eller allerede brukt. Meld deg på på nytt, så sender vi en fersk.',
    statusForMange: 'For mange forsøk herfra — prøv igjen om en time.',
    statusFeil: 'Noe gikk galt hos oss. Prøv igjen om et øyeblikk.',
    feilAdresse: 'Skrev du feil adresse? Prøv igjen.',
    harKonto: 'Har du konto i appen? Da kan du også skru på varselet under',
    profilen: 'profilen din',
    personvern: 'Personvernerklæring',
    folgX: 'Omslagene og fasiten publiseres også åpent på X —',
    folgXLenke: 'følg @mycelet'
  },
  sv: {
    metaTittel: 'Svampvarning via mejl',
    metaBeskrivelse:
      'Få ett mejl den dag svampförhållandena vänder i ditt område — aldrig mer än ett i veckan. Gratis och utan konto. Vi lovar aldrig fynd, bara att förhållandena ligger rätt.',
    tittel: 'Svampvarningen',
    ingress:
      'Ett mejl när förhållandena vänder i ditt område — aldrig mer än ett i veckan, och inget brus däremellan. Vi följer väder, säsong och skogstyp varje natt, och säger till den dag det faktiskt är nytt.',
    slikVirker: 'Så fungerar det',
    punkt1: 'Varje natt räknar vi ut svampförhållandena (0–100) för 22 områden i Norge och Sverige.',
    punkt2: 'Du får mejl när ditt område korsar från dåliga till goda förhållanden — själva omslaget, inte en daglig rapport. Utanför säsongen kan det gå månader mellan mejlen.',
    punkt3: 'Max ett mejl i veckan. Avregistreringslänk i varje mejl.',
    forbehold:
      'Talet gäller ett område, inte skogen där du står — och vi lovar aldrig fynd, bara att förhållandena ligger rätt.',
    skjemaTittel: 'Anmäl dig',
    epost: 'Din e-postadress',
    omrade: 'Område',
    velgOmrade: 'Välj område …',
    norge: 'Norge',
    sverige: 'Sverige',
    knapp: 'Få svampvarning',
    samtykke:
      'Du bekräftar anmälan med en länk vi mejlar dig, och kan avregistrera dig när som helst. Adressen används bara till svampvarningen.',
    statusSendt:
      '📬 Kolla inkorgen! Vi har mejlat en bekräftelselänk — tryck på den, så är du anmäld. Är du redan anmäld för området, eller har adressen nyss fått en länk, skickar vi ingen ny.',
    statusBekreftet: '✅ Då är du anmäld! Nästa gång förhållandena vänder i ditt område hör du från oss.',
    statusBekreftetUtenomSesong:
      'Just nu är det utanför högsäsongen, så det kan dröja månader innan det första mejlet kommer — anmälan står kvar tills det vänder.',
    statusUgyldig: 'Något saknades — kolla att e-postadressen stämmer och att du valt ett område.',
    statusUgyldigEpost: 'E-postadressen ser inte rätt ut — kolla den och försök igen.',
    statusUgyldigLenke: 'Länken är ogiltig eller redan använd. Anmäl dig igen så skickar vi en färsk.',
    statusForMange: 'För många försök härifrån — försök igen om en timme.',
    statusFeil: 'Något gick fel hos oss. Försök igen om en stund.',
    feilAdresse: 'Skrev du fel adress? Försök igen.',
    harKonto: 'Har du konto i appen? Då kan du också slå på varningen under',
    profilen: 'din profil',
    personvern: 'Integritetspolicy',
    folgX: 'Omslagen och facit publiceras också öppet på X —',
    folgXLenke: 'följ @mycelet'
  }
} as const;

const SOPPVARSEL_URL = 'https://www.mycelet.com/soppvarsel';

/**
 * Sidens metadata. Siden manglet den helt og arvet appens generelle tittel og
 * beskrivelse — selv om den står i sitemap med prioritet 0,8 og er målet for
 * varselboksene, samlesiden og landingssiden. «Soppvarsel» er både et søk og
 * en lenke folk deler.
 *
 *   · Tittelen står uten merkenavn (rot-layoutens template legger det til).
 *   · Beskrivelsen holder sidens ærlighetslinje: vi sier fra når det SNUR, og
 *     lover aldri funn.
 *   · openGraph er skrevet fullt ut. Next erstatter rot-layoutens openGraph-
 *     objekt i sin helhet, så siteName og locale må gjentas her.
 *   · Lik for alle ?status=-verdier: canonical er den rene adressen, og en
 *     kvittering skal ikke bli en egen side i et søketreff eller en deling.
 *
 * Ren funksjon av språket, så den kan testes uten cookies og headere.
 */
export function soppvarselMetadata(locale: Locale): Metadata {
  const t = COPY[locale === 'sv' ? 'sv' : 'nb'];
  return {
    title: t.metaTittel,
    description: t.metaBeskrivelse,
    alternates: { canonical: SOPPVARSEL_URL },
    openGraph: {
      title: t.metaTittel,
      description: t.metaBeskrivelse,
      url: SOPPVARSEL_URL,
      type: 'website',
      siteName: 'Mycelet',
      locale: locale === 'sv' ? 'sv_SE' : 'nb_NO'
    }
  };
}

/** Statusene rutene sender tilbake i ?status=… (pamelding og bekreft). */
export const PAMELDING_STATUSER = ['sendt', 'bekreftet', 'ugyldig', 'ugyldig-lenke', 'for-mange', 'feil'] as const;
export type PameldingStatus = (typeof PAMELDING_STATUSER)[number];

const STATUSFARGE: Record<PameldingStatus, string> = {
  sendt: 'border-forest-300 bg-forest-50 text-forest-900',
  bekreftet: 'border-forest-300 bg-forest-50 text-forest-900',
  ugyldig: 'border-amber-300 bg-amber-50 text-amber-900',
  'ugyldig-lenke': 'border-amber-300 bg-amber-50 text-amber-900',
  'for-mange': 'border-amber-300 bg-amber-50 text-amber-900',
  feil: 'border-red-300 bg-red-50 text-red-900'
};

export function erPameldingStatus(status: string | undefined | null): status is PameldingStatus {
  return (PAMELDING_STATUSER as readonly string[]).includes(status ?? '');
}

/**
 * Statuslinja for en ?status=-verdi: teksten og fargeklassene, eller null for
 * en ukjent/manglende verdi (da vises ingen linje — fri tekst fra adressefeltet
 * skal aldri bli til en melding).
 *
 * `iHovedsesong` sendes inn (sesongtilstand(new Date()).iHovedsesong i siden),
 * så funksjonen er ren og testene ikke avhenger av dagens dato.
 *
 * `omradeGitt` er true der skjemaet står på en områdeside: området er et skjult
 * felt, så «sjekk at du har valgt et område» ville sendt leseren på leting
 * etter et valg som ikke finnes. Da gjelder «ugyldig» bare adressen.
 */
export function statuslinje(
  status: string | undefined | null,
  locale: Locale,
  iHovedsesong: boolean,
  omradeGitt = false
): { tekst: string; farge: string } | null {
  if (!erPameldingStatus(status)) return null;
  const t = COPY[locale === 'sv' ? 'sv' : 'nb'];
  const tekst: Record<PameldingStatus, string> = {
    sendt: t.statusSendt,
    bekreftet: iHovedsesong ? t.statusBekreftet : `${t.statusBekreftet} ${t.statusBekreftetUtenomSesong}`,
    ugyldig: omradeGitt ? t.statusUgyldigEpost : t.statusUgyldig,
    'ugyldig-lenke': t.statusUgyldigLenke,
    'for-mange': t.statusForMange,
    feil: t.statusFeil
  };
  return { tekst: tekst[status], farge: STATUSFARGE[status] };
}

/** Statusene påmeldingsruta kan sende tilbake til en områdeside (skjemaet i VarselCta). */
const OMRADESVAR: readonly PameldingStatus[] = ['sendt', 'ugyldig', 'for-mange', 'feil'];

/**
 * Det en områdeside (/soppforhold/[omrade]) viser rundt påmeldingsskjemaet sitt
 * for en ?status=-verdi:
 *
 *   · `linje` — svaret over skjemaet, eller null når statusen ikke er et svar
 *     på skjemaet. «bekreftet» har sitt eget banner på siden, og
 *     «ugyldig-lenke» sendes aldri dit (bekreft-ruta sender den til
 *     /soppvarsel).
 *   · `visSkjema` — ikke etter «sendt»: neste steg er innboksen, og en
 *     innsending til ville bare svart det samme uten å sende noe.
 *   · `nyttForsok` — lenketeksten som står der skjemaet sto, eller null når
 *     skjemaet vises. Den som oppdager en skrivefeil i adressen sin skal ha en
 *     vei tilbake til skjemaet uten å måtte redigere adressefeltet for hånd.
 *
 * Området er gitt av siden, så «ugyldig» handler bare om adressen
 * (omradeGitt), og sesongsetningen angår ingen av disse statusene.
 */
export function omradeSvar(
  status: string | undefined | null,
  locale: Locale
): { linje: { tekst: string; farge: string } | null; visSkjema: boolean; nyttForsok: string | null } {
  const erSvar = erPameldingStatus(status) && OMRADESVAR.includes(status);
  const visSkjema = status !== 'sendt';
  return {
    linje: erSvar ? statuslinje(status, locale, true, true) : null,
    visSkjema,
    nyttForsok: visSkjema ? null : COPY[locale === 'sv' ? 'sv' : 'nb'].feilAdresse
  };
}
