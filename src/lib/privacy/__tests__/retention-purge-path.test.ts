import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Retensjonsregelen finnes to steder, og de må si det samme:
 *
 *   • src/app/api/me/delete/route.ts  — brukeren sletter seg selv
 *   • supabase/functions/purge-inactive-accounts/index.ts — 3 års inaktivitet
 *
 * Regelen (docs/retention-policy.md, migrasjon 011): bare NEGATIVE, ikke-
 * private observasjoner overlever som anonymiserte treningsdata. Positive funn
 * og alt merket privat må slettes EKSPLISITT før auth-raden fjernes — etter
 * migrasjon 011 er FK-en ON DELETE SET NULL, så alt som ikke slettes blir
 * liggende for alltid uten eier. For private rader betyr det en eksakt
 * latitude/longitude (display_* er NULL for dem), mens brukeren har fått
 * beskjed om at funnet ble slettet.
 *
 * Edge-funksjonen kjører på Deno og importerer fra esm.sh, så den kan ikke
 * lastes inn i Vitest og kjøres. Testen leser derfor kilden og sjekker at
 * regelen faktisk er uttrykt der, i riktig rekkefølge. Det er en formtest, og
 * den er valgt med åpne øyne: alternativet var ingen dekning i det hele tatt
 * på nettopp det steget som en gang manglet.
 */
const PURGE_SOURCE = readFileSync(
  new URL('../../../../supabase/functions/purge-inactive-accounts/index.ts', import.meta.url),
  'utf8'
);

const DELETE_ROUTE_SOURCE = readFileSync(
  new URL('../../../app/api/me/delete/route.ts', import.meta.url),
  'utf8'
);

describe('retensjon: begge slettestiene fjerner det som ikke skal overleve', () => {
  it('kontosletting fjerner positive funn og private observasjoner', () => {
    expect(DELETE_ROUTE_SOURCE).toContain("eq('is_negative_observation', false)");
    expect(DELETE_ROUTE_SOURCE).toContain("eq('visibility', 'private')");
  });

  it('inaktivitets-purgen fjerner de samme radene', () => {
    expect(PURGE_SOURCE).toContain("eq('is_negative_observation', false)");
    expect(PURGE_SOURCE).toContain("eq('visibility', 'private')");
  });

  it('purgen sletter funnene FØR auth-raden, ikke etter', () => {
    const positiveDelete = PURGE_SOURCE.indexOf("eq('is_negative_observation', false)");
    const privateDelete = PURGE_SOURCE.indexOf("eq('visibility', 'private')");
    const authDelete = PURGE_SOURCE.indexOf('auth.admin.deleteUser');

    expect(positiveDelete).toBeGreaterThan(-1);
    expect(privateDelete).toBeGreaterThan(-1);
    expect(authDelete).toBeGreaterThan(-1);
    expect(positiveDelete).toBeLessThan(authDelete);
    expect(privateDelete).toBeLessThan(authDelete);
  });

  it('påstår ikke lenger at foreldreløse rader er ufarlige fordi de er jitret', () => {
    // Den gamle kommentaren var grunnen til at hullet så ufarlig ut. Private
    // funn har display_* = NULL og eksakt latitude/longitude i behold.
    expect(PURGE_SOURCE).not.toContain('deliberate gap');
    expect(PURGE_SOURCE).not.toContain('display-jittered coords');
  });
});
