/**
 * The single source of truth for who Mycelet's legal counterparty is.
 *
 * WHY THIS FILE EXISTS: the plan is to convert from the sole proprietorship
 * (ØVERÅS APPS, ENK) to a limited company (AS) as soon as the app earns enough
 * to pay for it. Before this file, the legal name and org number were written
 * out in nine places across messages/nb.json and messages/sv.json, so the
 * conversion meant hunting through prose in two languages and hoping none was
 * missed — in documents where a stale party name is a real problem.
 *
 * Now the conversion is: edit the constant below, and every legal page follows.
 * See docs/enk-til-as-sjekkliste.md for the parts that are NOT code (Stripe,
 * Apple, RevenueCat, data-processing agreements, notifying customers).
 *
 * The prose stays in the message catalogue; only the FACTS live here. Anything
 * that has to be phrased differently for an ENK than for an AS is a pair of
 * message keys picked by `form` — see `entityMessageValues`.
 */

export type EntityForm = 'enk' | 'as';

export interface LegalEntity {
  /** Drives which of the ENK/AS-specific message variants is rendered. */
  form: EntityForm;
  /** Registered legal name, exactly as in Brønnøysund. */
  legalName: string;
  /** Organisation number, grouped as Brønnøysund prints it. */
  orgNr: string;
  /**
   * Postal address. Mandatory pre-contractual information under
   * angrerettloven § 8 and ehandelsloven § 8 — the terms are incomplete until
   * this is set. Use a P.O. box rather than a home address: declaring trader
   * status in App Store Connect publishes it on the public EU product page.
   */
  postalAddress?: string;
  /** Telephone number. Same legal basis, and also published by App Store Connect. */
  phone?: string;
  generalEmail: string;
  privacyEmail: string;
  website: string;
}

export const LEGAL_ENTITY: LegalEntity = {
  form: 'enk',
  legalName: 'ØVERÅS APPS',
  orgNr: '937 880 871',
  // TODO(enk→as / pre-App-Store): set both of these. They are legally required
  // and currently omitted rather than faked — see the checklist in docs/.
  postalAddress: undefined,
  phone: undefined,
  generalEmail: 'post@mycelet.com',
  privacyEmail: 'privacy@mycelet.com',
  website: 'mycelet.com'
};

/** Label for an optional contact line, in the reader's language. */
const LINE_LABELS = {
  nb: { address: 'Postadresse', phone: 'Telefon' },
  sv: { address: 'Postadress', phone: 'Telefon' }
} as const;

/**
 * ICU values for the legal pages. Pass the whole object to every `t()` call on
 * a legal page — next-intl ignores values a message does not reference, so one
 * object covers all sections.
 *
 * `addressLine` / `phoneLine` collapse to an empty string when unset, so an
 * unfilled field leaves no trace in the rendered text (as opposed to a visible
 * "[FYLL INN]" placeholder, which is what shipped to production before).
 */
export function entityMessageValues(locale: string): Record<string, string> {
  const labels = locale === 'sv' ? LINE_LABELS.sv : LINE_LABELS.nb;
  const e = LEGAL_ENTITY;
  return {
    legalName: e.legalName,
    orgNr: e.orgNr,
    generalEmail: e.generalEmail,
    privacyEmail: e.privacyEmail,
    website: e.website,
    addressLine: e.postalAddress ? `\n${labels.address}: ${e.postalAddress}` : '',
    phoneLine: e.phone ? `\n${labels.phone}: ${e.phone}` : ''
  };
}

/** Message-key suffix for the clauses that must read differently for an AS. */
export function entityFormSuffix(): 'Enk' | 'As' {
  return LEGAL_ENTITY.form === 'as' ? 'As' : 'Enk';
}

/**
 * True when the terms are still missing information the law requires. Used by
 * the legal pages' tests so an incomplete party block cannot ship unnoticed.
 */
export function missingMandatoryContactInfo(): string[] {
  const missing: string[] = [];
  if (!LEGAL_ENTITY.postalAddress) missing.push('postalAddress');
  if (!LEGAL_ENTITY.phone) missing.push('phone');
  return missing;
}
