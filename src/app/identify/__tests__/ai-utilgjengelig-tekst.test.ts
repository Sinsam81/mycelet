import { describe, expect, it } from 'vitest';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Panelet identify-siden viser når AI-en er slått av (nøkkelen mangler, eller
 * ruta svarer ai_disabled).
 *
 * Teksten sa «Vi venter fortsatt på API-tilgang fra leverandøren» — sant før
 * lansering, usant siden. AI-identifiseringen er i drift; vises panelet nå, er
 * det et driftsavbrudd, og en bruker som har brukt funksjonen i ukevis skal
 * ikke få beskjed om at den aldri har vært satt opp.
 */
describe('AI utilgjengelig-panelet', () => {
  it.each([
    ['nb', nb],
    ['sv', sv]
  ] as const)('%s: sier at tjenesten er midlertidig nede, ikke at den venter på oppsett', (_locale, katalog) => {
    const tekst = `${katalog.Identify.disabledHeading} ${katalog.Identify.disabledIntro}`;
    expect(tekst).not.toMatch(/API|leverandør|leverantör|under oppsett|sättas upp/i);
    expect(tekst).toMatch(/akkurat nå|just nu/);
    expect(tekst).toMatch(/midlertidig|tillfälligt/);
  });
});
