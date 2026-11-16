import { dagenEtter, osloDag } from '@/lib/bruk/bruksdag';
import { BEHANDLINGSFRIST_TIMER, oppsummerAapneRapporter } from '@/lib/moderation/moderering';
import type { AapneRapporterInn } from '@/lib/rapport/aapne-rapporter';

/**
 * Varselet om meldt innhold som venter: hva det sier, og når det sier «nå».
 * Ren logikk, uten I/O — brukt av de to som sender det.
 *
 * ── HVORFOR TO VARSLER I DØGNET ─────────────────────────────────────────────
 *
 * En melding i forumet sier ikke fra til noen i det den kommer inn: den
 * skrives rett fra nettleseren (useReportContent), og ingen serverkode kjører.
 * Det eneste som varsler er e-post på en fast klokke. Først var det bare
 * dagsrapporten kl. 06:00 UTC, og da kunne ventetiden til FØRSTE varsel bli
 * like lang som fristen den skulle verne: en melding kl. 06:10 sto første
 * gang i rapporten neste morgen, 23 t 50 min gammel, i gult, med «Behandle den
 * i dag». Rødt kom først morgenen etter det igjen, ved 48 timer.
 *
 * Nå går det to varsler med tolv timers mellomrom: dagsrapporten, og et kort
 * kveldsvarsel kl. 18:00 UTC (/api/cron/aapne-rapporter) som bare sendes når
 * noe venter. En melding står dermed i en e-post senest tolv timer etter at
 * den kom inn, med minst tolv timer igjen av fristen.
 *
 * ── HVA VARSELET SIER ───────────────────────────────────────────────────────
 *
 * Klokkeslettet fristen går ut — ikke bare hvor lenge meldingen har ventet,
 * som leseren selv måtte regne om. Og «nå» i stedet for «før det» når neste
 * varsel ville kommet for sent: etter fristen, eller så tett på den at det
 * ikke går an å rekke noe (HANDLINGSROM_TIMER). Da er dette den siste
 * e-posten det går an å handle på. Rødt er fortsatt forbeholdt det som ER
 * over fristen.
 *
 * Selve tellingen og døgnregelen er konsollens (oppsummerAapneRapporter og
 * BEHANDLINGSFRIST_TIMER), så e-postene og banneret på /forum/moderation
 * aldri kan være uenige om hva som er åpent eller over.
 *
 * Ingenting om HVA som er meldt eller HVEM som meldte finnes her — bare
 * antall, alder og klokkeslett.
 */

/**
 * Timer mellom to varsler: dagsrapporten 06:00 UTC og kveldsvarselet 18:00
 * UTC. Regelen for «nå» hviler på tallet, så testen i __tests__ leser
 * vercel.json og feiler hvis timeplanen og tallet skilles.
 */
export const VARSELINTERVALL_TIMER = 12;

/**
 * Så mye må det minst være igjen av fristen når et varsel kommer fram, for at
 * det skal regnes som et varsel det går an å handle på: e-posten skal leses,
 * og konsollen åpnes. Kommer NESTE varsel med mindre enn dette igjen, er det
 * dette varselet som må si «nå» — ellers var den eneste e-posten med «nå» den
 * som kom ti minutter før fristen. Tallet er valgt, ikke målt.
 */
export const HANDLINGSROM_TIMER = 3;

/** Begge e-postene går hit. Ingen andre skal ha dem. */
export const RAPPORTMOTTAKER = 'post@mycelet.com';

export interface Modereringsblokk {
  /** false når tabellen ikke svarte — da er verken tallet eller «ingen åpne» kjent. */
  maalt: boolean;
  antall: number;
  /** Hele timer den eldste åpne rapporten har ventet; null når ingen er åpne. */
  eldsteTimer: number | null;
  /** Følger konsollens egen grense (BEHANDLINGSFRIST_TIMER). */
  overFrist: boolean;
  /**
   * Når fristen for den eldste går ut: som tidspunkt (ISO), og slik e-posten
   * skriver det («i morgen kl. 08:10», norsk tid). null når ingen er åpne
   * eller alderen ikke lot seg lese.
   */
  fristUtloper: string | null;
  fristTekst: string | null;
  /**
   * E-posten skal si «nå»: fristen er ute, neste varsel ville kommet for sent
   * (etter fristen, eller med mindre enn HANDLINGSROM_TIMER igjen), eller
   * alderen er ukjent — «vet ikke» skal aldri leses som «det er tid».
   */
  haster: boolean;
  /** Satt så snart NOE venter, ikke først når fristen er ute. */
  varsel: string | null;
}

const OSLO_KLOKKE = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Oslo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

