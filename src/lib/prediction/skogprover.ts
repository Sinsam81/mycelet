/**
 * Hvor i en rute skogen slås opp.
 *
 * HVORFOR
 * Rasteret (nattjobben i /api/cron/generate-tiles) og de levende rutenettene
 * (/api/prediction/grid og /api/prediction/species-spots) slo opp skog i ETT
 * punkt per rute — midtpunktet — og kastet hele ruta når det punktet ikke var
 * skog. SR16 og CORINE er punktoppslag, så en rute der midtpunktet traff et
 * vann, fjorden, et jorde, en vei eller et boligfelt forsvant, selv om resten
 * av ruta var skog. På Oslo-kartet 15. sep 2026 sto det hull midt i tydelig
 * skogkledd terreng: Nesoddens østside (rutene 59,84/10,71 og 59,78/10,71
 * manglet mens 10,65 var med), øst for Lørenskog og rundt Enebakk.
 *
 * REGELEN
 * Midtpunktet først. Bommer det, prøves de fire kvadrantsentrene (±steg/4 i
 * bredde- og lengdegrad) i fast rekkefølge, og første treff vinner. Ruta
 * beholder sitt eget midtpunkt og sin plass i rutenettet — det er bare
 * SKOGDATAENE som kommer fra det forskjøvne punktet, og kalleren skal si fra
 * hvor de er målt. Treffer ingen av de fem punktene skog, er ruta fortsatt et
 * ærlig hull (innsjøer, fjorden og bysentrum blir stående tomme).
 *
 * Kvadrantsentrene ligger inne i ruta (±steg/2 er kanten), så et forskjøvet
 * treff er aldri lånt fra naboruta.
 *
 * Modulen gjør ingen nettverkskall selv — oppslaget sendes inn — så den kan
 * testes uten NIBIO og brukes likt av alle tre banene og av målescriptet
 * scripts/dekning-rutenett.mjs.
 */

import { haversineKm } from '@/lib/utils/geo-distance';

export interface Punkt {
  lat: number;
  lng: number;
}

export type Skogprovekilde = 'senter' | 'forskjovet';

/** Fem desimaler (~1 m), samme presisjon som rutenettene lagrer. */
function rund(verdi: number): number {
  return Number(verdi.toFixed(5));
}

/**
 * Prøvepunktene for én rute: midtpunktet først, så de fire kvadrantsentrene i
 * rekkefølgen nordvest, nordøst, sørvest, sørøst.
 *
 * `stegLng` kan avvike fra `stegLat` — de levende rutenettene deler en boks i
 * n×n, og der er rutene sjelden kvadratiske i grader.
 */
export function skogprovepunkter(senter: Punkt, stegLat: number, stegLng: number = stegLat): Punkt[] {
  const dLat = stegLat / 4;
  const dLng = stegLng / 4;
  return [
    senter,
    { lat: rund(senter.lat + dLat), lng: rund(senter.lng - dLng) },
    { lat: rund(senter.lat + dLat), lng: rund(senter.lng + dLng) },
    { lat: rund(senter.lat - dLat), lng: rund(senter.lng - dLng) },
    { lat: rund(senter.lat - dLat), lng: rund(senter.lng + dLng) }
  ];
}

export interface Skogprove<F> {
  /** Skogdataene, eller null når ingen av de prøvde punktene var skog. */
  skog: F | null;
  kilde: Skogprovekilde | null;
  /** Punktet skogdataene faktisk er målt i. */
  punkt: Punkt | null;
  /**
   * Midtpunktet bommet, og minst ett forskjøvet punkt ble IKKE prøvd fordi
   * kalleren sa stopp (tak eller tidsfrist). Ruta kan altså ha skog vi ikke
   * så etter — skal telles og logges, aldri forsvinne stille.
   */
  avkortet: boolean;
}

