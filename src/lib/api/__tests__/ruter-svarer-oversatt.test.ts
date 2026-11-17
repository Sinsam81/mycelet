import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Ingen brukervendt rute skal svare med en hardkodet setning eller med
 * databasens egen feilmelding.
 *
 * Tekst som lages på serveren dekkes ikke av next-intl, og klientene viser
 * serverens tekst før sin egen oversettelse. En `{ error: 'Kunne ikke …' }`
 * i en rute er derfor norsk til svenske brukere, hver gang — og
 * `{ error: error.message }` er Postgres på engelsk til alle.
 *
 * Testen leser rutene som tekst, som de andre vaktene i repoet. Den finner to
 * mønstre:
 *
 *   • `error:` eller `details:` fulgt av en strengliteral
 *   • `error:` eller `details:` fulgt av `<noe>.message`
 *
 * Feiler den på en ny rute: svar med `apiFeil(kode, status)` fra
 * src/lib/api/feil.ts (og `loggFeil` for den rå feilen), eller med en egen
 * nb/sv-tabell slik /api/identify og /api/prediction gjør.
 */

const API = join(process.cwd(), 'src', 'app', 'api');

/**
 * Ruter testen ikke gjelder, og hvorfor. Alle er maskin-til-maskin eller
 * eierens egen diagnostikk. findings/, billing/status/ og admin/moderation/
 * sto her som «IKKE FLYTTET» til november 2026; nå svarer de på leserens
 * språk og voktes som resten. En brukervendt rute skal ikke inn her igjen.
 */
const UTENFOR: ReadonlyArray<{ sti: string; hvorfor: string }> = [
  { sti: 'cron/', hvorfor: 'maskin-til-maskin bak CRON_SECRET; svaret leses i Vercel-loggen' },
  { sti: 'stripe/', hvorfor: 'webhook: mottakeren er Stripe' },
  { sti: 'revenuecat/', hvorfor: 'webhook: mottakeren er RevenueCat' },
  { sti: 'health/', hvorfor: 'driftsdiagnostikk for eieren, konkret med vilje' }
];

function rutefiler(mappe: string): string[] {
  return readdirSync(mappe, { withFileTypes: true }).flatMap((e) => {
    const sti = join(mappe, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : rutefiler(sti);
    return e.name === 'route.ts' ? [sti] : [];
  });
}

/** Kommentarer forklarer ofte nettopp det gamle mønsteret — de skal ikke telle. */
function utenKommentarer(kilde: string): string {
  return kilde.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const STRENGLITERAL = /\b(error|details)\s*:\s*['"`]/;
const RAA_MELDING = /\b(error|details)\s*:\s*[A-Za-z_$][\w$.?[\]]*\.message\b/;

const alle = rutefiler(API).map((fil) => ({ fil, navn: relative(API, fil).split('\\').join('/') }));
const voktet = alle.filter(({ navn }) => !UTENFOR.some((u) => navn.startsWith(u.sti)));

describe('feilsvar fra API-rutene', () => {
  it('finner rutene den skal vokte', () => {
    // Uten denne ville en flyttet mappe gitt en test som består på null filer.
    expect(alle.length).toBeGreaterThan(40);
    expect(voktet.length).toBeGreaterThan(20);
    for (const forventet of [
      'me/delete/route.ts',
      'spot-feedback/route.ts',
      'identify/route.ts',
      'places/route.ts',
      'findings/route.ts',
      'billing/status/route.ts',
      'admin/moderation/route.ts'
    ]) {
      expect(voktet.map((r) => r.navn)).toContain(forventet);
    }
  });

  it('ingen voktet rute svarer med en hardkodet setning', () => {
    const treff = voktet.flatMap(({ fil, navn }) =>
      utenKommentarer(readFileSync(fil, 'utf8'))
        .split('\n')
        .filter((linje) => STRENGLITERAL.test(linje))
        .map((linje) => `${navn}: ${linje.trim()}`)
    );
    expect(treff, 'bruk apiFeil(kode, status) fra src/lib/api/feil.ts — teksten må finnes på nb og sv').toEqual([]);
  });

  it('ingen voktet rute sender en rå feilmelding til klienten', () => {
    const treff = voktet.flatMap(({ fil, navn }) =>
      utenKommentarer(readFileSync(fil, 'utf8'))
        .split('\n')
        .filter((linje) => RAA_MELDING.test(linje))
        .map((linje) => `${navn}: ${linje.trim()}`)
    );
    expect(treff, 'logg den med loggFeil og svar med apiFeil — databasens tekst hører hjemme i loggen').toEqual([]);
  });

  it('ingen unntak står merket som «ikke flyttet»', () => {
    expect(UTENFOR.filter((u) => /IKKE FLYTTET/.test(u.hvorfor))).toEqual([]);
  });

  it('unntakslista peker bare på mapper som finnes', () => {
    // En rute som er flyttet eller slettet skal ikke bli stående som unntak.
    for (const { sti } of UTENFOR) {
      expect(alle.some((r) => r.navn.startsWith(sti)), `ingen rute under ${sti} — fjern unntaket`).toBe(true);
    }
  });
});