const OSLO_DATO = new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'long' });

/**
 * «i dag kl. 08:10», «i morgen kl. 08:10», «i går kl. 08:10» — eller datoen
 * når det er lenger unna. Norsk tid: rapporten lages på en server som går på
 * UTC, og et klokkeslett to timer feil er verre enn ikke noe klokkeslett.
 * Minuttet rundes ned, så tiden som står er aldri senere enn den ekte.
 */
export function fristSomTekst(frist: Date, naa: Date): string {
  const deler = OSLO_KLOKKE.formatToParts(frist);
  const del = (type: string) => deler.find((d) => d.type === type)?.value ?? '00';
  const klokke = `kl. ${del('hour')}:${del('minute')}`;

  const fristDag = osloDag(frist);
  const iDag = osloDag(naa);
  if (fristDag === iDag) return `i dag ${klokke}`;
  if (fristDag === dagenEtter(iDag)) return `i morgen ${klokke}`;
  if (dagenEtter(fristDag) === iDag) return `i går ${klokke}`;
  return `${OSLO_DATO.format(frist)} ${klokke}`;
}

/** Tallene bak «Moderering», og setningen e-postene roper med. */
export function byggModereringsblokk(inn: { aapneRapporter?: AapneRapporterInn; naa: Date }): Modereringsblokk {
  const tom = { antall: 0, eldsteTimer: null, overFrist: false, fristUtloper: null, fristTekst: null, haster: false, varsel: null };
  if (!inn.aapneRapporter) return { maalt: false, ...tom };

  const aapne = oppsummerAapneRapporter({ ...inn.aapneRapporter, naa: inn.naa });
  if (aapne.antall === 0) return { maalt: true, ...tom };

  const hva = aapne.antall === 1 ? '1 åpen rapport' : `${aapne.antall} åpne rapporter`;
  const hvem = aapne.antall === 1 ? 'den' : 'den eldste';

  const eldsteMs = inn.aapneRapporter.eldsteOpprettet ? Date.parse(inn.aapneRapporter.eldsteOpprettet) : NaN;
  if (aapne.eldsteTimer === null || Number.isNaN(eldsteMs)) {
    // Tidsstempelet lot seg ikke lese. Antallet er fortsatt sant, men uten
    // alder finnes det ingen frist å skrive — og da haster det.
    return {
      maalt: true,
      antall: aapne.antall,
      eldsteTimer: null,
      overFrist: false,
      fristUtloper: null,
      fristTekst: null,
      haster: true,
      varsel: `${hva} i forumet — fristen er ${BEHANDLINGSFRIST_TIMER} t`
    };
  }

  const fristMs = eldsteMs + BEHANDLINGSFRIST_TIMER * 3_600_000;
  const frist = new Date(fristMs);
  const fristTekst = fristSomTekst(frist, inn.naa);
  // Kommer neste varsel for sent? Det kommer om VARSELINTERVALL_TIMER, og må
  // da ha minst HANDLINGSROM_TIMER igjen av fristen. Regnet fra nå — cronen
  // kan starte noen sekunder etter klokkeslettet sitt, og handlingsrommet
  // rommer det.
  const nesteVarselForSent = fristMs - inn.naa.getTime() <= (VARSELINTERVALL_TIMER + HANDLINGSROM_TIMER) * 3_600_000;

  return {
    maalt: true,
    antall: aapne.antall,
    eldsteTimer: aapne.eldsteTimer,
    overFrist: aapne.over24t,
    fristUtloper: frist.toISOString(),
    fristTekst,
    haster: aapne.over24t || nesteVarselForSent,
    varsel: `${hva} i forumet — ${hvem} har ventet ${aapne.eldsteTimer} t, fristen på ${BEHANDLINGSFRIST_TIMER} t ${
      aapne.over24t ? 'gikk ut' : 'går ut'
    } ${fristTekst}`
  };
}