/**
 * Hvor langt fra rutas midtpunkt — der nåla og popupen står — skogdataene er
 * målt, i km. Til `distanceKm` i forklaringsteksten (prediction-explanation.ts).
 *
 * `null` når skogen er målt i selve midtpunktet, og BARE da: tekstbyggeren
 * skriver «Skog her» for null, mens 0 ville blitt «Nærmeste skogdata (100 m
 * unna)». Kom skogen fra et kvadrantsenter, er den målt et stykke unna nåla —
 * ~1,9 km i rasteret, og flere km i de levende rutenettene der rutene er store
 * (35 km radius delt i 7×7 gir ~3,5 km) — og da skal avstanden stå i setningen.
 */
export function skogavstandKm(senter: Punkt, prove: Pick<Skogprove<unknown>, 'kilde' | 'punkt'>): number | null {
  if (prove.kilde !== 'forskjovet' || !prove.punkt) return null;
  return haversineKm(senter.lat, senter.lng, prove.punkt.lat, prove.punkt.lng);
}

export interface Skogprovestatistikk {
  ruter: number;
  /** Ruter med skog i midtpunktet — det samme som den gamle regelen beholdt. */
  senter: number;
  /** Ruter som ble reddet av et forskjøvet punkt. */
  forskjovet: number;
  /** Ruter uten skog i noe prøvd punkt (inklusive de avkortede). */
  utenSkog: number;
  /** Antall forskjøvne oppslag som faktisk ble gjort. */
  ekstraOppslag: number;
  /** Ruter der forskyvningen ble stoppet før alle punktene var prøvd. */
  avkortet: number;
}

export interface SkogproveValg {
  /** Samtidige oppslag. Samme tall i begge fasene. */
  samtidighet: number;
  /**
   * Spørres rett før HVERT forskjøvne oppslag. `false` stopper forskyvningen
   * for den ruta, og ruta telles som avkortet. Taket og tidsfristen eies av
   * kalleren — nattjobben og de levende rutene har helt ulike budsjetter.
   */
  tillatForskyvning?: () => boolean;
  /** Kalles én gang når alle midtpunktene er slått opp, før forskyvningen starter. */
  vedSenterFerdig?: () => void;
}

async function medBegrensning<T, R>(items: readonly T[], grense: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const resultater: R[] = new Array(items.length);
  let peker = 0;
  async function arbeider() {
    while (peker < items.length) {
      const idx = peker++;
      resultater[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, grense), items.length) }, arbeider));
  return resultater;
}

/**
 * Slå opp skog for en liste ruter etter regelen over.
 *
 * To faser, med vilje: ALLE midtpunktene slås opp først, akkurat som før.
 * Forskyvningen kommer bare i tillegg, så et tak eller en frist kan aldri koste
 * en rute den gamle regelen ville beholdt.
 *
 * Forskyvningen går i RUNDER: første kvadrantsenter for alle ruter som bommet,
 * så det andre for dem som fortsatt mangler, og så videre. Hver rute prøver
 * punktene i samme rekkefølge og stopper ved første treff, så uten tak blir
 * resultatet det samme som rute for rute. Med tak er rundene mye bedre bruk av
 * oppslagene: en rute med mye skog treffer som regel på første forsøk, mens et
 * ærlig hull (en innsjø) alltid koster alle fire — rute for rute ville taket gått
 * til de første rutene i rutenettet, hullene inkludert, og de siste fått ingen.
 */
