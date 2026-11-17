import { readLocal, removeLocal, writeLocal } from '@/lib/utils/safe-storage';

/**
 * Husket delingsnivå for funn — på tvers av de to lagringsflatene
 * (AI-resultatsiden og AddFindingSheet på kartet), så brukeren ikke må velge
 * «Privat» på nytt for hvert eneste funn.
 *
 * KUN lokalt på enheten (safe-storage). Serverside-lagring er eksplisitt
 * forbudt av migrasjon 044: profiles er anon-lesbar (SELECT USING(true)), og
 * et lagret delingsnivå der ville avslørt hvilke brukere som deler eksakte
 * koordinater. Trengs det på serveren en dag, krever det en egen tabell med
 * owner-RLS — aldri profiles.
 *
 * Selve VELGEREN skal alltid være synlig på lagringsflaten. Standardverdien
 * her endrer bare hva den står på — lærdommen fra personvernfunn #92
 * (delingsnivået var en gang usynlig hardkodet, og funn kunne den gang verken
 * slettes eller endres i appen) er at valget aldri får skje i det stille.
 *
 * Det gjelder fortsatt, selv om et funn nå både kan slettes og få delingen
 * endret i etterkant (PATCH /api/findings/:id, «Endre deling» på Mine steder):
 * et punkt som har ligget ute, er sett. Innstrammingen virker framover — den
 * tar ikke tilbake det som alt er vist. Reglene for når delingen kan ÅPNES
 * igjen står i delingsendring.ts.
 */

export type DelingsnivaValg = 'public' | 'approximate' | 'zone' | 'private';

const NOKKEL = 'mycelet:delingsniva-v1';
const GYLDIGE: readonly DelingsnivaValg[] = ['public', 'approximate', 'zone', 'private'];

export function lesDelingsnivaStandard(): DelingsnivaValg | null {
  const raa = readLocal(NOKKEL);
  return GYLDIGE.includes(raa as DelingsnivaValg) ? (raa as DelingsnivaValg) : null;
}

export function lagreDelingsnivaStandard(valg: DelingsnivaValg): void {
  writeLocal(NOKKEL, valg);
}

/**
 * Kalles ved utlogging: nøkkelen er ikke navneromsdelt per bruker, så på en
 * delt enhet ville neste innloggede ellers både arvet forrige brukers
 * standard OG kunnet lese preferansen deres. Én linje å rydde er billigere
 * enn per-bruker-nøkler.
 */
export function nullstillDelingsnivaStandard(): void {
  removeLocal(NOKKEL);
}

/**
 * AI-resultatsiden har ikke sone-funn (de krever navn + presisjon og bor i
 * AddFindingSheet) — et husket «zone» blir «approximate» der, som er sonens
 * egen synlighetsverdi i databasen. Uten husket valg: dagens standard.
 */
export function somSynlighet(valg: DelingsnivaValg | null): 'public' | 'approximate' | 'private' {
  if (valg === 'public' || valg === 'private') return valg;
  return 'approximate';
}
