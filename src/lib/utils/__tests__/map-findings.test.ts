import { describe, expect, it } from 'vitest';
import { OwnFindingRow, ownFindingToMapFinding } from '../map-findings';

/**
 * «Kun mine funn» på kartet filtrerte tidligere public_findings på user_id.
 * Viewet har `WHERE visibility IN ('public','approximate')`, så avkrysningsboksen
 * skjulte nettopp de funnene brukeren hadde merket PRIVATE — og kartet talte
 * færre egne funn enn /mine-steder uten at noe forklarte forskjellen.
 *
 * Kartet leser nå findings-tabellen direkte for eierens egne funn. Testene under
 * fastholder at konverteringen beholder det viewet ikke kunne gi: alle
 * synligheter, og de EKSAKTE koordinatene til eierens egne punkter.
 */

const row: OwnFindingRow = {
  id: 'funn-1',
  user_id: 'meg',
  species_id: 1,
  latitude: 59.912345,
  longitude: 10.754321,
  found_at: '2026-08-01T09:00:00Z',
  quantity: 'few',
  notes: 'bak den store grana',
  thumbnail_url: null,
  verification_status: 'unverified',
  is_zone_finding: false,
  zone_label: null,
  zone_precision_km: null,
  mushroom_species: { norwegian_name: 'Kantarell', latin_name: 'Cantharellus cibarius', edibility: 'edible' }
};

describe('ownFindingToMapFinding', () => {
  it('viser eierens egne funn på det EKTE punktet, ikke et forskjøvet display-punkt', () => {
    const mapped = ownFindingToMapFinding(row, 'sopper');
    expect(mapped.display_lat).toBe(59.912345);
    expect(mapped.display_lng).toBe(10.754321);
  });

  it('tar med et privat funn — det viewet aldri returnerte', () => {
    // Raden finnes bare fordi spørringen går mot findings-tabellen med
    // eier-RLS. Konverteringen må ikke kaste den bort igjen.
    const privat: OwnFindingRow = { ...row, id: 'privat-1', notes: null };
    const mapped = ownFindingToMapFinding(privat, 'sopper');
    expect(mapped.id).toBe('privat-1');
    expect(mapped.display_lat).not.toBeNull();
    expect(mapped.display_lng).not.toBeNull();
  });

  it('henter artsnavn og spiselighet fra den innebygde relasjonen', () => {
    const mapped = ownFindingToMapFinding(row, 'sopper');
    expect(mapped.norwegian_name).toBe('Kantarell');
    expect(mapped.latin_name).toBe('Cantharellus cibarius');
    expect(mapped.edibility).toBe('edible');
  });

  it('tåler funn uten art', () => {
    const mapped = ownFindingToMapFinding({ ...row, species_id: null, mushroom_species: null }, 'sopper');
    expect(mapped.norwegian_name).toBeNull();
    expect(mapped.edibility).toBeNull();
  });

  it('beholder sonemerkingen så popupen fortsatt sier «omtrentlig»', () => {
    const mapped = ownFindingToMapFinding(
      { ...row, is_zone_finding: true, zone_label: 'Nordmarka', zone_precision_km: 5 },
      'sopper'
    );
    expect(mapped.is_zone_finding).toBe(true);
    expect(mapped.zone_precision_km).toBe(5);
  });
});
