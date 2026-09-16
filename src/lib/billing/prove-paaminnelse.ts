import type { Locale } from '@/i18n/config';
import { isLocale } from '@/i18n/config';
import { fasitDato } from '@/lib/alerts/email';
import { FREE_DAILY_AI_LIMIT } from './plans';

/**
 * Påminnelsen tre dager før gratisuka på nett blir til en belastning.
 *
 * Stripe sender `customer.subscription.trial_will_end` tre dager før
 * prøveperioden slutter. Uten en e-post da er det første kunden merker et
 * trekk på kortet — og en refusjonsforespørsel er dyrere for alle enn en
 * kunde som sa opp i tide. Teksten minner først om hva abonnementet gir og
 * hva som blir borte, og sier så trekket rett ut til slutt: dato, beløp og
 * veien ut, i vanlig brødtekst. Ingen nedtelling, ingen «vi håper du blir».
 *
 * Ren logikk (beslutning + tekst), så reglene kan testes uten Stripe. Beløpet
 * kommer ALLTID fra prisobjektet i hendelsen, aldri fra plans.ts — Stripe-
 * prisen kan endres uten at koden endres, og en e-post med feil beløp er
 * verre enn ingen e-post (da hoppes den over med grunn «pris-ukjent»).
 *
 * Rabatt: checkout tillater kampanjekoder (allow_promotion_codes), så
 * listeprisen er ikke alltid det som trekkes. Kjenner vi rabatten, trekkes
 * den fra beløpet; vet vi bare at den finnes (hendelsen bærer bare id-en),
 * sendes e-posten UTEN tall — «da belastes kortet, med rabatten trukket fra»
 * er sant, «da trekkes 79 kr» til en som skal betale 39,50 er det ikke.
 */

/** Rabatten på abonnementet (kupong/kampanjekode). Alle null = finnes, men størrelsen er ukjent. */
export interface RabattFakta {
  percentOff: number | null;
  /** I minste enhet (øre), i valutaen under. */
  amountOff: number | null;
  amountOffCurrency: string | null;
}

export interface ProvePaaminnelseFakta {
  /** subscription.status — påminnelsen gjelder bare «trialing». */
  status: string;
  /** subscription.trial_end i unix-sekunder. */
  trialEndSek: number | null;
  cancelAtPeriodEnd: boolean;
  /** price.unit_amount i minste enhet (øre). Null = ukjent/egendefinert pris. */
  unitAmount: number | null;
  /** price.currency, f.eks. «nok». */
  currency: string | null;
  /** Fra lesRabatt(). Null = ingen rabatt. */
  rabatt: RabattFakta | null;
  naaMs: number;
}

export interface Belop {
  unitAmount: number;
  currency: string;
}

export type ProvePaaminnelseBeslutning =
  | { send: false; grunn: 'ikke-prove' | 'allerede-sagt-opp' | 'prove-slutt-passert' | 'pris-ukjent' }
  | {
      send: true;
      dagerIgjen: number;
      sluttIso: string;
      /** Det som faktisk trekkes. Null = det finnes en rabatt vi ikke kan regne på; e-posten sier da ikke noe tall. */
      belop: Belop | null;
    };

/** Hele dager til prøveslutt, rundet — Stripe sender hendelsen ~72 timer før. */
export function dagerTil(trialEndSek: number, naaMs: number): number {
  return Math.round((trialEndSek * 1000 - naaMs) / 86_400_000);
}

/** Det ene Discount-objektet vi trenger fra Stripe (subscription.discount / discounts[]). */
export interface RabattLike {
  coupon?: { percent_off?: number | null; amount_off?: number | null; currency?: string | null } | null;
}

/**
 * Les rabatten fra abonnementet slik Stripe rendret det. Eldre API-versjoner
 * har `discount` som ferdig utvidet objekt; nyere (kontoens) bærer bare
 * `discounts` som en liste av id-er, med mindre kalleren har bedt om
 * expand=discounts. En id alene sier at rabatten finnes, ikke hvor stor den
 * er — da kommer alle feltene tilbake som null, og e-posten dropper tallet.
 * To eller flere rabatter regnes heller ikke på (Stripe stabler dem i en
 * bestemt rekkefølge vi ikke vil gjette på).
 */
