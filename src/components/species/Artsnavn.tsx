import { Fragment } from 'react';

/**
 * Et artsnavn som aldri blir kuttet av kortkanten.
 *
 * Navnet er ofte ETT langt ord i en smal kolonne, og kortene har
 * overflow-hidden. Uten bryting ble «Snøballsjampinjong» (160 px i Fraunces 700)
 * og «Brunkjøttbukkesopp» (167 px) kuttet på en telefon: i biblioteket hadde
 * navnet 139,5 px ved 375 px skjermbredde og 132 px ved 360 px, og i
 * forvekslingstreneren enda mindre. Tre ting hindrer det:
 *
 *  · break-words: ordet deles heller enn å stikke ut. Virker i alle nettlesere.
 *  · hyphens-auto: delingen får bindestrek på en stavelsesgrense der
 *    nettleseren har orddeling for språket i <html lang> («Snøballsjam-pinjong»).
 *  · hvert ord er sin egen inline-blokk, aldri bredere enn linja: ordet flyttes
 *    helt ned på neste linje, og deles bare når det ikke får plass der alene.
 *    Med hyphens-auto på hele navnet deler Safari — og dermed appen, som er
 *    WKWebView — også ord som bare kunne flyttet seg: «Rødnende flue-sopp»,
 *    «Gulnende krem-le». Chrome gjør det samme med text-wrap: balance.
 *
 * Mellomrommet står mellom blokkene, så elementets tekst (og navnet på en
 * lenke eller knapp rundt) er fortsatt hele navnet. Målt med den bygde skriften
 * i Chrome og WebKit på 320–430 px; jsdom har ingen layout, så testene kan bare
 * låse klassene.
 *
 * Brukes av artskortet i biblioteket, kalenderens artsrader og
 * forvekslingstreneren. Typografien (skrift, farge, linjehøyde) gir kallstedet.
 */
export const ORDBLOKK_KLASSER = 'inline-block max-w-full break-words hyphens-auto';

export function Artsnavn({
  navn,
  as: Element = 'span',
  className
}: {
  navn: string;
  as?: 'span' | 'p' | 'h2' | 'h3';
  className?: string;
}) {
  return (
    <Element className={className}>
      {navn
        .trim()
        .split(/\s+/)
        .map((ord, i) => (
          <Fragment key={i}>
            {i > 0 ? ' ' : null}
            <span className={ORDBLOKK_KLASSER}>{ord}</span>
          </Fragment>
        ))}
    </Element>
  );
}
