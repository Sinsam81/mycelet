import { describe, expect, it } from 'vitest';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';
import { LEGAL_ENTITY, entityFormSuffix, entityMessageValues, missingMandatoryContactInfo } from '../entity';

const LEGAL_NAMESPACES = ['Vilkar', 'Kjopsvilkar', 'Personvern'] as const;

function legalText(catalogue: Record<string, Record<string, unknown>>): string {
  return LEGAL_NAMESPACES.map((ns) => JSON.stringify(catalogue[ns] ?? {})).join(' ');
}

describe('legal entity — single source of truth', () => {
  it('exposes the party name and org number as message values', () => {
    const v = entityMessageValues('nb');
    expect(v.legalName).toBe(LEGAL_ENTITY.legalName);
    expect(v.orgNr).toBe(LEGAL_ENTITY.orgNr);
  });

  it('collapses unset address and phone to nothing rather than a visible placeholder', () => {
    const v = entityMessageValues('nb');
    if (!LEGAL_ENTITY.postalAddress) expect(v.addressLine).toBe('');
    if (!LEGAL_ENTITY.phone) expect(v.phoneLine).toBe('');
    expect(v.addressLine).not.toContain('undefined');
    expect(v.phoneLine).not.toContain('undefined');
  });

  it('picks the message variant that matches the company form', () => {
    expect(entityFormSuffix()).toBe(LEGAL_ENTITY.form === 'as' ? 'As' : 'Enk');
  });

  // The whole point of the constant: the ENK → AS conversion must not require
  // hunting through prose in two languages.
  it.each(['nb', 'sv'])('has no hardcoded party name or org number in %s legal text', (locale) => {
    const text = legalText((locale === 'nb' ? nb : sv) as never);
    expect(text).not.toContain(LEGAL_ENTITY.legalName);
    expect(text).not.toContain(LEGAL_ENTITY.orgNr);
    expect(text).toContain('{legalName}');
  });

  it.each(['nb', 'sv'])('ships both company-form variants in %s so the switch is instant', (locale) => {
    const cat = (locale === 'nb' ? nb : sv) as Record<string, Record<string, unknown>>;
    expect(cat.Kjopsvilkar.sellerFormNoteEnk).toBeTruthy();
    expect(cat.Kjopsvilkar.sellerFormNoteAs).toBeTruthy();
    expect(cat.Personvern.controllerNameEnk).toBeTruthy();
    expect(cat.Personvern.controllerNameAs).toBeTruthy();
  });

  it.each(['nb', 'sv'])('has an assignment clause in %s covering the transfer', (locale) => {
    const cat = (locale === 'nb' ? nb : sv) as Record<string, Record<string, unknown>>;
    expect(cat.Vilkar.assignmentBody).toBeTruthy();
    expect(cat.Kjopsvilkar.assignmentBody).toBeTruthy();
  });
});

describe('legal text hygiene', () => {
  it.each(['nb', 'sv'])('%s legal pages carry no unfilled placeholders', (locale) => {
    const text = legalText((locale === 'nb' ? nb : sv) as never);
    expect(text).not.toContain('FYLL INN');
    expect(text).not.toContain('FYLL I ');
    expect(text.toLowerCase()).not.toContain('utkast');
  });

  // The EU ODR platform was shut down on 20 July 2025 and its legal basis
  // repealed — pointing consumers there is a dead end.
  it.each(['nb', 'sv'])('%s does not send consumers to the retired EU ODR platform', (locale) => {
    const text = legalText((locale === 'nb' ? nb : sv) as never);
    expect(text).not.toContain('ODR');
    expect(text).not.toContain('consumers/odr');
  });

  it.each(['nb', 'sv'])('%s still names the redress bodies that do exist', (locale) => {
    const text = legalText((locale === 'nb' ? nb : sv) as never);
    expect(text).toContain('arn.se');
    expect(text).toContain('forbrukerradet.no');
  });
});

describe('mandatory pre-contractual contact information', () => {
  // angrerettloven § 8 and ehandelsloven § 8 both require a geographic address
  // and a telephone number. This test is expected to FAIL-as-a-reminder until
  // they are set — it asserts the gap is tracked, not that it is acceptable.
  it('reports exactly which mandatory fields are still missing', () => {
    const missing = missingMandatoryContactInfo();
    // Update this expectation (to []) in the same commit that fills the fields.
    expect(missing).toEqual(['postalAddress', 'phone']);
  });
});

describe('terms substance — the claims must match what we actually do', () => {
  const cat = (locale: string) => (locale === 'nb' ? nb : sv) as Record<string, Record<string, string>>;

  // We stopped relying on the digital-content exception, so no document may
  // still tell the customer their withdrawal right lapses.
  it.each(['nb', 'sv'])('%s no longer claims the withdrawal right lapses on delivery', (locale) => {
    const c = cat(locale);
    const purchase = JSON.stringify(c.Kjopsvilkar);
    const pricing = JSON.stringify(c.Pricing);
    for (const blob of [purchase, pricing]) {
      expect(blob).not.toContain('angreretten dermed bortfaller');
      expect(blob).not.toContain('ångerrätten därmed upphör');
      expect(blob).not.toContain('taper angreretten');
    }
    // …and it must positively grant the 14 days.
    expect(purchase).toMatch(/14 dagers angrerett|14 dagars ångerrätt/);
  });

  it.each(['nb', 'sv'])('%s describes both purchase channels, including Apple', (locale) => {
    const purchase = JSON.stringify(cat(locale).Kjopsvilkar);
    expect(purchase).toContain('App Store');
    expect(purchase).toContain('reportaproblem.apple.com');
    expect(purchase).not.toContain('foreløpig ikke tilgjengelig');
  });

  it.each(['nb', 'sv'])('%s prohibits controlled-substance mushrooms explicitly', (locale) => {
    const terms = JSON.stringify(cat(locale).Vilkar);
    expect(terms).toContain('psilocybin');
    expect(terms).toMatch(/Psilocybe semilanceata/);
  });

  it.each(['nb', 'sv'])('%s frames picking rights as allemannsrett, not US private property', (locale) => {
    const terms = JSON.stringify(cat(locale).Vilkar);
    expect(terms).toMatch(/allemannsrett|allemansrätt/);
  });

  it.each(['nb', 'sv'])('%s warns that advice from other users is not verification', (locale) => {
    const safety = cat(locale).Vilkar.safetyBody;
    expect(safety).toMatch(/SOPPKONTROLL|SVAMPKONTROLL/);
  });

  it.each(['nb', 'sv'])('%s carves out product liability and states no monetary cap', (locale) => {
    const liability = cat(locale).Vilkar.liabilityBody;
    expect(liability).toMatch(/produktansvar/);
    expect(liability).toMatch(/kronetak|takbelopp/);
  });

  it.each(['nb', 'sv'])('%s has a moderation and notice clause with a stated response time', (locale) => {
    const clause = cat(locale).Vilkar.contentModerationBody;
    expect(clause).toBeTruthy();
    expect(clause).toMatch(/7 dager|7 dagar/);
    // The notice channel has to work without an account.
    expect(clause).toMatch(/trenger ikke ha konto|behöver inte ha konto/);
    // Don't advertise a page that does not exist.
    expect(clause).not.toContain('meld-innhold');
  });

  it.each(['nb', 'sv'])('%s age clause is internally coherent', (locale) => {
    const age = cat(locale).Vilkar.ageBody;
    expect(age).toContain('18');
    expect(age).toContain('13');
  });
});