export function lesRabatt(sub: {
  discount?: RabattLike | null;
  discounts?: ReadonlyArray<string | RabattLike> | null;
}): RabattFakta | null {
  const liste = sub.discounts ?? [];
  const objekter = liste.filter((d): d is RabattLike => typeof d === 'object' && d !== null);
  if (sub.discount && !objekter.length) objekter.push(sub.discount);
  const idEr = liste.filter((d) => typeof d === 'string');
  if (!objekter.length && !idEr.length) return null;

  const ukjent: RabattFakta = { percentOff: null, amountOff: null, amountOffCurrency: null };
  if (objekter.length !== 1) return ukjent;
  const c = objekter[0].coupon;
  if (!c) return ukjent;
  const percentOff = typeof c.percent_off === 'number' && c.percent_off > 0 ? c.percent_off : null;
  const amountOff = typeof c.amount_off === 'number' && c.amount_off > 0 ? c.amount_off : null;
  if (percentOff === null && amountOff === null) return ukjent;
  return { percentOff, amountOff, amountOffCurrency: amountOff !== null ? (c.currency?.toLowerCase() ?? null) : null };
}

export function rabattStorrelseUkjent(r: RabattFakta): boolean {
  return r.percentOff === null && r.amountOff === null;
}

/**
 * Beløpet etter rabatt, eller null når vi ikke tør si et tall: ukjent
 * størrelse, beløpsrabatt i en annen valuta, eller et beløp som går i null
 * (100 % kupong — da er det ingen belastning å varsle om med tall).
 */
export function beregnBelop(unitAmount: number, currency: string, rabatt: RabattFakta | null): number | null {
  if (!rabatt) return unitAmount;
  if (rabatt.percentOff !== null) {
    const etter = Math.round(unitAmount * (1 - Math.min(100, rabatt.percentOff) / 100));
    return etter > 0 ? etter : null;
  }
  if (rabatt.amountOff !== null) {
    if (rabatt.amountOffCurrency !== currency.toLowerCase()) return null;
    const etter = unitAmount - rabatt.amountOff;
    return etter > 0 ? etter : null;
  }
  return null;
}

export function bestemProvePaaminnelse(f: ProvePaaminnelseFakta): ProvePaaminnelseBeslutning {
  if (f.status !== 'trialing' || f.trialEndSek === null) return { send: false, grunn: 'ikke-prove' };
  // Har kunden alt sagt opp, kommer ingen belastning — «da trekkes X kr» ville vært usant.
  if (f.cancelAtPeriodEnd) return { send: false, grunn: 'allerede-sagt-opp' };
  if (f.trialEndSek * 1000 <= f.naaMs) return { send: false, grunn: 'prove-slutt-passert' };
  if (f.unitAmount === null || !Number.isFinite(f.unitAmount) || f.unitAmount <= 0 || !f.currency) {
    return { send: false, grunn: 'pris-ukjent' };
  }
  const currency = f.currency.toLowerCase();
  const etterRabatt = beregnBelop(f.unitAmount, currency, f.rabatt);
  return {
    send: true,
    dagerIgjen: Math.max(0, dagerTil(f.trialEndSek, f.naaMs)),
    sluttIso: new Date(f.trialEndSek * 1000).toISOString().slice(0, 10),
    belop: etterRabatt === null ? null : { unitAmount: etterRabatt, currency }
  };
}

/**
 * «7900 nok» → «79 kr», «7950 sek» → «79,50 kr», «790 eur» → «7,90 €».
 * Kroner uten desimaler når beløpet er helt — det er slik prisen står på
 * prissiden, og e-posten skal ikke se ut som en faktura.
 */
export function formaterBelop(unitAmount: number, currency: string, locale: Locale): string {
  const kode = currency.toUpperCase();
  const belop = unitAmount / 100;
  const hele = Number.isInteger(belop);
  if (kode === 'NOK' || kode === 'SEK') {
    const tall = hele ? String(belop) : belop.toFixed(2).replace('.', ',');
    return `${tall} kr`;
  }
  try {
    return new Intl.NumberFormat(locale === 'sv' ? 'sv-SE' : 'nb-NO', {
      style: 'currency',
      currency: kode,
      minimumFractionDigits: hele ? 0 : 2,
      maximumFractionDigits: 2
    }).format(belop);
  } catch {
    return `${hele ? belop : belop.toFixed(2)} ${kode}`;
  }
}

