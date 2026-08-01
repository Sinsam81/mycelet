import { describe, it, expect } from 'vitest';
import { buildUserUploadPath } from '../upload-path';

const USER = 'abcdef12-3456-7890-abcd-ef1234567890';

describe('buildUserUploadPath', () => {
  it('beholder brukerens mappe som prefiks', () => {
    // Kontoslettingen (deleteUserStorageObjects) nøkler på nettopp dette
    // prefikset — endres det, slettes ikke bildene lenger.
    expect(buildUserUploadPath(USER).startsWith(`${USER}/`)).toBe(true);
  });

  it('bruker oppgitt filendelse', () => {
    expect(buildUserUploadPath(USER).endsWith('.jpg')).toBe(true);
    expect(buildUserUploadPath(USER, 'webp').endsWith('.webp')).toBe(true);
  });

  it('gir en ny sti hver gang', () => {
    const paths = new Set(Array.from({ length: 500 }, () => buildUserUploadPath(USER)));
    expect(paths.size).toBe(500);
  });

  it('inneholder ikke et tidsstempel', () => {
    // Kjernen i endringen: den gamle stien var `${user.id}/${Date.now()}.jpg`.
    // user_id ligger åpent i public_findings, og et tidspunkt er gjettbart —
    // til sammen kunne et privat funns bilde nås av den som ville lete.
    const now = Date.now();
    const path = buildUserUploadPath(USER);
    const filename = path.split('/')[1];

    // Ingen 13-sifret millisekund-verdi nær nåtid.
    for (const match of filename.match(/\d{10,}/g) ?? []) {
      expect(Math.abs(Number(match) - now)).toBeGreaterThan(1000 * 60 * 60 * 24 * 365);
    }
  });

  it('har nok entropi til at gjetting ikke er en strategi', () => {
    const filename = buildUserUploadPath(USER).split('/')[1].replace(/\.jpg$/, '');
    // UUID v4 = 36 tegn; hex-fallback = 32. Begge er 128 bit.
    expect(filename.length).toBeGreaterThanOrEqual(32);
  });

  it('holder brukere fra hverandre', () => {
    const a = buildUserUploadPath('bruker-a');
    const b = buildUserUploadPath('bruker-b');
    expect(a.split('/')[0]).toBe('bruker-a');
    expect(b.split('/')[0]).toBe('bruker-b');
  });
});
