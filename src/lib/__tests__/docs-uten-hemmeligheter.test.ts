import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ingen hemmeligheter i klartekst under docs/.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TRE LEKKASJER, SAMME ÅRSAK
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Repoet er OFFENTLIG. Likevel har tre hemmeligheter havnet i docs/ i klartekst:
 *
 *   1. Passordet til `applereview@mycelet.com` — kontoen Apples reviewer bruker
 *   2. Bankkontonummeret (IBAN) til ØVERÅS APPS
 *   3. Passordet til `qa-autotest@mycelet.com` — en EKTE konto på den live appen,
 *      og samtidig til Apple sandbox-testeren
 *
 * Alle tre ble skrevet av samme grunn: noen skrev en oppskrift som skulle være
 * lett å følge, og limte inn den ekte verdien «bare for nå». Og alle tre står
 * fortsatt i git-historikken — å slette dem fra fila stopper bare blødningen.
 *
 * En formaning i et dokument stopper ikke dette, for det er nettopp dokumentene
 * som er åstedet. Derfor er regelen en test.
 *
 * REGELEN: en oppskrift skal si HVOR hemmeligheten ligger, aldri hva den er.
 *   ✅  «logg inn som qa-autotest@mycelet.com (passord i passordbehandleren)»
 *   ❌  «logg inn: qa-autotest@mycelet.com / Kantarell2026!»
 */

const DOCS = join(process.cwd(), 'docs');

function markdownfiler(katalog: string): string[] {
  return readdirSync(katalog).flatMap((navn) => {
    const sti = join(katalog, navn);
    if (statSync(sti).isDirectory()) return markdownfiler(sti);
    return navn.endsWith('.md') ? [sti] : [];
  });
}

/**
 * Verdier som er lov å stå etter «passord:» — de peker videre i stedet for å
 * røpe noe. Holdes bevisst kort: alt annet skal utløse testen.
 */
const PEKER_VIDERE =
  /(passordbehandler|password manager|se app store connect|se \.env|i passordbehandleren|1password|bitwarden|\.env\.local|<[^>]+>|\*{3,}|xxx|…|\.\.\.)/i;

const MØNSTRE: ReadonlyArray<{ navn: string; regex: RegExp; hvorfor: string }> = [
  {
    navn: 'passord i klartekst',
    // «Passord: hemmelig», «password = hemmelig», og — som i den tredje
    // lekkasjen — «Ett passord til alt: hemmelig», der det står noen ord mellom
    // ordet og kolonet. Inntil fire ord tillates i mellomrommet.
    regex: /(?:passord|password)\w*(?:\s+\S+){0,4}\s*[:=]\s*[`*"']*([^\s`*"'|<>]{8,})/gi,
    hvorfor: 'en oppskrift skal si hvor passordet ligger, ikke hva det er'
  },
  {
    navn: 'norsk kontonummer/IBAN',
    regex: /\bNO\s?\d{2}\s?\d{4}\s?\d{2}\s?\d{5}\b|\bNO\d{13}\b/g,
    hvorfor: 'kontonummer hører hjemme i regnskapssystemet, ikke i et offentlig repo'
  },
  {
    navn: 'e-post med passord på samme linje',
    // Backticks rundt e-posten brøt den første versjonen av dette mønsteret, og
    // det var nettopp slik den tredje lekkasjen var skrevet:
    //   `qa-autotest@mycelet.com` / `Kantarell2026!`
    regex: /[\w.+-]+@[\w.-]+\.\w+[`*"']*\s*\/\s*[`*"']*([^\s`*"'|<>]{8,})/g,
    hvorfor: 'formatet «bruker / passord» er nettopp slik alle tre lekkasjene så ut'
  }
];

describe('docs/ inneholder ingen hemmeligheter i klartekst', () => {
  const filer = markdownfiler(DOCS);

  it('finner faktisk dokumentene — ellers tester vi ingenting', () => {
    expect(filer.length).toBeGreaterThan(5);
  });

  it('har ingen passord, nøkler eller kontonummer skrevet ut', () => {
    const funn: string[] = [];
    for (const sti of filer) {
      const linjer = readFileSync(sti, 'utf8').split('\n');
      linjer.forEach((linje, i) => {
        // Linjer som beskriver selve hendelsen skal ikke felle testen.
        if (/kompromittert|lekket|byttet|sto i klartekst|aldri i en fil|BYTT DET/i.test(linje)) return;
        for (const { navn, regex, hvorfor } of MØNSTRE) {
          regex.lastIndex = 0;
          const m = regex.exec(linje);
          if (!m) continue;
          const verdi = m[1] ?? m[0];
          if (PEKER_VIDERE.test(verdi) || PEKER_VIDERE.test(linje)) continue;
          const fil = sti.slice(process.cwd().length + 1);
          funn.push(`${fil}:${i + 1} — ${navn}: ${hvorfor}\n    ${linje.trim().slice(0, 100)}`);
        }
      });
    }
    expect(
      funn,
      `\nHemmelighet i klartekst i et OFFENTLIG repo:\n\n${funn.join('\n\n')}\n\n` +
        `Skriv hvor verdien ligger, ikke hva den er.\n`
    ).toEqual([]);
  });
});
