import { describe, it, expect } from 'vitest';
import { edibilityNoteTone } from '../edibility-note';

/**
 * Tekstene under er hentet ordrett ut av produksjonsdatabasen 2. august 2026.
 * De er ikke oppdiktet — det er nøyaktig strengene som lå der usynlige.
 */
const EKTE = {
  gronnkremle: 'Mild og god matkremle. OBS: hold den klart adskilt fra grønn fluesopp (som har skiver med ring og volva — kremler har ingen av delene).',
  vintersopp: 'Spiselig (kun hattene; stilkene er seige). VIKTIG: forveksles med dødelig flatklokkehatt — vær helt sikker.',
  snoballsjampinjong: 'God matsopp med anislukt. VIKTIG: unge, hvite eksemplarer må holdes klart adskilt fra dødelig grønn/hvit fluesopp.',
  kantarell: 'Norges mest populære matsopp. Stek på lav varme.',
  steinsopp: 'En av de fineste matsoppene. Sjekk for marker.',
  // Fella som gjør at vi IKKE leter etter farlige ord i teksten:
  rodgulPiggsopp: 'Trygg og ettertraktet høstsopp. Kan ikke lett forveksles med giftige arter.',
  blatutt: 'God matsopp, men må alltid gjennomstekes (rå er den ufordøyelig). Sen høst.'
};

describe('feilen dette ble skrevet for', () => {
  it('et notat på en «edible» art forsvinner ikke lenger', () => {
    // Den gamle betingelsen var edibility === 'conditionally_edible', så alt
    // dette ga ingen boks i det hele tatt.
    for (const notes of Object.values(EKTE)) {
      expect(edibilityNoteTone({ edibility: 'edible', notes })).not.toBeNull();
    }
  });

  it('advarselen om grønn fluesopp på grønnkremle vises, og vises som advarsel', () => {
    expect(edibilityNoteTone({ edibility: 'edible', notes: EKTE.gronnkremle })).toBe('warning');
  });

  it('«VIKTIG: forveksles med dødelig flatklokkehatt» er en advarsel', () => {
    expect(edibilityNoteTone({ edibility: 'edible', notes: EKTE.vintersopp })).toBe('warning');
    expect(edibilityNoteTone({ edibility: 'edible', notes: EKTE.snoballsjampinjong })).toBe('warning');
  });
});

describe('alarmtretthet — det som IKKE skal bli gult', () => {
  it('en tilberedningstips er et notat, ikke en advarsel', () => {
    expect(edibilityNoteTone({ edibility: 'edible', notes: EKTE.kantarell })).toBe('info');
    expect(edibilityNoteTone({ edibility: 'edible', notes: EKTE.steinsopp })).toBe('info');
    expect(edibilityNoteTone({ edibility: 'edible', notes: EKTE.blatutt })).toBe('info');
  });

  it('«Kan IKKE lett forveksles med giftige arter» blir ikke en advarsel', () => {
    // Hele grunnen til at vi ikke leter etter «forveksles» eller «giftig» i
    // teksten: dette notatet inneholder begge og betyr det motsatte.
    expect(edibilityNoteTone({ edibility: 'edible', notes: EKTE.rodgulPiggsopp })).toBe('info');
  });
});

describe('struktur slår tekst', () => {
  it('betinget spiselig er alltid en advarsel, uansett ordlyd', () => {
    expect(edibilityNoteTone({ edibility: 'conditionally_edible', notes: 'Kok først.' })).toBe('warning');
  });

  it('en kritisk forvekslingsart i basen gjør notatet til en advarsel', () => {
    // Selv om teksten er nøytral: har arten en dødelig tvilling registrert,
    // skal boksen se ut som en advarsel.
    expect(
      edibilityNoteTone({ edibility: 'edible', notes: 'God matsopp.', hasCriticalLookAlike: true })
    ).toBe('warning');
  });

  it('uten kritisk tvilling og uten markør: nøytralt', () => {
    expect(
      edibilityNoteTone({ edibility: 'edible', notes: 'God matsopp.', hasCriticalLookAlike: false })
    ).toBe('info');
  });
});

describe('kanttilfeller', () => {
  it('ingen notat gir ingen boks', () => {
    expect(edibilityNoteTone({ edibility: 'edible', notes: null })).toBeNull();
    expect(edibilityNoteTone({ edibility: 'edible', notes: undefined })).toBeNull();
    expect(edibilityNoteTone({ edibility: 'edible', notes: '   ' })).toBeNull();
  });

  it('markøren finnes uansett store og små bokstaver', () => {
    expect(edibilityNoteTone({ edibility: 'edible', notes: 'obs: se opp' })).toBe('warning');
    expect(edibilityNoteTone({ edibility: 'edible', notes: 'Obs: se opp' })).toBe('warning');
  });

  it('svensk markør fanges også — teksten skal oversettes senere', () => {
    expect(edibilityNoteTone({ edibility: 'edible', notes: 'VIKTIGT: förväxlas med lömsk flugsvamp' })).toBe(
      'warning'
    );
  });

  it('«obs» inne i et ord utløser ikke advarsel', () => {
    // Markøren er «obs:» med kolon, ikke bare «obs».
    expect(edibilityNoteTone({ edibility: 'edible', notes: 'Vokser i obskure habitater.' })).toBe('info');
  });

  it('giftige arter får også notatet sitt vist', () => {
    expect(edibilityNoteTone({ edibility: 'toxic', notes: 'Gir mageproblemer.' })).toBe('info');
    expect(edibilityNoteTone({ edibility: 'deadly', notes: 'Dødelig.', hasCriticalLookAlike: true })).toBe(
      'warning'
    );
  });
});