export interface Modereringsvarsel {
  /** Til emnelinja — det telefonen viser: «⚠️ 1 åpen rapport — frist i dag kl. 08:10». */
  emne: string;
  /** «Behandle den nå» / «Behandle dem før det». */
  handling: string;
  /** Moderasjonskonsollen. */
  url: string;
  /** Banneret over tallene: gult innenfor fristen, rødt over. */
  html: string;
  tekst: string;
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function konsollUrl(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mycelet.com'}/forum/moderation`;
}

/**
 * Varselet slik det står i en e-post — emne, banner og lenke — eller null når
 * ingenting venter. Samme ord i dagsrapporten og i kveldsvarselet.
 */
export function byggModereringsvarsel(mod: Modereringsblokk): Modereringsvarsel | null {
  if (!mod.varsel) return null;

  const url = konsollUrl();
  const hva = mod.antall === 1 ? '1 åpen rapport' : `${mod.antall} åpne rapporter`;
  const emne = mod.overFrist
    ? `⚠️ ${hva} over døgnfristen`
    : mod.fristTekst
      ? `⚠️ ${hva} — frist ${mod.fristTekst}`
      : `⚠️ ${hva} å behandle`;
  const handling = `Behandle ${mod.antall === 1 ? 'den' : 'dem'} ${mod.haster ? 'nå' : 'før det'}`;
  const farger = mod.overFrist
    ? 'background:#fef2f2;border:1px solid #fca5a5;color:#991b1b'
    : 'background:#fffbeb;border:1px solid #fcd34d;color:#92400e';

  return {
    emne,
    handling,
    url,
    html: `<p style="font-size:14px;line-height:1.5;margin:0 0 18px;padding:10px 12px;border-radius:8px;${farger}"><strong>⚠️ ${esc(
      mod.varsel
    )}.</strong> ${handling}: <a href="${esc(url)}" style="color:inherit">${esc(url)}</a></p>`,
    tekst: `⚠️ ${mod.varsel}.\n${handling}: ${url}`
  };
}

const SIDE = 'font-family:-apple-system,system-ui,sans-serif;color:#1f2937;max-width:520px;margin:24px auto;padding:0 16px';
const FOTNOTE = 'font-size:12px;color:#9ca3af;margin-top:24px;line-height:1.5';

/**
 * Kveldsvarselet: bare banneret og veien til konsollen. Kalles bare når noe
 * venter — er ingenting åpent, sendes det ingen e-post.
 */
export function byggKveldsvarselEpost(mod: Modereringsblokk, naa: Date): { emne: string; html: string; tekst: string } | null {
  const varsel = byggModereringsvarsel(mod);
  if (!varsel) return null;

  const dato = OSLO_DATO.format(naa);
  const forklaring =
    `Denne e-posten kommer om kvelden bare når meldt innhold venter på en avgjørelse (status pending eller reviewed) — ` +
    `samme telling og samme frist på ${BEHANDLINGSFRIST_TIMER} t som moderasjonssiden og dagsrapporten. ` +
    `Hva som er meldt, står i konsollen. Klokkeslett er norsk tid.`;

  return {
    emne: `Mycelet: ${varsel.emne}`,
    html: `<!doctype html>
<html lang="nb"><body style="${SIDE}">
  <p style="font-size:12px;color:#6b7280;margin:0">Mycelet · ${dato}</p>
  <h1 style="font-size:19px;color:#1A3409;margin:4px 0 18px">Meldt innhold venter</h1>
  ${varsel.html}
  <p style="${FOTNOTE}">${esc(forklaring)}</p>
</body></html>`,
    tekst: `Mycelet · ${dato}
Meldt innhold venter

${varsel.tekst}

${forklaring}`
  };
}

/**
 * Kveldssjekken fikk ikke lest tabellen. Stillhet om kvelden betyr «ingenting
 * venter», så en lesing som feilet får ikke se ut som stillhet.
 */
export function byggKveldsvarselIkkeMaalt(naa: Date): { emne: string; html: string; tekst: string } {
  const dato = OSLO_DATO.format(naa);
  const url = konsollUrl();
  const melding = 'Kveldssjekken fikk ikke lest åpne rapporter i forumet, så det er ikke kjent om noe venter';

  return {
    emne: 'Mycelet: ⚠️ åpne rapporter ikke målt i kveld',
    html: `<!doctype html>
<html lang="nb"><body style="${SIDE}">
  <p style="font-size:12px;color:#6b7280;margin:0">Mycelet · ${dato}</p>
  <h1 style="font-size:19px;color:#1A3409;margin:4px 0 18px">Åpne rapporter: ikke målt</h1>
  <p style="font-size:14px;line-height:1.5;margin:0 0 18px;padding:10px 12px;border-radius:8px;background:#fffbeb;border:1px solid #fcd34d;color:#92400e"><strong>⚠️ ${esc(
    melding
  )}.</strong> Se etter selv: <a href="${esc(url)}" style="color:inherit">${esc(url)}</a></p>
  <p style="${FOTNOTE}">Tabellen reports svarte ikke. Dagsrapporten i morgen tidlig prøver igjen.</p>
</body></html>`,
    tekst: `Mycelet · ${dato}
Åpne rapporter: ikke målt

⚠️ ${melding}.
Se etter selv: ${url}

Tabellen reports svarte ikke. Dagsrapporten i morgen tidlig prøver igjen.`
  };
}
