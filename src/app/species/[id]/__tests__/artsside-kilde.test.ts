import { describe, expect, it } from 'vitest';

/**
 * Kildevakt for artssiden.
 *
 * Logikken ligger i rene moduler med egne tester (src/lib/species/), og
 * artsside-rendring.test.tsx rendrer hele siden med en etterlignet database.
 * Denne fila låser det en rendring ikke ser: HVORDAN siden spør (begge
 * retninger, radgrensen, feilflaggene) og at den går gjennom modulene i stedet
 * for å lese kolonnene selv — med samme kildelesing som lagre-porten.test.ts
 * og poison-hotline.test.ts.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs') as typeof import('node:fs');
const kilde = fs.readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

describe('forvekslingsartene leses i begge retninger', () => {
  it('spør både på artens egne rader og på radene som peker hit', () => {
    // Bare species_id ga «ikke ført inn ennå» på siden til grønn fluesopp,
    // flatklokkehatt og 18 andre arter som basen HADDE forvekslinger for.
    expect(kilde).toContain(".eq('species_id', id)");
    expect(kilde).toContain(".eq('look_alike_id', id)");
    expect(kilde).toContain('mushroom_species!look_alikes_look_alike_id_fkey(');
    expect(kilde).toContain('mushroom_species!look_alikes_species_id_fkey(');
  });

  it('holder radgrensen på begge spørringene', () => {
    expect(kilde.match(/\.limit\(FORVEKSLING_RADGRENSE\)/g)).toHaveLength(2);
  });

  it('melder fra om feil i begge spørringene — en feil er aldri en tom liste', () => {
    expect(kilde).toContain('framFeilet: Boolean(lookAlikesError)');
    expect(kilde).toContain('bakFeilet: Boolean(reverseLookAlikesError)');
    expect(kilde).toMatch(/forvekslinger\.ufullstendig \? \(\s*<p\s+role="alert"/);
  });

  it('sier «ikke ført inn ennå» bare når begge retninger er lest og tomme', () => {
    const treff = kilde.match(/\{forvekslinger\.ingenRegistrert \? \(\s*<p[^>]*>\s*\{t\('lookAlikesNoneRecorded'\)\}/);
    expect(treff).not.toBeNull();
    // Teksten har nøyaktig ett kallsted. Dukker det opp et til, har noen laget
    // en egen betingelse for den.
    expect(kilde.match(/t\('lookAlikesNoneRecorded'\)/g)).toHaveLength(1);
  });

  it('sier fra over kortene når de bare kommer fra den andre siden', () => {
    // «Ikke ført inn ennå» forsvant så snart én rad pekte hit, også for
    // matsopper uten egne rader: piggsopp sto med to «Spiselig»-kort og
    // ingenting om at dens egne forvekslinger aldri er ført inn.
    const treff = kilde.match(
      /\{forvekslinger\.egneRaderTomme && !isToxic \? \(\s*<p[^>]*>\s*\{t\('lookAlikesOwnNotRecorded', \{ count: forvekslinger\.kort\.length \}\)\}/
    );
    expect(treff).not.toBeNull();
    expect(kilde.match(/t\('lookAlikesOwnNotRecorded'/g)).toHaveLength(1);

    // Inne i seksjonen og over kortene — teksten sier «det som står under».
    const seksjon = kilde.indexOf('{forvekslinger.kort.length > 0 ? (');
    const forbehold = kilde.indexOf("t('lookAlikesOwnNotRecorded'");
    const kortene = kilde.indexOf('{forvekslinger.kort.map(');
    expect(seksjon).toBeGreaterThan(0);
    expect(forbehold).toBeGreaterThan(seksjon);
    expect(kortene).toBeGreaterThan(forbehold);
  });

  it('holder forbeholdet borte fra artene som har den røde boksen', () => {
    // Samme variabel styrer begge: der «ikke spis» står, er «betyr ikke at
    // arten er trygg å plukke» meningsløst, og alle andre arter får det.
    expect(kilde).toContain("const isToxic = species.edibility === 'toxic' || species.edibility === 'deadly';");
    expect(kilde).toMatch(/\{isToxic \? \(\s*<div\s+className=\{`rounded-2xl p-4 \$\{/);
  });

  it('viser faregraden bare på artens egne rader', () => {
    // Faregraden på en rad som peker HIT beskriver denne arten, ikke arten på
    // kortet. Den får et nøytralt merke i stedet.
    expect(kilde).toMatch(/kort\.faregrad \? \(/);
    expect(kilde).toContain("t('lookAlikeConfusedWithThis')");
    expect(kilde.match(/t\('dangerPrefix'\)/g)).toHaveLength(1);
  });

  it('lar bare artens egne rader gjøre spiselighetsnotatet til en advarsel', () => {
    expect(kilde).toContain("forwardRows.some((row) => row.danger_level === 'critical')");
  });

  it('viser både hvorfor de forveksles og hvordan de skilles, hele teksten', () => {
    // similarity_description ble hentet for alle 68 parene og aldri vist.
    expect(kilde).toMatch(/t\('whyConfused'\)[\s\S]{0,120}\{kort\.likhet\}/);
    expect(kilde).toMatch(/t\('howToTellApart'\)[\s\S]{0,120}\{kort\.skille\}/);
    // Skilleteksten er den sikkerhetsbærende. Ingen avkorting, ingen «les mer».
    expect(kilde).not.toMatch(/kort\.(skille|likhet)\??\.(slice|substring|substr)\(/);
    expect(kilde).not.toMatch(/className=[^>]*\b(line-clamp|truncate)\b/);
  });
});

describe('faktaene fra artsraden', () => {
  it('går gjennom byggArtsfakta, ikke rått fra basen', () => {
    expect(kilde).toContain('const fakta = byggArtsfakta(species, locale)');
    // Habitat sto rått som «barskog, blandingsskog» under en svensk etikett.
    expect(kilde).not.toMatch(/species\.habitat/);
    expect(kilde).toContain("fakta.habitat.join(', ')");
    // De andre kolonnene leses bare via fakta — der reglene per språk står.
    for (const kolonne of ['mycorrhizal_partners', 'substrate', 'commonality', 'cap_description', 'smell', 'taste']) {
      expect(kilde, kolonne).not.toContain(`species.${kolonne}`);
    }
  });

  it('rendrer ingen kjennetegn-overskrift uten kjennetegn', () => {
    expect(kilde).toMatch(/\{fakta\.kjennetegn\.length > 0 \? \(\s*<article/);
    expect(kilde.match(/t\('fieldMarksHeading'\)/g)).toHaveLength(1);
  });

  it('viser vanlighet bare når artsfakta gir en verdi', () => {
    expect(kilde).toMatch(/\{fakta\.vanlighet \? \(/);
    expect(kilde.match(/t\('commonalityLabel'\)/g)).toHaveLength(1);
  });
});

describe('norsk brødtekst på den svenske siden', () => {
  it('merkes som norsk i stedet for å utgi seg for å være svensk', () => {
    expect(kilde).toContain("const norskProsa = locale === 'sv' ? 'nb' : undefined");
    // Beskrivelse, de to notatboksene, toksin, symptomer og begge
    // forvekslingstekstene.
    expect(kilde.match(/lang=\{norskProsa\}/g)).toHaveLength(7);
  });
});

describe('sesongkurven', () => {
  it('får samme sesongvindu som tekstraden den står under', () => {
    // Én maske, to brukere: raden «Sesong jun – okt» og porten i
    // hentSesongkurve. To masker kunne gitt en kurve som motsier raden.
    expect(kilde.match(/baseSeasonMask\(\{/g)).toHaveLength(1);
    expect(kilde).toContain('const sesongkurve = hentSesongkurve(species.id, sesongmaske)');
    expect(kilde).toContain("formatSeasonMask(sesongmaske, monthNames, t('emptyValue'))");
  });

  it('tar dagens dato fra sesongtilstand, i Oslo-tid', () => {
    expect(kilde).toContain('sesongkurveVisning(sesongkurve, sesongtilstand().osloDato)');
    // Ingen egen klokke på siden: Vercel kjører i UTC, og 23:30 UTC er neste
    // dag i Oslo.
    expect(kilde).not.toMatch(/new Date\(/);
  });

  it('rendres per forespørsel, så «i dag» ikke fryses i en bufret side', () => {
    expect(kilde).not.toMatch(/export const (revalidate|dynamic)\b/);
    expect(kilde).not.toContain('generateStaticParams');
  });

  it('vises bare når det finnes en kurve, som en verdi nummer to under «Sesong»', () => {
    expect(kilde).toMatch(/\{kurve \? \(\s*<dd className="col-span-2[^"]*">\s*<SesongKurve /);
    expect(kilde.match(/<SesongKurve /g)).toHaveLength(1);
  });

  it('er lik for matsopp og giftsopp', () => {
    // Kurven sier når arten er registrert. Den skal verken skjules, farges
    // eller få annen tekst etter spiselighet.
    const start = kilde.indexOf('const sesongkurve = hentSesongkurve');
    const beregning = kilde.slice(start, kilde.indexOf(': null;', start));
    expect(beregning.length).toBeGreaterThan(100);
    expect(beregning).not.toMatch(/edibility|isToxic|isRecommendable|isDangerous/);
    const rendring = kilde.slice(kilde.indexOf('{kurve ? ('), kilde.indexOf('<dt className={DETAIL_TERM}>{t(\'habitatLabel\')}</dt>'));
    expect(rendring).toContain('<SesongKurve ');
    expect(rendring).not.toMatch(/edibility|isToxic|isRecommendable|isDangerous/);
  });
});

describe('«Se etter»-linja', () => {
  it('går gjennom porten i se-etter.ts, aldri rett på setningsbyggeren', () => {
    // buildWhatToLookFor skriver like gjerne et søkeråd for grønn fluesopp.
    // Porten (bare matsopp) står i byggSeEtterLinje.
    expect(kilde).toContain('const seEtter = byggSeEtterLinje(species, locale)');
    expect(kilde).not.toContain('buildWhatToLookFor');
    expect(kilde).not.toContain('what-to-look-for');
  });

  it('vises bare når det finnes en linje, under én overskrift', () => {
    expect(kilde).toMatch(/\{seEtter \? \(\s*<div[^>]*>\s*<dt[^>]*>\{t\('lookForLabel'\)\}<\/dt>\s*<dd[^>]*>\{seEtter\}<\/dd>/);
    expect(kilde.match(/t\('lookForLabel'\)/g)).toHaveLength(1);
    expect(kilde.match(/\{seEtter\}/g)).toHaveLength(1);
  });
});

describe('bildene', () => {
  it('gir hovedbildet de bredere utgavene originalen har, og sier hvor bredt det vises', () => {
    // Bildene er lagret 330 eller 500 piksler brede og ble strukket to–tre
    // ganger i hovedruta.
    expect(kilde).toContain('srcSet: hovedbildeSrcSet(photo.image_url)');
    expect(kilde).toContain('<SpeciesPhotoCarousel photos={bilder} speciesName={displayName} sizes={HOVEDBILDE_SIZES} />');
  });

  it('laster bildene på forvekslingskortene først når de trengs, med den lagrede utgaven som reserve', () => {
    const kort = /<Artsbilde\s+src=\{kortbilde\(lookAlike\.primary_image_url\)\}\s+reserve=\{lookAlike\.primary_image_url\}[^>]*loading="lazy"/;
    expect(kilde).toMatch(kort);
    // Ingen rå <img> på siden: alle bilder går gjennom Artsbilde eller
    // karusellen, som har reserven.
    expect(kilde).not.toMatch(/<img\b/);
  });

  it('krediterer bildet på hvert forvekslingskort', () => {
    // CC BY / CC BY-SA krever fotograf og lisens der bildet vises. Kortene
    // viste Commons-bildene uten.
    for (const kolonne of ['primary_image_photographer', 'primary_image_license', 'primary_image_source_url']) {
      expect(kilde, kolonne).toContain(`${kolonne}`);
      expect(kilde.slice(kilde.indexOf('const LOOK_ALIKE_SPECIES_FIELDS'), kilde.indexOf('/** Én rad i «Detaljer»')), kolonne).toContain(
        kolonne
      );
    }
    expect(kilde).toMatch(
      /\{lookAlike\.primary_image_url \? \(\s*<PhotoCredit\s+photographer=\{lookAlike\.primary_image_photographer \?\? null\}\s+license=\{lookAlike\.primary_image_license \?\? null\}\s+sourceUrl=\{lookAlike\.primary_image_source_url \?\? null\}/
    );
  });

  it('holder krediteringen utenfor lenka til arten', () => {
    // Krediteringen er selv en lenke (til filsiden på Commons). En lenke inne
    // i en lenke er ugyldig, og nettlesere deler dem på uforutsigbare måter.
    const lenkeStart = kilde.indexOf('<Link href={`/species/${lookAlike.id}`}');
    const lenkeSlutt = kilde.indexOf('</Link>', lenkeStart);
    expect(lenkeStart).toBeGreaterThan(0);
    expect(kilde.slice(lenkeStart, lenkeSlutt)).not.toContain('<PhotoCredit');
    expect(kilde.indexOf('<PhotoCredit', lenkeSlutt)).toBeGreaterThan(lenkeSlutt);
  });
});

describe('det siden forteller søkemotorene', () => {
  it('kutter ikke metabeskrivelsen midt i et ord', () => {
    // Var description.slice(0, 155).
    expect(kilde).toContain('const beskrivelse = metabeskrivelse({');
    expect(kilde).not.toMatch(/\.slice\(0, 155\)/);
  });

  it('bygger metabeskrivelsen av den nøytrale setningen på begge språk, aldri av brødteksten', () => {
    // Søketreffet og delingskortet siteres uten siden rundt, akkurat som de
    // strukturerte dataene. Den norske beskrivelsen var ingressen fra basen, og
    // 23 av 80 ingresser sier noe om matverdi («Trygg og god matsopp.»).
    const meta = kilde.slice(kilde.indexOf('export async function generateMetadata'), kilde.indexOf('function formatSeasonMask'));
    expect(meta.length).toBeGreaterThan(500);
    expect(meta).toContain("grunnsetning: sesong ? t('structuredDataDescription', setning) : null");
    expect(meta).toContain("kortGrunnsetning: sesong ? t('metaDescriptionShort', setning) : null");
    // Ingen tekstkolonne fra basen: ingressen hentes ikke engang.
    expect(meta).not.toMatch(/art\.(description|edibility_notes|toxin_info|symptoms)\b/);
    expect(meta).not.toMatch(/\bingress\s*:/);
    const kolonner = meta.match(/\.select\('([^']+)'\)/)?.[1].split(',') ?? [];
    expect(kolonner).toContain('latin_name');
    expect(kolonner).not.toContain('*');
    expect(kolonner.filter((kolonne) => /description|notes|toxin|symptom/.test(kolonne))).toEqual([]);
  });

  it('nevner artens navn på det andre språket, når det er et annet navn', () => {
    expect(kilde).toContain("(locale === 'sv' ? art.norwegian_name : art.swedish_name)");
    expect(kilde).toContain('annetNavn.toLowerCase() !== navn.toLowerCase()');
    expect(kilde).toContain("tillegg: erAnnetNavn ? t('metaOtherLanguageName', { name: annetNavn }) : null");
  });

  it('bygger de strukturerte dataene i artsmetadata.ts og skriver dem trygt ut', () => {
    expect(kilde).toContain('const jsonLd = byggArtJsonLd({');
    expect(kilde).toContain('dangerouslySetInnerHTML={{ __html: jsonLdTilScript(jsonLd) }}');
    // Navnene kommer fra basen: aldri rett inn i en <script> uten at «<» er
    // gjort ufarlig.
    expect(kilde).not.toContain('JSON.stringify(jsonLd)');
  });

  it('gir de strukturerte dataene den nøytrale setningen, aldri brødteksten', () => {
    const start = kilde.indexOf('const jsonLd = byggArtJsonLd({');
    const kall = kilde.slice(start, kilde.indexOf('});', start));
    expect(kall).toContain(
      "t('structuredDataDescription', { name: displayName, latin: species.latin_name, season: sesongTekst })"
    );
    // 23 av 80 ingresser sier noe om matverdi. Ingen av tekstfeltene fra
    // basen, og ingenting om spiselighet, sendes inn her.
    expect(kall).not.toMatch(/species\.(description|edibility|edibility_notes|toxin_info|symptoms)/);
  });

  it('bruker den bredeste utgaven av bildet i delingskortet og i de strukturerte dataene', () => {
    expect(kilde).toContain('const delingsbilde = bredesteUtgave(art.primary_image_url)');
    expect(kilde).toContain('bildeUrl: bredesteUtgave(species.primary_image_url)');
  });
});
