import { describe, expect, it } from 'vitest';
import { finnSpiselighetsMotsigelse } from '../spiselighetskontroll';

const rad = (over: Partial<Parameters<typeof finnSpiselighetsMotsigelse>[0]>) => ({
  id: 1,
  norwegian_name: 'Testsopp',
  edibility: 'conditionally_edible',
  edibility_notes: null,
  toxin_info: null,
  ...over
});

describe('finnSpiselighetsMotsigelse — vaktbikkja for «giftig rå»-merket', () => {
  it('krittøsterssopp slik den sto: merket lovet tilberedning, teksten sa at varme ikke hjelper', () => {
    const r = rad({
      edibility_notes: 'IKKE ANBEFALT. NSNF fører den som «Spiselig*» med merknaden «Bør unngås ved nedsatt nyrefunksjon.»',
      toxin_info: 'Friske nyrer skiller trolig ut stoffene. Koking eller steking fjerner ikke risikoen.'
    });
    expect(finnSpiselighetsMotsigelse(r)).toMatch(/varme ikke fjerner/);
  });

  it('en ekte «giftig rå»-art (rødskrubb) slipper gjennom', () => {
    const r = rad({ edibility_notes: 'Giftig som rå. Krever varmebehandling i minst 15 minutter. God matsopp godt stekt.' });
    expect(finnSpiselighetsMotsigelse(r)).toBeNull();
  });

  it('helseforbehold uten et ord om tilberedning er en motsigelse', () => {
    const r = rad({ edibility_notes: 'Spiselig, men bør unngås av personer med nyresykdom.' });
    expect(finnSpiselighetsMotsigelse(r)).not.toBeNull();
  });

  it('fraråding under grønt merke fanges (falsk kantarell-tilfellet fra august)', () => {
    const r = rad({ edibility: 'edible', edibility_notes: 'Kan gi mild GI-reaksjon hos enkelte. Anbefales ikke.' });
    expect(finnSpiselighetsMotsigelse(r)).toMatch(/fraråder/);
  });

  it('etter rettingen: inedible med samme tekst er ingen motsigelse', () => {
    const r = rad({ edibility: 'inedible', edibility_notes: 'IKKE MATSOPP I MYCELET. Steking eller koking fjerner ikke risikoen.' });
    expect(finnSpiselighetsMotsigelse(r)).toBeNull();
  });

  it('en forvekslingsadvarsel alene (rødnende fluesopp, ekte tekst) er ikke en fraråding av arten', () => {
    const r = rad({
      edibility_notes: 'Spiselig KUN gjennomstekt — rå er den giftig. Forveksles lett med giftig panterfluesopp, så den frarådes nybegynnere.',
      toxin_info: 'Hemolysiner som brytes ned ved steking (giftig rå).'
    });
    expect(finnSpiselighetsMotsigelse(r)).toBeNull();
  });

  it('«skal ikke spises rå» under grønt merke (granmatriske, ekte tekst) er et tilberedningsråd, ikke en fraråding', () => {
    const r = rad({ edibility: 'edible', edibility_notes: 'God matsopp i riske-gruppen. Stek godt — riskene skal ikke spises rå.' });
    expect(finnSpiselighetsMotsigelse(r)).toBeNull();
  });
});
