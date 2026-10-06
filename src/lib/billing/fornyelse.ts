import type { IapPlan } from './plans';
import { osloDag } from '@/lib/bruk/bruksdag';
import { intlLocale } from '@/lib/utils/intl-locale';

/**
 * Når trekkes pengene — første gang, og neste gang?
 *
 * Sesongpasset fornyes om ett år, Premium om en måned, regnet fra dagen
 * BETALINGEN starter. Med en gratis prøveperiode er det ikke kjøpsdagen:
 * Stripe fakturerer ved `trial_end` (kjøpsdag + prøvedager), og det betalte
 * året løper derfra; Apple gjør det samme, og butikkens egen «Administrer
 * abonnement» viser den datoen. Arket og prissiden sier begge datoene rett ut
 * — «gratis i 7 dager, fra ca. 29. september 2026 koster passet 249 kr per år,
 * gjelder da til ca. 29. september 2027» — fordi datoen ER argumentet for
 * passet: 99 kr dekker resten av denne høsten, passet dekker neste sesong
 * fram til da. Første utgave av arket regnet passet fra kjøpsdagen og nevnte
 * aldri når de 249 kronene ble trukket; det leste som «gratis til september
 * 2027», og en kunde belastet på dag åtte er en refusjon og en anmeldelse.
 *
 * Datoene er omtrentlige («ca.»): butikken regner fra kjøpsøyeblikket, ikke
 * fra Oslo-datoen. Ren datoregning på ISO-dager (YYYY-MM-DD) uten tidssone:
 * 29. februar ett år fram blir 28. februar, 31. januar én måned fram blir
 * siste dag i februar. Én kilde, så arket og prissiden aldri oppgir to ulike
 * datoer for samme kjøp.
 */

const ISO_DAG = /^(\d{4})-(\d{2})-(\d{2})$/;

function dagerIMaaned(aar: number, maaned0: number): number {
  return new Date(Date.UTC(aar, maaned0 + 1, 0)).getUTCDate();
}

function to(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDag(aar: number, maaned0: number, dag: number): string {
  return `${aar}-${to(maaned0 + 1)}-${to(dag)}`;
}

/**
 * Dagen den første belastningen kommer: kjøpsdagen pluss prøvedagene
 * («2026-09-22» + 7 → «2026-09-29»). Uten prøveperiode er det kjøpsdagen.
 * Ugyldig inndata gis tilbake uendret.
 */
export function forsteBelastningsdag(dagIso: string, proveDager: number = 0): string {
  const m = ISO_DAG.exec(dagIso);
  if (!m) return dagIso;
  const dager = Number.isFinite(proveDager) && proveDager > 0 ? Math.floor(proveDager) : 0;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dager));
  return isoDag(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Neste fornyelse: første belastning + ett år for passet, + én måned for
 * Premium. «2026-09-22» → «2027-09-22» / «2026-10-22» uten prøveperiode;
 * med sju gratisdager «2027-09-29» / «2026-10-29». Ugyldig inndata gis
 * tilbake uendret.
 */
export function fornyelsesdag(dagIso: string, plan: IapPlan, proveDager: number = 0): string {
  const start = forsteBelastningsdag(dagIso, proveDager);
  const m = ISO_DAG.exec(start);
  if (!m) return dagIso;
  let aar = Number(m[1]);
  let maaned0 = Number(m[2]) - 1;
  const dag = Number(m[3]);
  if (plan === 'season_pass') {
    aar += 1;
  } else {
    maaned0 += 1;
    if (maaned0 > 11) {
      maaned0 = 0;
      aar += 1;
    }
  }
  return isoDag(aar, maaned0, Math.min(dag, dagerIMaaned(aar, maaned0)));
}

/**
 * «ca. 22. september 2027» (nb) · «ca 22 september 2027» (sv).
 * Svensk skriver «ca» uten punktum (Språkrådet, TT-språket).
 */
export function formaterFornyelsesdag(dagIso: string, locale: string): string {
  if (!ISO_DAG.test(dagIso)) return dagIso;
  const tekst = new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${dagIso}T12:00:00Z`));
  return `${locale === 'sv' ? 'ca' : 'ca.'} ${tekst}`;
}

/**
 * Fornyelsesdatoen for et kjøp i dag (Oslo-dato), ferdig formatert for
 * språket. `proveDager` er prøveperioden kunden faktisk får på DENNE planen
 * (0 når ingen) — den skyver både første belastning og fornyelsen.
 */
export function fornyelsesTekst(plan: IapPlan, locale: string, proveDager: number = 0, naa: Date = new Date()): string {
  return formaterFornyelsesdag(fornyelsesdag(osloDag(naa), plan, proveDager), locale);
}

/** Dagen den første belastningen kommer for et kjøp i dag, ferdig formatert for språket. */
export function forsteBelastningsTekst(proveDager: number, locale: string, naa: Date = new Date()): string {
  return formaterFornyelsesdag(forsteBelastningsdag(osloDag(naa), proveDager), locale);
}
