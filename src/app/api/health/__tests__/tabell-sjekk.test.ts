import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NYERE_TABELLER } from '@/lib/supabase/tabell-finnes';

/**
 * Helsesjekken skal kunne se at en migrasjon mangler.
 *
 * Den gamle sjekken gjorde et HEAD-kall og så etter feilkoden 42P01. Et
 * HEAD-kall mot en tabell som ikke finnes gir ingen feil i klienten, og koden
 * fra PostgREST er PGRST205 — sjekken kunne aldri slå ut. Denne fila låser
 * formen. Leser ruta som tekst, som de andre helsetestene.
 */
const kilde = readFileSync(new URL('../route.ts', import.meta.url), 'utf8');

describe('helsesjekkens tabellsjekker', () => {
  it('revisjonsloggen sjekkes med GET og den delte hjelperen, ikke HEAD og 42P01', () => {
    const fn = kilde.slice(kilde.indexOf('async function checkAuditLogTable'), kilde.indexOf('async function checkNyereTabeller'));
    expect(fn).toContain("from('admin_audit_log').select('id').limit(1)");
    expect(fn).not.toContain('head: true');
    expect(fn).toContain('erManglendeTabell(error)');
    expect(kilde).not.toContain("=== '42P01'");
  });

  it('listen over nyere tabeller kjører BARE uten ?fast=1', () => {
    const handler = kilde.slice(kilde.indexOf('export async function GET'));
    const foerFastGrenen = handler.slice(0, handler.indexOf('if (!fast)'));
    expect(foerFastGrenen).not.toContain('checkNyereTabeller()');
    expect(handler.slice(handler.indexOf('if (!fast)'))).toContain('checkNyereTabeller()');
  });

  it('teller IKKE mot 503, men logges', () => {
    expect(kilde).toContain('const { epost, ai, tabeller, ...oppetidssjekker } = checks');
    expect(kilde).toContain('health.tabeller_mangler');
  });

  it('hver tabell i listen opprettes faktisk av migrasjonen den peker på', () => {
    const katalog = join(process.cwd(), 'supabase', 'migrations');
    const filer = readdirSync(katalog);
    expect(NYERE_TABELLER.length).toBeGreaterThan(5);
    for (const { tabell, migrasjon } of NYERE_TABELLER) {
      const fil = filer.find((f) => f.startsWith(`${migrasjon}_`));
      expect(fil, `ingen migrasjon ${migrasjon}`).toBeDefined();
      const sql = readFileSync(join(katalog, fil!), 'utf8');
      expect(sql, `${fil} oppretter ikke ${tabell}`).toMatch(
        new RegExp(`CREATE TABLE (IF NOT EXISTS )?(public\\.)?${tabell}\\b`, 'i')
      );
    }
  });
});