/** Språket kontoen ble opprettet med (user_metadata.sprak), ellers norsk. */
export function sprakFraMetadata(meta: Record<string, unknown> | null | undefined): Locale {
  const v = meta?.sprak;
  return typeof v === 'string' && isLocale(v) ? v : 'nb';
}

/**
 * Teksten: hva du mister, hva du beholder, og så trekket — i den rekkefølgen.
 *
 * Beløpet, datoen og veien ut skal aldri være vanskeligere å finne enn
 * verditeksten over. Derfor står oppsigelseslenken FØR tallet i siste avsnitt
 * (ingen skal måtte lese seg forbi pengene for å finne utgangen), og alle
 * avsnittene rendres i samme brødtekst — ingen grå småskrift under trekket.
 *
 * Tre ting teksten IKKE sier, og ikke skal begynne å si:
 *   · at soppforholdene, soppkartet eller soppvarselet stopper. De er gratis
 *     i denne koden (ingen billing-sjekk i /api/mushroom-forecast,
 *     /soppforhold eller varsel-cronen), og et falskt tap tre dager før et
 *     trekk leses som skremsel.
 *   · at du finner sopp. Forbeholdet er ordrett det samme som i
 *     varsel-e-posten (src/lib/alerts/email.ts) — mykner det der, mykner det
 *     her, aldri før.
 *   · noe om måned, sesong eller nedtelling. COPY-tabellen er statisk og
 *     Stripe sender trial_will_end hele året; «september» ville vært usant
 *     for de fleste, og en nedtelling er presset denne e-posten ikke skal ha.
 *
 * Tallene i teksten er bundet til koden der det går: dagsgrensen kommer fra
 * FREE_DAILY_AI_LIMIT. «Tre områder» er hotspotsFull.slice(0, 3) i
 * /api/prediction — endres den, må dette avsnittet endres samtidig.
 */
const COPY = {
  nb: {
    naar: (d: number) => (d <= 0 ? 'i dag' : d === 1 ? 'i morgen' : `om ${d} dager`),
    emne: (naar: string) => `Prøveperioden din i Mycelet slutter ${naar}`,
    tittel: (naar: string) => `Prøveperioden slutter ${naar}`,
    innledning: (plan: string, naar: string) => `Prøveperioden din på ${plan} slutter ${naar}.`,
    verdi: (aiGrense: number) =>
      `Med abonnement viser kartet de lovende områdene nær deg, og begrunnelsen bak hvert tall: været, sesongen og skogtypen. Uten abonnement står tre områder igjen, grovere plassert og uten begrunnelsen. Offline-kartet til turer uten dekning slutter å virke, og AI-identifikasjonen får en grense på ${aiGrense} bilder i døgnet.`,
    beholder: 'Soppforholdene for området ditt, soppkartet og soppvarselet beholder du gratis uansett.',
    forbehold:
      'Tallet er vær og sesong for et område. Det sier ingenting om skogen der du står, og vi lover ikke at du finner sopp.',
    avslutning: (dato: string, belop: string, lenke: string) =>
      `Vil du ikke fortsette, sier du opp her: ${lenke}. Vil du fortsette, trenger du ikke gjøre noe. ${dato} trekkes ${belop}, om du ikke sier opp før det.`,
    avslutningUtenBelop: (dato: string, lenke: string) =>
      `Vil du ikke fortsette, sier du opp her: ${lenke}. Vil du fortsette, trenger du ikke gjøre noe. ${dato} belastes kortet ditt — med rabatten din trukket fra — om du ikke sier opp før det.`,
    signatur: 'Mycelet — soppvarsel for Norge og Sverige'
  },
  sv: {
    naar: (d: number) => (d <= 0 ? 'i dag' : d === 1 ? 'i morgon' : `om ${d} dagar`),
    emne: (naar: string) => `Din provperiod i Mycelet slutar ${naar}`,
    tittel: (naar: string) => `Provperioden slutar ${naar}`,
    innledning: (plan: string, naar: string) => `Din provperiod på ${plan} slutar ${naar}.`,
    verdi: (aiGrense: number) =>
      `Med abonnemang visar kartan de lovande områdena nära dig, och motiveringen bakom varje siffra: vädret, säsongen och skogstypen. Utan abonnemang återstår tre områden, grovare placerade och utan motiveringen. Offlinekartan för turer utan täckning slutar fungera, och AI-identifieringen får en gräns på ${aiGrense} bilder om dygnet.`,
    beholder: 'Svampläget för ditt område, svampkartan och svampvarningen behåller du gratis ändå.',
    forbehold:
      'Siffran är väder och säsong för ett område. Den säger ingenting om skogen där du står, och vi lovar inte att du hittar svamp.',
    avslutning: (dato: string, belop: string, lenke: string) =>
      `Vill du inte fortsätta säger du upp här: ${lenke}. Vill du fortsätta behöver du inte göra något. Den ${dato} dras ${belop}, om du inte säger upp innan dess.`,
    avslutningUtenBelop: (dato: string, lenke: string) =>
      `Vill du inte fortsätta säger du upp här: ${lenke}. Vill du fortsätta behöver du inte göra något. Den ${dato} debiteras ditt kort — med din rabatt avdragen — om du inte säger upp innan dess.`,
    signatur: 'Mycelet — svampvarning för Norge och Sverige'
  }
} as const;

