import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Kontoslettingen fjerner også soppvarsel-påmeldinger gjort UTEN konto på
 * samme e-postadresse (steg 1c2 i /api/me/delete). Slettedialogen og
 * personvernerklæringens avsnitt om sletting sa det ikke. Testen holder de to
 * tekstene og ruta i takt: forsvinner steget, må tekstene også endres.
 */
const rot = join(__dirname, '../../../..');
const les = (sti: string) => readFileSync(join(rot, sti), 'utf8');

describe('teksten om kontoløse soppvarsel-påmeldinger ved sletting', () => {
  it('ruta sletter faktisk kontoløse rader på kontoens adresse', () => {
    const rute = les('src/app/api/me/delete/route.ts');
    expect(rute).toMatch(/\.from\('alert_subscriptions'\)\s*\.delete\(\)\s*\.is\('user_id', null\)\s*\.eq\('email', epost\)/);
  });

  it('slettedialogen viser linja', () => {
    expect(les('src/components/profile/AccountDataActions.tsx')).toContain("t('deletedEmailAlerts')");
    expect(nb.AccountDataActions.deletedEmailAlerts).toMatch(/uten konto.*samme e-postadresse/);
    expect(sv.AccountDataActions.deletedEmailAlerts).toMatch(/utan konto.*samma e-postadress/);
  });

  it('personvernerklæringens avsnitt om sletting sier det samme, på begge språk', () => {
    expect(nb.Personvern.retentionDeletedDesc).toMatch(/Soppvarsel-påmeldinger du har gjort uten konto, på samme e-postadresse som kontoen, slettes samtidig\./);
    expect(sv.Personvern.retentionDeletedDesc).toMatch(/Anmälningar till svampvarningen som du har gjort utan konto, med samma e-postadress som kontot, raderas samtidigt\./);
  });

  it('den svenske teksten er svensk', () => {
    for (const tekst of [sv.AccountDataActions.deletedEmailAlerts, sv.Personvern.retentionDeletedDesc]) {
      expect(tekst).not.toMatch(/\bsopp|ø|æ|\buten\b/i);
    }
  });
});
