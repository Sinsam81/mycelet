import { describe, it, expect } from 'vitest';
import { isRecommendableSpecies } from '@/lib/prediction/recommendable';

/**
 * Sikkerhetsinvariant: AI-resultatlista skal aldri gi et grønt «spiselig»-
 * stempel til et forslag.
 *
 * Kodebasen har ikke oppsett for komponenttester (ingen testing-library,
 * ingen jsdom), så vi låser regelen slik entity.test.ts og
 * content-filter.test.ts allerede gjør det: ved å lese kilden. Det er mindre
 * elegant enn å rendre komponenten, men det fanger nøyaktig det vi er redde
 * for — at noen senere «forenkler» kortet tilbake til et rått EdibilityBadge.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs') as typeof import('node:fs');
const les = (relativ: string) => fs.readFileSync(new URL(relativ, import.meta.url), 'utf8');
/** JSX- og blokk-kommentarer nevner EdibilityBadge når de forklarer regelen. */
const utenKommentarer = (kilde: string) =>
  kilde.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

// Regelen bor i ÉN komponent. De tre flatene som viser et AI-forslag —
// resultatlista, «Ditt forslag» i forvekslingskortet og historikklista — skal
// alle gå gjennom den. Før sto regelen bare i IdentifyResult, og de to andre
// stemplet det samme forslaget grønt «Spiselig».
const source = les('../AiEdibilityBadge.tsx');
const resultat = utenKommentarer(les('../IdentifyResult.tsx'));
const forveksling = utenKommentarer(les('../LookAlikeCheck.tsx'));
const historikk = utenKommentarer(les('../../../app/identifiseringer/page.tsx'));

describe('spiselighet i AI-resultatet', () => {
  it('viser EdibilityBadge bare når arten IKKE er en spiseinvitasjon', () => {
    // Merket skal stå bak en negert isRecommendableSpecies-sjekk.
    expect(source).toMatch(/if \(!isRecommendableSpecies\(\s*edibility\s*\)\)\s*\{[\s\S]{0,120}<EdibilityBadge/);
    // … og det skal være det ENESTE rå merket i komponenten.
    expect(utenKommentarer(source).match(/<EdibilityBadge/g)).toHaveLength(1);
  });

  it('har en nøytral «ikke matvurdert»-merking for de spiselige klassene', () => {
    expect(source).toContain("t('notFoodAssessed')");
  });

  // MERK: denne påstanden ville også passert på koden FØR endringen, siden
  // isHazardSpecies aldri sto her. Den beviser altså ingenting om denne
  // endringen — den er en vakt mot at noen SENERE bytter predikat, fordi
  // isHazardSpecies dekker bare toxic/deadly og ville gitt «ikke matvurdert»
  // til ukjente arter, som SafetyWarning behandler som farlige.
  it('bytter ikke til isHazardSpecies senere — det ville sluppet ukjente arter gjennom', () => {
    expect(utenKommentarer(source)).not.toContain('isHazardSpecies');
  });

  it('resultatlista bruker AiEdibilityBadge og aldri et rått EdibilityBadge', () => {
    expect(resultat).toContain('<AiEdibilityBadge edibility={suggestion.edibility} />');
    expect(resultat).not.toContain('<EdibilityBadge');
  });

  it('historikklista bruker AiEdibilityBadge og aldri et rått EdibilityBadge', () => {
    // Radene der er ubekreftede AI-forslag uten noen advarsel rundt seg.
    expect(historikk).toContain('<AiEdibilityBadge edibility={art.edibility} />');
    expect(historikk).not.toContain('<EdibilityBadge');
  });

  it('«Ditt forslag» i forvekslingskortet får aldri forslagets spiselighet i et rått merke', () => {
    expect(forveksling).toContain('badge={<AiEdibilityBadge edibility={suggestion.edibility} />}');
    // Det rå merket finnes fortsatt — men bare for den kuraterte, farlige
    // forvekslingsarten. Ingenting som stammer fra `suggestion.edibility`.
    expect(forveksling).not.toMatch(/<EdibilityBadge[^>]*suggestion/);
    expect(forveksling).not.toMatch(/asEdibility\(\s*suggestion/);
    expect(forveksling.match(/<EdibilityBadge/g)).toHaveLength(1);
    expect(forveksling).toContain('<EdibilityBadge edibility={dangerEdibility} />');
  });

  it('dobbeltgjengeren får det rå merket bare når den ikke er mat', () => {
    // Speilrader fra den farlige siden peker på matsoppen. Uten sperren fikk
    // et forslag om falsk kantarell «Farlig dobbeltgjenger: Kantarell» med et
    // grønt «Spiselig». Rendringen er låst i LookAlikeCheck.test.tsx.
    expect(forveksling).toMatch(
      /dangerEdibility\s*&&\s*!isRecommendableSpecies\(dangerEdibility\)\s*\?\s*<EdibilityBadge edibility=\{dangerEdibility\} \/>/
    );
  });

  it('kaller treffet bildelikhet, ikke «treff»', () => {
    // Å sjekke at t('matchLabel') finnes ville vært tomt — nøkkelen fantes før
    // også. Det som endret seg er VERDIEN: «treff» leses som en vurdering av
    // soppen, «bildelikhet» sier hva tallet faktisk måler.
    for (const [locale, expected] of [
      ['nb', 'bildelikhet'],
      ['sv', 'bildlikhet']
    ] as const) {
      const messages = JSON.parse(
        fs.readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8')
      );
      expect(messages.IdentifyResult.matchLabel).toBe(expected);
      expect(messages.IdentifyResult.matchLabel).not.toBe('treff');
      // Historikklista skrev «N % treff» for det samme tallet.
      expect(messages.Identifiseringer.probability).toContain(expected);
      expect(messages.Identifiseringer.probability).not.toMatch(/treff|träff/);
    }
  });

  it('har «ikke matvurdert» i begge språk', () => {
    // Uten den svenske ville svenske brukere fått en tom merking der den
    // norske sier noe viktig.
    for (const locale of ['nb', 'sv']) {
      const messages = JSON.parse(
        fs.readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8')
      );
      expect(messages.IdentifyResult.notFoodAssessed).toBeTruthy();
    }
  });
});

describe('predikatet regelen hviler på', () => {
  // Hvis disse noen gang endrer seg, endrer betydningen av kortet seg med dem.
  it.each([
    ['edible', true],
    ['conditionally_edible', true],
    ['inedible', false],
    ['toxic', false],
    ['deadly', false],
    ['unknown', false],
    [null, false],
    ['noe-tull', false]
  ] as const)('%s er spiseinvitasjon: %s', (edibility, expected) => {
    expect(isRecommendableSpecies(edibility)).toBe(expected);
  });

  it('alt som ikke er spiselig beholder et tydelig merke', () => {
    // Selve asymmetrien, uttrykt som en påstand: ingen farlig klasse kan havne
    // i «ikke matvurdert»-grenen.
    for (const hazard of ['toxic', 'deadly', 'unknown', 'inedible']) {
      expect(isRecommendableSpecies(hazard)).toBe(false);
    }
  });
});