export interface ProvePaaminnelseEpostArgs {
  locale: Locale;
  /** Plannavnet slik kunden kjenner det, f.eks. «Premium» eller «Sesongpass». */
  plan: string;
  dagerIgjen: number;
  /** «2026-09-17» */
  sluttIso: string;
  /** Null = rabatt vi ikke kan regne på; teksten nevner da ikke noe tall. */
  belop: Belop | null;
  /**
   * Der kunden faktisk sier opp: prissiden, som har knappen til Stripe-
   * portalen («Administrer abonnement»). Ikke profilsiden — den viser bare
   * plan og status, og en kunde som stoler på setningen og gir opp der,
   * blir belastet.
   */
  oppsigelseUrl: string;
}

export function byggProvePaaminnelseEpost(args: ProvePaaminnelseEpostArgs): { emne: string; html: string; tekst: string } {
  const t = COPY[args.locale] ?? COPY.nb;
  const naar = t.naar(args.dagerIgjen);
  const dato = fasitDato(args.sluttIso, args.locale);
  // Samme setning i begge delene; bare lenken rendres ulikt (anker vs. ren URL).
  const avslutning = (lenke: string) =>
    args.belop
      ? t.avslutning(dato, formaterBelop(args.belop.unitAmount, args.belop.currency, args.locale), lenke)
      : t.avslutningUtenBelop(dato, lenke);

  const avsnitt = [t.innledning(args.plan, naar), t.verdi(FREE_DAILY_AI_LIMIT), t.beholder, t.forbehold];
  const anker = `<a href="${args.oppsigelseUrl}" style="color: #1A3409;">${args.oppsigelseUrl}</a>`;

  // Alle avsnitt i samme brødtekst: trekket og lenken skal ikke stå mindre
  // eller blekere enn det som står over dem.
  const p = (avsnittTekst: string) => `    <p style="font-size: 16px; line-height: 1.5;">${avsnittTekst}</p>`;
  const html = `<!doctype html>
<html lang="${args.locale}">
  <body style="font-family: -apple-system, system-ui, sans-serif; color: #1f2937; max-width: 560px; margin: 24px auto; padding: 0 16px;">
    <h1 style="font-size: 20px; font-weight: 600; color: #1A3409; margin-bottom: 8px;">${t.tittel(naar)}</h1>
${[...avsnitt, avslutning(anker)].map(p).join('\n')}
    <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">${t.signatur}</p>
  </body>
</html>`;

  const tekst = [t.tittel(naar), ...avsnitt, avslutning(args.oppsigelseUrl), t.signatur].join('\n\n');

  return { emne: t.emne(naar), html, tekst };
}
