import { describe, expect, it } from 'vitest';
import { parseFindingPatch, parseFindingRequest } from '../request';
import { FUNN_FEIL } from '../feil';

/**
 * parseFindingPatch er det eneste som står mellom en PATCH-forespørsel og
 * findings-raden. Den er en HVITELISTE: det som ikke står på den, avvises —
 * også felt som i dag er harmløse.
 */

const feilkode = (value: unknown) => {
  const result = parseFindingPatch(value);
  return result.success ? null : result.code;
};

const data = (value: unknown) => {
  const result = parseFindingPatch(value);
  if (!result.success) throw new Error(`forventet gyldig patch, fikk ${result.code}`);
  return result.data;
};

describe('parseFindingPatch — hva som slipper gjennom', () => {
  it('tar imot bare de sju feltene eieren kan endre', () => {
    expect(
      data({
        visibility: 'approximate',
        isZoneFinding: true,
        zoneLabel: '  Nordmarka sør ',
        zonePrecisionKm: 3,
        speciesId: 12,
        speciesNameOverride: ' Piggsopp ',
        notes: ' Ved bekken '
      })
    ).toEqual({
      deling: { visibility: 'approximate', isZoneFinding: true, zoneLabel: 'Nordmarka sør', zonePrecisionKm: 3 },
      speciesId: 12,
      speciesNameOverride: 'Piggsopp',
      notes: 'Ved bekken'
    });
  });

  it('lar felt som ikke er sendt, stå urørt', () => {
    expect(data({ notes: 'x' })).toEqual({ notes: 'x' });
    expect(data({ visibility: 'private' })).toEqual({
      deling: { visibility: 'private', isZoneFinding: false, zoneLabel: null }
    });
  });

  it('tømmer et tekstfelt som sendes tomt eller som null', () => {
    expect(data({ notes: '' })).toEqual({ notes: null });
    expect(data({ notes: '   ' })).toEqual({ notes: null });
    expect(data({ notes: null, speciesId: null, speciesNameOverride: null })).toEqual({
      notes: null,
      speciesId: null,
      speciesNameOverride: null
    });
  });
});

describe('parseFindingPatch — posisjonen kan aldri endres', () => {
  it.each(['latitude', 'longitude', 'lat', 'lng', 'lon', 'display_latitude', 'display_longitude'])(
    'avviser %s med sin egen feilkode',
    (felt) => {
      const result = parseFindingPatch({ notes: 'x', [felt]: 59.91 });
      expect(result).toEqual({ success: false, code: 'position_not_editable', field: felt });
    }
  );

  it('avviser posisjon også når resten av forespørselen er gyldig', () => {
    expect(feilkode({ visibility: 'private', latitude: 59.91, longitude: 10.75 })).toBe('position_not_editable');
  });
});

describe('parseFindingPatch — alt annet utenfor hvitelista', () => {
  it.each([
    'imageUrl',
    'thumbnailUrl',
    'image_url',
    'foundAt',
    'found_at',
    'aiUsed',
    'aiTopSuggestion',
    'aiConfidence',
    'aiRawResponse',
    'userConfirmedSpecies',
    'isNegativeObservation',
    'user_id',
    'deleted_at',
    'verification_status',
    'location_name',
    '__proto__',
    'constructor'
  ])('avviser %s', (felt) => {
    // JSON.parse, ikke et objektliteral: «__proto__» i et literal setter
    // prototypen, mens den i en forespørsel er en vanlig nøkkel.
    const body = JSON.parse(`{"notes":"x","${felt}":"y"}`);
    expect(parseFindingPatch(body)).toEqual({ success: false, code: 'unknown_field', field: felt });
  });

  it('avviser det som ikke er et objekt', () => {
    for (const value of [null, undefined, 'tekst', 7, true, [], [{ notes: 'x' }]]) {
      expect(feilkode(value)).toBe('invalid_body');
    }
  });

  it('avviser en tom endring', () => {
    expect(feilkode({})).toBe('empty_patch');
  });
});

