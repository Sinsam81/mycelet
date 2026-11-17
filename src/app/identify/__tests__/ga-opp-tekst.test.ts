import { describe, expect, it } from 'vitest';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * De to tekstene identify-siden viser når KLIENTEN ga opp (useIdentify.ts).
 *
 * De skal ikke gi samme råd. Sto opplastingen stille, kom bildene aldri fram
 * og et nytt forsøk koster ingenting. Var alt sendt før klienten ga opp, kan
 * serveren ha brukt kvoteenheten og skrevet svaret i historikken — den første
 * utgaven sa «prøv igjen» også da, og brukeren betalte én enhet til for samme
 * sopp.
 */
const KATALOGER = [
  ['nb', nb],
  ['sv', sv]
] as const;

describe('teksten når klienten ga opp etter at bildene var sendt', () => {
  it.each(KATALOGER)('%s: peker til historikken med navnet lenka faktisk har', (_locale, katalog) => {
    expect(katalog.Identify.timeoutError).toContain(`«${katalog.Identify.historyLink}»`);
  });

  it.each(KATALOGER)('%s: ber ikke om et blindt nytt forsøk', (_locale, katalog) => {
    // «før du prøver igjen» / «innan du försöker igen» er lov. Oppfordringen
    // «prøv igjen» / «försök igen» er det ikke.
    expect(katalog.Identify.timeoutError).not.toMatch(/prøv igjen|försök igen/i);
    expect(katalog.Identify.timeoutError).toMatch(/før du prøver igjen|innan du försöker igen/);
  });

  it.each(KATALOGER)('%s: lover ikke at bildene blir liggende — veien til historikken forlater siden', (_locale, katalog) => {
    expect(katalog.Identify.timeoutError).not.toMatch(/bilde(ne|r)/i);
  });
});

describe('teksten når opplastingen sto stille', () => {
  it.each(KATALOGER)('%s: sier at bildene ikke kom fram, og at et nytt forsøk er ett trykk', (_locale, katalog) => {
    const tekst = katalog.Identify.uploadStalledError;
    expect(tekst).toMatch(/kom ikke fram|kom inte fram/);
    expect(tekst).toMatch(/prøv igjen|försök igen/);
    expect(tekst).toMatch(/ligger her fortsatt|ligger kvar här/);
    // Ingen omvei om historikken: der ligger det ingenting.
    expect(tekst).not.toContain(katalog.Identify.historyLink);
  });
});
