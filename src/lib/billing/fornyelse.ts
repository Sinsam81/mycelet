import type { IapPlan } from './plans';
import { osloDag } from '@/lib/bruk/bruksdag';
import { intlLocale } from '@/lib/utils/intl-locale';

/**
 * Når fornyes abonnementet om kunden ikke avslutter?
 *
 * Sesongpasset fornyes om ett år, Premium om en måned, regnet fra dagen
 * kjøpet (eller prøveperioden) starter. Arket og prissiden sier datoen rett
 * ut — «fornyes ca. 22. september 2027» — fordi datoen ER argumentet for
 * passet: 99 kr dekker resten av denne høsten, passet dekker neste sesong
 * fram til da. Sju av åtte prøver siden 12. september valgte måned, og ingen
 * av dem fikk se hva passet faktisk varte til.
 *
 * Datoen er omtrentlig («ca.»): butikken regner fra kjøpsøyeblikket, og en
 * gratisuke skyver den sju dager. Ren datoregning på ISO-dager (YYYY-MM-DD)
 * uten tidssone: 29. februar ett år fram blir 28. februar, 31. januar én
 * måned fram blir siste dag i februar. Én kilde, så arket og prissiden aldri
 * oppgir to ulike datoer for samme kjøp.
 */

const ISO_DAG = /^(\d{4})-(\d{2})-(\d{2})$/;

function dagerIMaaned(aar: number, maaned0: number): number {
  return new Date(Date.UTC(aar, maaned0 + 1, 0)).getUTCDate();
}

function to(n: number): string {
  return String(n).padStart(2, '0');
}

/** «2026-09-22» → «2027-09-22» for passet, «2026-10-22» for Premium. Ugyldig inndata gis tilbake uendret. */
export function fornyelsesdag(dagIso: string, plan: IapPlan): string {
  const m = ISO_DAG.exec(dagIso);
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
  return `${aar}-${to(maaned0 + 1)}-${to(Math.min(dag, dagerIMaaned(aar, maaned0)))}`;
}

/** «ca. 22. september 2027» (nb) · «ca. 22 september 2027» (sv). */
export function formaterFornyelsesdag(dagIso: string, locale: string): string {
  if (!ISO_DAG.test(dagIso)) return dagIso;
  const tekst = new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${dagIso}T12:00:00Z`));
  return `ca. ${tekst}`;
}

/** Fornyelsesdatoen for et kjøp i dag (Oslo-dato), ferdig formatert for språket. */
export function fornyelsesTekst(plan: IapPlan, locale: string, naa: Date = new Date()): string {
  return formaterFornyelsesdag(fornyelsesdag(osloDag(naa), plan), locale);
}