describe('parseFindingPatch — delingen er én enhet', () => {
  it('krever en gyldig synlighet', () => {
    expect(feilkode({ visibility: 'hemmelig' })).toBe('invalid_visibility');
    expect(feilkode({ visibility: null })).toBe('invalid_visibility');
    expect(feilkode({ visibility: ['private'] })).toBe('invalid_visibility');
  });

  it('avviser soneinnstillinger uten synlighet — målet er da ikke sagt', () => {
    expect(feilkode({ isZoneFinding: true, zoneLabel: 'X' })).toBe('visibility_required');
    expect(feilkode({ isZoneFinding: false })).toBe('visibility_required');
    expect(feilkode({ zoneLabel: 'X' })).toBe('visibility_required');
    expect(feilkode({ zonePrecisionKm: 5 })).toBe('visibility_required');
  });

  it('holder regelen fra lagringen: sone ⇒ omtrentlig', () => {
    for (const visibility of ['public', 'private']) {
      expect(feilkode({ visibility, isZoneFinding: true, zoneLabel: 'X', zonePrecisionKm: 5 })).toBe(
        'zone_requires_approximate'
      );
    }
  });

  it('holder regelen fra lagringen: en sone må ha et navn', () => {
    expect(feilkode({ visibility: 'approximate', isZoneFinding: true })).toBe('zone_label_missing');
    expect(feilkode({ visibility: 'approximate', isZoneFinding: true, zoneLabel: '   ' })).toBe('zone_label_missing');
  });

  it('holder takene fra lagringen', () => {
    const sone = { visibility: 'approximate', isZoneFinding: true, zoneLabel: 'X' };
    expect(feilkode({ ...sone, zoneLabel: 'x'.repeat(121) })).toBe('invalid_fields');
    expect(data({ ...sone, zoneLabel: 'x'.repeat(120) }).deling?.zoneLabel).toHaveLength(120);
    // `true` og `[5]` er med fordi Number() gjør dem til 1 og 5.
    for (const km of [0, 51, 2.5, -1, 'mange', true, [5]]) {
      expect(feilkode({ ...sone, zonePrecisionKm: km })).toBe('invalid_zone_precision');
    }
    expect(data({ ...sone, zonePrecisionKm: 1 }).deling?.zonePrecisionKm).toBe(1);
    expect(data({ ...sone, zonePrecisionKm: 50 }).deling?.zonePrecisionKm).toBe(50);
    expect(feilkode({ notes: 'x'.repeat(2001) })).toBe('invalid_fields');
    expect(feilkode({ speciesNameOverride: 'x'.repeat(201) })).toBe('invalid_fields');
  });

  it('lar presisjonen stå urørt når den ikke er sendt', () => {
    const deling = data({ visibility: 'approximate', isZoneFinding: true, zoneLabel: 'X' }).deling;
    expect(deling).toEqual({ visibility: 'approximate', isZoneFinding: true, zoneLabel: 'X' });
    expect(deling && 'zonePrecisionKm' in deling).toBe(false);
  });

  /**
   * Lagringsflaten sender alltid «zonePrecisionKm: 5» og «zoneLabel: null»,
   * også for funn uten sone. Samme form skal gå her — men ingen av delene skal
   * bli med videre: presisjonen er en av kolonnene triggeren i 042 vokter.
   */
  it('dropper sonenavn og presisjon når funnet ikke skal være sone', () => {
    expect(data({ visibility: 'approximate', isZoneFinding: false, zoneLabel: 'Gammelt navn', zonePrecisionKm: 5 })).toEqual({
      deling: { visibility: 'approximate', isZoneFinding: false, zoneLabel: null }
    });
  });

  it('validerer presisjonen også når funnet ikke skal være sone', () => {
    expect(feilkode({ visibility: 'private', zonePrecisionKm: 999 })).toBe('invalid_zone_precision');
  });

  it('avviser isZoneFinding som ikke er sann eller usann', () => {
    expect(feilkode({ visibility: 'approximate', isZoneFinding: 'true', zoneLabel: 'X' })).toBe('invalid_fields');
    expect(feilkode({ visibility: 'approximate', isZoneFinding: 1, zoneLabel: 'X' })).toBe('invalid_fields');
  });
});

describe('parseFindingPatch — art og notat', () => {
  it('krever et positivt heltall som art', () => {
    // `true` og `[7]` er med fordi Number() gjør dem til 1 og 7 — en feil hos
    // avsenderen ville da blitt lagret som en ekte art.
    for (const speciesId of [0, -3, 1.5, 'kantarell', {}, true, [7]]) {
      expect(feilkode({ speciesId })).toBe('invalid_fields');
    }
    expect(data({ speciesId: '12' })).toEqual({ speciesId: 12 });
  });

  it('avviser tekst som ikke er tekst', () => {
    expect(feilkode({ notes: 42 })).toBe('invalid_fields');
    expect(feilkode({ notes: { tekst: 'x' } })).toBe('invalid_fields');
    expect(feilkode({ speciesNameOverride: ['x'] })).toBe('invalid_fields');
  });
});

describe('feilkodene', () => {
  it('finnes i tekstkatalogen, så ruta alltid har noe å svare', () => {
    const koder = [
      feilkode(null),
      feilkode({}),
      feilkode({ latitude: 1 }),
      feilkode({ ukjent: 1 }),
      feilkode({ visibility: 'x' }),
      feilkode({ isZoneFinding: true }),
      feilkode({ visibility: 'public', isZoneFinding: true, zoneLabel: 'X' }),
      feilkode({ visibility: 'approximate', isZoneFinding: true }),
      feilkode({ visibility: 'private', zonePrecisionKm: 99 }),
      feilkode({ notes: 42 })
    ];
    for (const kode of koder) {
      expect(kode).not.toBeNull();
      expect(FUNN_FEIL).toHaveProperty(kode as string);
    }
  });

  it('gjelder også lagring av nytt funn', () => {
    const kode = (value: unknown) => {
      const result = parseFindingRequest(value);
      return result.success ? null : result.code;
    };
    const gyldig = { latitude: 59.91, longitude: 10.75, visibility: 'approximate' };

    expect(kode(null)).toBe('invalid_body');
    expect(kode({ ...gyldig, latitude: 200 })).toBe('invalid_latitude');
    expect(kode({ ...gyldig, longitude: 200 })).toBe('invalid_longitude');
    expect(kode({ ...gyldig, visibility: 'x' })).toBe('invalid_visibility');
    expect(kode({ ...gyldig, notes: 7 })).toBe('invalid_fields');
    expect(kode({ ...gyldig, speciesId: true })).toBe('invalid_fields');
    expect(kode({ ...gyldig, zonePrecisionKm: 99 })).toBe('invalid_zone_precision');
    expect(kode({ ...gyldig, zonePrecisionKm: true })).toBe('invalid_zone_precision');
    expect(kode({ ...gyldig, isZoneFinding: true })).toBe('zone_label_missing');
    expect(kode({ ...gyldig, visibility: 'public', isZoneFinding: true, zoneLabel: 'X' })).toBe(
      'zone_requires_approximate'
    );
    expect(kode({ ...gyldig, aiConfidence: 2 })).toBe('invalid_ai_confidence');
    expect(kode({ ...gyldig, aiRawResponse: { stor: 'x'.repeat(25_001) } })).toBe('ai_response_too_large');
    expect(kode(gyldig)).toBeNull();
  });
});
