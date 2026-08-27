import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES } from '@/i18n/config';

/**
 * iOS-bunten må erklære nøyaktig de språkene web-appen faktisk leverer.
 *
 * Bakgrunnen er en ekte feil i produksjon: appen lå ute i svensk App Store med
 * fullt lokalisert svensk butikkside — svensk tittel, svensk beskrivelse,
 * svenske skjermbilder — mens «Språk»-raden på produktsiden oppga «Norsk
 * bokmål» som eneste språk. Apple leser nemlig den raden fra BUNTEN, ikke fra
 * metadataen i App Store Connect (Technical Q&A QA1828), og Info.plist hadde
 * ingen CFBundleLocalizations.
 *
 * Feilen er stille i begge retninger, og det er derfor den er verdt en test:
 *  · Legges et nytt språk til i LOCALES uten å komme inn her, oppgir App
 *    Store igjen for få språk — usynlig helt til noen leser produktsiden.
 *  · Erklæres et språk vi IKKE leverer (klassisk: en `en` som sniker seg inn
 *    fra et Xcode-oppsett), lover produktsiden engelsk UI som ikke finnes.
 *    Det er den varianten Apple faktisk avviser på retningslinje 2.3.
 *
 * Testen leser plisten som tekst i stedet for å kalle `plutil`: den skal kunne
 * kjøre i CI på Linux, der `plutil` ikke finnes.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs') as typeof import('node:fs');
const plist = fs.readFileSync(new URL('../../../ios/App/App/Info.plist', import.meta.url), 'utf8');

/** Verdiene i en <array>-nøkkel, eller null om nøkkelen mangler. */
function arrayValues(key: string): string[] | null {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<array>([\\s\\S]*?)</array>`));
  if (!match) return null;
  return [...match[1].matchAll(/<string>(.*?)<\/string>/g)].map((m) => m[1]);
}

function stringValue(key: string): string | null {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<string>(.*?)</string>`));
  return match ? match[1] : null;
}

describe('iOS-buntens språkerklæring', () => {
  it('erklærer nøyaktig språkene web-appen leverer — verken flere eller færre', () => {
    const declared = arrayValues('CFBundleLocalizations');
    expect(declared, 'CFBundleLocalizations mangler i ios/App/App/Info.plist').not.toBeNull();
    expect([...declared!].sort()).toEqual([...LOCALES].sort());
  });

  it('har utviklingsregionen satt til appens standardspråk', () => {
    // Utviklingsregionen er fallbacken iOS bruker når enhetens språk ikke er
    // blant de erklærte. Den må peke på språket appen faktisk faller tilbake
    // til (DEFAULT_LOCALE i src/i18n/config.ts), ellers spriker fallbacken i
    // bunten fra fallbacken i koden.
    expect(stringValue('CFBundleDevelopmentRegion')).toBe(DEFAULT_LOCALE);
  });

  it('holder web-appens domener app-bundet — språkvalget skjer i den innlastede web-appen', () => {
    // CFBundleLocalizations avgjør hvilken Accept-Language WKWebView sender;
    // WKAppBoundDomains avgjør at det i det hele tatt er www.mycelet.com som
    // lastes. Ryker den ene, blir den andre meningsløs.
    expect(arrayValues('WKAppBoundDomains')).toContain('www.mycelet.com');
  });
});