export async function provSkogIRuter<F>(
  ruter: readonly Punkt[],
  steg: { lat: number; lng: number },
  oppslag: (punkt: Punkt) => Promise<F | null>,
  valg: SkogproveValg
): Promise<{ prover: Skogprove<F>[]; statistikk: Skogprovestatistikk }> {
  const senterSvar = await medBegrensning(ruter, valg.samtidighet, (rute) => oppslag(rute));
  const prover: Skogprove<F>[] = ruter.map((rute, i) =>
    senterSvar[i] != null
      ? { skog: senterSvar[i], kilde: 'senter', punkt: rute, avkortet: false }
      : { skog: null, kilde: null, punkt: null, avkortet: false }
  );
  valg.vedSenterFerdig?.();

  let aktive = prover.flatMap((p, i) => (p.skog == null ? [i] : []));
  let ekstraOppslag = 0;
  for (let forsok = 1; forsok <= 4 && aktive.length > 0; forsok++) {
    const neste: number[] = [];
    await medBegrensning(aktive, valg.samtidighet, async (i) => {
      if (valg.tillatForskyvning && !valg.tillatForskyvning()) {
        prover[i] = { ...prover[i], avkortet: true };
        return;
      }
      ekstraOppslag++;
      const punkt = skogprovepunkter(ruter[i], steg.lat, steg.lng)[forsok];
      const skog = await oppslag(punkt);
      if (skog != null) prover[i] = { skog, kilde: 'forskjovet', punkt, avkortet: false };
      else neste.push(i);
    });
    // Svarene kommer i vilkårlig rekkefølge; neste runde går i rutenettets.
    aktive = neste.sort((a, b) => a - b);
  }

  const senter = prover.filter((p) => p.kilde === 'senter').length;
  const forskjovet = prover.filter((p) => p.kilde === 'forskjovet').length;
  return {
    prover,
    statistikk: {
      ruter: ruter.length,
      senter,
      forskjovet,
      utenSkog: ruter.length - senter - forskjovet,
      ekstraOppslag,
      avkortet: prover.filter((p) => p.avkortet).length
    }
  };
}

/**
 * De levende rutenettene (/api/prediction/grid og /api/prediction/species-spots):
 * hvor lenge etter at skogoppslagene startet et forskjøvet punkt fortsatt får
 * begynne. Et friskt NIBIO svarer på et par titalls ms, så forskyvningen er
 * ferdig lenge før dette. En treg eller nede tjeneste har brukt opp vinduet på
 * midtpunktene alene (2,5 s timeout × fire runder), og da skal vi ikke
 * firedoble belastningen på den mens brukeren venter.
 */
export const FORSKYVNINGSVINDU_LEVENDE_MS = 6_000;

/** Rom for det som kommer etter at en rute er ferdig: vær, sletting, innsetting. */
export const SKOGPROVE_MS_PER_REGION = 3_000;
/**
 * Slakk mot maxDuration. Dekker oppslag som alt er i gang når fristen passeres
 * (SR16 har 8 s timeout, CORINE 4 s) og oppryddingen til slutt.
 */
export const SKOGPROVE_SIKKERHETSMARGIN_MS = 30_000;

/**
 * Siste tidspunkt (epoch ms) nattjobben kan STARTE et forskjøvet oppslag.
 *
 * Regionene skrives inne i løkka, så en timeout tar bare de som ikke rakk å
 * kjøre. Forskyvningen er en bonus og skal aldri være grunnen til det: fristen
 * holder av tid til midtpunktene i alle regionene som gjenstår (med farten
 * målt i denne kjøringen), skrivingen av dem og denne, og en sikkerhetsmargin.
 */
export function skogproveFrist(input: {
  startetMs: number;
  maxDurationMs: number;
  /** Ruter i regionene som IKKE er påbegynt ennå. */
  gjenstaendeRuter: number;
  /** Målt tid per midtpunkt-rute i denne kjøringen (vegg-klokke, med samtidighet). */
  msPerRute: number;
  /** Regioner som ikke er påbegynt ennå. */
  gjenstaendeRegioner: number;
}): number {
  const msPerRute = Number.isFinite(input.msPerRute) && input.msPerRute > 0 ? input.msPerRute : 0;
  return (
    input.startetMs +
    input.maxDurationMs -
    SKOGPROVE_SIKKERHETSMARGIN_MS -
    input.gjenstaendeRuter * msPerRute -
    (input.gjenstaendeRegioner + 1) * SKOGPROVE_MS_PER_REGION
  );
}
