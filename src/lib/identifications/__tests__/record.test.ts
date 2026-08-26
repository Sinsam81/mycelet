import { describe, expect, it, vi } from 'vitest';
import { recordIdentification } from '../record';
import { buildHistoryImagePath } from '../config';
import type { IdentifySuggestion } from '@/types/identify';

/**
 * Skrivestien for identifiseringshistorikken.
 *
 * Den viktigste egenskapen her er ikke at raden blir skrevet — det er at en
 * FEIL aldri kan ta ned identifiseringen. Kindwise-kallet er allerede betalt
 * og kvoteenheten brukt i det denne funksjonen kalles; å kaste her ville tatt
 * fra brukeren nøyaktig det de nettopp ventet på.
 */

const FORSLAG: IdentifySuggestion[] = [
  {
    name: 'Cantharellus cibarius',
    commonNames: ['Kantarell'],
    probability: 87,
    edibility: 'edible',
    description: null,
    taxonomy: null,
    similarImages: [],
    speciesId: 1
  },
  {
    name: 'Hygrophoropsis aurantiaca',
    commonNames: [],
    probability: 9,
    edibility: 'inedible',
    description: null,
    taxonomy: null,
    similarImages: []
  }
];

function fakeDb(behaviour: 'ok' | 'error' | 'throw') {
  const rows: Record<string, unknown>[] = [];
  const db = {
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        if (behaviour === 'throw') throw new Error('klienten er ikke konstruert');
        rows.push(row);
        return { error: behaviour === 'error' ? { message: 'insert nektet' } : null };
      }
    })
  };
  return { db, rows };
}

describe('recordIdentification', () => {
  it('skriver toppforslaget, hele lista og det EKSAKTE punktet', async () => {
    const { db, rows } = fakeDb('ok');
    const res = await recordIdentification(db, {
      userId: 'bruker-1',
      suggestions: FORSLAG,
      latitude: 59.91234,
      longitude: 10.75678,
      imageCount: 3,
      safetyDataIncomplete: false,
      id: 'rad-1'
    });

    expect(res.identificationId).toBe('rad-1');
    expect(rows[0].top_suggestion_name).toBe('Cantharellus cibarius');
    expect(rows[0].top_species_id).toBe(1);
    expect(rows[0].top_probability).toBe(87);
    expect(rows[0].image_count).toBe(3);
    // Det grovkornede punktet er kun det som sendes til Kindwise. Historikken
    // er en funn-kladd; grovkornet vi her, ville et funn lagret SENERE fra
    // historikken fått dårligere posisjon enn ett lagret med én gang.
    expect(rows[0].latitude).toBe(59.91234);
    expect(rows[0].longitude).toBe(10.75678);
    // Hele topp-3 bevares: similarImages og rekkefølgen kan ikke gjenskapes.
    expect((rows[0].suggestions as IdentifySuggestion[]).length).toBe(2);
  });

  it('bildestien er determinert av bruker og rad-id', async () => {
    const { db } = fakeDb('ok');
    const res = await recordIdentification(db, {
      userId: 'bruker-1',
      suggestions: FORSLAG,
      imageCount: 1,
      safetyDataIncomplete: false,
      id: 'rad-1'
    });
    expect(res.imagePath).toBe(buildHistoryImagePath('bruker-1', 'rad-1'));
    expect(res.imagePath).toBe('bruker-1/rad-1.jpg');
  });

  it('en DB-feil gir null id og en melding — den kaster ikke', async () => {
    const { db } = fakeDb('error');
    const res = await recordIdentification(db, {
      userId: 'bruker-1',
      suggestions: FORSLAG,
      imageCount: 1,
      safetyDataIncomplete: false
    });
    expect(res.identificationId).toBeNull();
    expect(res.error).toBe('insert nektet');
  });

  it('en klient som KASTER tar heller ikke ned identifiseringen', async () => {
    // Supabase-klienten returnerer { error } ved DB-feil, men kan kaste før
    // den kommer så langt (manglende tabell i en eldre deploy, en klient som
    // ikke lot seg konstruere). Begge veier må ende i en verdi, ikke et kast.
    const { db } = fakeDb('throw');
    const res = await recordIdentification(db, {
      userId: 'bruker-1',
      suggestions: FORSLAG,
      imageCount: 1,
      safetyDataIncomplete: false
    });
    expect(res.identificationId).toBeNull();
    expect(res.error).toContain('ikke konstruert');
  });

  it('uten forslag skrives ingen rad', async () => {
    const insert = vi.fn();
    const res = await recordIdentification({ from: () => ({ insert }) }, {
      userId: 'bruker-1',
      suggestions: [],
      imageCount: 1,
      safetyDataIncomplete: false
    });
    expect(insert).not.toHaveBeenCalled();
    expect(res.identificationId).toBeNull();
    // Ingen forslag er ikke en FEIL — det er bare ingenting å ta vare på.
    expect(res.error).toBeNull();
  });

  it('null posisjon lagres som null, ikke som 0', async () => {
    const { db, rows } = fakeDb('ok');
    await recordIdentification(db, {
      userId: 'bruker-1',
      suggestions: FORSLAG,
      imageCount: 1,
      safetyDataIncomplete: true
    });
    expect(rows[0].latitude).toBeNull();
    expect(rows[0].longitude).toBeNull();
    expect(rows[0].safety_data_incomplete).toBe(true);
  });
});
