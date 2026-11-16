import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HjemSkjelett } from '../HjemSkjelett';

/**
 * Skjelettet er det forsiden viser mens innholdet hentes. Tre løfter i
 * kommentaren dens holdes bare hvis noen sjekker dem.
 */
describe('HjemSkjelett', () => {
  const html = renderToStaticMarkup(<HjemSkjelett />);

  it('har ingen tekst — ingenting å oversette, ingenting å lese opp', () => {
    expect(html.replace(/<[^>]+>/g, '').trim()).toBe('');
    expect(html).toContain('aria-busy="true"');
  });

  it('holder av samme høyde som prognosekortet, så siden ikke hopper når det kommer', () => {
    const kort = readFileSync(join(__dirname, '..', 'MushroomDayCard.tsx'), 'utf8');
    expect(kort).toContain('min-h-[15rem]');
    expect(html).toContain('min-h-[15rem]');
  });

  it('pulserer bare når brukeren ikke har bedt om mindre bevegelse', () => {
    expect(html).toContain('motion-safe:animate-pulse');
    expect(html).not.toMatch(/(^|[\s"])animate-pulse/);
  });

  it('måler ingenting — bruksdagen hører til kortet som faktisk viser en prognose', () => {
    // Skjelettet er rent oppsett: ingen importer i det hele tatt, og dermed
    // ingen måling som kan telle en side som aldri ble vist.
    const kilde = readFileSync(join(__dirname, '..', 'HjemSkjelett.tsx'), 'utf8');
    expect(kilde).not.toMatch(/^import /m);
  });
});
