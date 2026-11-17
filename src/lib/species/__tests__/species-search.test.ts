import { describe, expect, it } from 'vitest';
import {
  BOYNINGSENDELSER,
  MIN_SOKELENGDE,
  MIN_STAMMELENGDE,
  SYNONYMRANG,
  normaliserSok,
  rangerArt,
  sokIArter,
  type SokbarArt
} from '@/lib/species/species-search';
import { compareSpeciesByDisplayName, getSpeciesDisplayName } from '@/lib/utils/species-name';
import { ARTSKATALOG, art } from './artskatalog-fixture';

/**
 * Artssøket, mot hele den ekte katalogen (80 arter, se fixturen).
 *
 * Søkene i den første blokka er de som ga NULL treff i biblioteket før: norsk
 * søk gikk til en RPC som verken leste svenske navn eller synonymer og ikke
 * brettet tegn. Resten holder på rangeringen (den ble kastet av en alfabetisk
 * sortering etterpå), på at beskrivelsen aldri gir treff, og på at tegnsetting
 * i søket er ufarlig — på svensk ga et komma «Kunde inte hämta arter».
 */

const navn = (arter: readonly SokbarArt[], locale = 'nb') => arter.map((a) => getSpeciesDisplayName(a, locale));
const sok = (tekst: string, locale = 'nb') => navn(sokIArter(ARTSKATALOG, tekst, locale), locale);

describe('søk som ga null treff i det norske biblioteket', () => {
  it('«karljohan» finner steinsopp gjennom det svenske navnet', () => {
    expect(sok('karljohan')).toEqual(['Steinsopp']);
  });

  it('«karl johan» med mellomrom er samme søk', () => {
    expect(sok('karl johan')).toEqual(['Steinsopp']);
    expect(sok('Karl-Johan')).toEqual(['Steinsopp']);
  });

  it('«stensopp» finner artene som heter det på svensk', () => {
    expect(sok('stensopp')).toEqual(['Bleklodden steinsopp', 'Rødbrun steinsopp']);
  });

  it('«flugsvamp» finner alle seks fluesoppene', () => {
    // De fem der «flugsvamp» er et eget ord i det svenske navnet kommer før
    // «Panterflugsvamp», der søket bare står inne i ordet.
    expect(sok('flugsvamp')).toEqual([
      'Brun fluesopp',
      'Grønn fluesopp',
      'Hvit fluesopp',
      'Rød fluesopp',
      'Rødnende fluesopp',
      'Panterfluesopp'
    ]);
  });

  it('«trattkantarell» finner traktkantarell', () => {
    expect(sok('trattkantarell')).toEqual(['Traktkantarell']);
  });

  it('«rodskrubb» uten ø finner rødskrubb', () => {
    expect(sok('rodskrubb')).toEqual(['Rødskrubb']);
  });

  it('et eldre vitenskapelig navn finner arten — «Clitocybe dealbata» er hvit traktsopp', () => {
    expect(sok('Clitocybe dealbata')).toEqual(['Hvit traktsopp']);
    expect(sok('Inocybe erubescens')).toEqual(['Rødnende trådsopp']);
    expect(sok('Albatrellus confluens')).toEqual(['Franskbrødsopp']);
  });

  it('svensk «champinjon» finner sjampinjongene, også den giftige', () => {
    expect(sok('champinjon')).toEqual(['Karbol-sjampinjong', 'Sjampinjong', 'Skogsjampinjong', 'Snøballsjampinjong']);
  });
});

describe('samme søk virker fra begge språk', () => {
  it('svensk leser finner arten på det norske navnet', () => {
    expect(sok('steinsopp', 'sv')).toEqual(['Karljohan', 'Finluden stensopp', 'Rödbrun stensopp']);
    expect(sok('fluesopp', 'sv')).toHaveLength(6);
  });

  it('svenske tegn kan skrives uten prikker', () => {
    expect(sok('rod flugsvamp', 'sv')).toEqual(['Röd flugsvamp']);
    expect(sok('angschampinjon', 'sv')).toEqual(['Ängschampinjon']);
    expect(sok('lomsk', 'sv')).toEqual(['Lömsk flugsvamp']);
  });

  it('ö og ø er samme bokstav i søket', () => {
    expect(sok('smörsopp')).toEqual(['Smørsopp']);
    expect(sok('smørsopp', 'sv')).toEqual(['Smörsopp']);
  });

  it('latinsk og engelsk navn treffer uansett språk', () => {
    for (const locale of ['nb', 'sv']) {
      expect(sokIArter(ARTSKATALOG, 'boletus edulis', locale)[0]).toBe(art('Steinsopp'));
      expect(sokIArter(ARTSKATALOG, 'death cap', locale)).toEqual([art('Grønn fluesopp')]);
    }
  });
});

describe('rangering — beste treff først', () => {
  it('«kantarell» setter Kantarell foran Blek kantarell og Falsk kantarell', () => {
    // Nøyaktig navn, så navn der et senere ord starter med søket (alfabetisk
    // seg imellom), så navn som bare inneholder det.
    expect(sok('kantarell')).toEqual(['Kantarell', 'Blek kantarell', 'Falsk kantarell', 'Traktkantarell']);
  });

  it('gjelder navnet LESEREN ser — på svensk heter falsk kantarell «narrkantarell»', () => {
    // Narrkantarell inneholder bare søket i det svenske navnet, men det norske
    // («Falsk kantarell») har et ord som starter med det.
    expect(sok('kantarell', 'sv')).toEqual(['Kantarell', 'Blek kantarell', 'Narrkantarell', 'Trattkantarell']);
  });

  it('et navn som starter med søket kommer foran et som bare inneholder det', () => {
    const treff = sok('stein');
    expect(treff[0]).toBe('Steinsopp');
    expect(treff.slice(1)).toEqual(['Bleklodden steinsopp', 'Rødbrun steinsopp']);
  });

  it('nøyaktig treff på et annet navn slår et prefiks på navnet leseren ser', () => {
    // «brunsopp» er det svenske navnet på svartbrun rørsopp.
    expect(sok('brunsopp')[0]).toBe('Svartbrun rørsopp');
  });

  it('rangene står i den rekkefølgen filhodet lover', () => {
    const kantarell = art('Kantarell');
    const blek = art('Blek kantarell');
    const trakt = art('Traktkantarell');
    const steinsopp = art('Steinsopp');
    const hvitTraktsopp = art('Hvit traktsopp');

    const eksakt = rangerArt(kantarell, 'kantarell', 'nb');
    const eksaktAnnet = rangerArt(steinsopp, 'karljohan', 'nb');
    const prefiks = rangerArt(kantarell, 'kant', 'nb');
    const ordprefiks = rangerArt(blek, 'kant', 'nb');
    const delstreng = rangerArt(trakt, 'kant', 'nb');
    const synonym = rangerArt(hvitTraktsopp, 'dealbata', 'nb');

    expect(eksakt).toBe(0);
    expect(synonym).toBe(SYNONYMRANG);
    const stigende = [eksakt, eksaktAnnet, prefiks, ordprefiks, delstreng, synonym];
    expect(stigende.every((rang) => rang != null)).toBe(true);
    expect([...stigende].sort((a, b) => a! - b!)).toEqual(stigende);
    expect(new Set(stigende).size).toBe(stigende.length);
  });

  it('samme rang sorteres etter navnet leseren ser', () => {
    const treff = sokIArter(ARTSKATALOG, 'kremle', 'nb');
    const sammeRang = treff.filter((a) => rangerArt(a, 'kremle', 'nb') === rangerArt(treff[0], 'kremle', 'nb'));
    expect(sammeRang.length).toBeGreaterThan(1);
    expect(navn(sammeRang)).toEqual(navn([...sammeRang].sort((a, b) => compareSpeciesByDisplayName(a, b, 'nb'))));
  });
});

describe('beskrivelsen gir aldri treff', () => {
  it('«sjampinjong» gir ikke hvit fluesopp, selv om teksten om den nevner sjampinjong', () => {
    // Slik sto raden i basen 10. november 2026. Det gamle søket leste
    // beskrivelsen, og listet dermed en dødelig art under et søk på en matsopp.
    const medBeskrivelse = ARTSKATALOG.map((rad) =>
      rad.norwegian_name === 'Hvit fluesopp'
        ? { ...rad, description: 'Helt hvit, slank, ring på stilken og knoll i bunnen. Lett å forveksle med sjampinjong.' }
        : rad
    );
    const treff = navn(sokIArter(medBeskrivelse, 'sjampinjong', 'nb'));
    expect(treff).toEqual(['Sjampinjong', 'Karbol-sjampinjong', 'Skogsjampinjong', 'Snøballsjampinjong']);
    expect(treff).not.toContain('Hvit fluesopp');
  });

  it('en art uten navnetreff er ikke et treff, uansett hva andre felter inneholder', () => {
    const rad = { ...art('Hvit fluesopp'), description: 'kantarell kantarell kantarell', habitat: ['kantarell'] };
    expect(rangerArt(rad, 'kantarell', 'nb')).toBeNull();
  });
});

describe('tegnsetting i søket er ufarlig', () => {
  it.each(['kantarell,', '(kantarell)', 'kantarell.', '"kantarell"', 'kantarell%', 'kant*arell', 'kantarell\\'])(
    '%s gir samme treff som «kantarell»',
    (tekst) => {
      expect(sok(tekst)).toEqual(sok('kantarell'));
    }
  );

  it('et søk som ikke kan treffe noe, gir en tom liste — ikke en feil', () => {
    expect(sok('kantarell, steinsopp')).toEqual([]);
    expect(sok('),(%_*')).toHaveLength(ARTSKATALOG.length);
    expect(sok('грибы')).toEqual([]);
  });

  it('bindestrek og apostrof i NAVNET teller heller ikke', () => {
    expect(sok('karbolsjampinjong')).toEqual(['Karbol-sjampinjong']);
    expect(sok('auricula judae')).toEqual(['Judasøre']);
    expect(sok('angels wings')).toEqual(['Krittøsterssopp']);
  });
});

describe('uten søk', () => {
  it('hele katalogen, sortert etter navnet leseren ser', () => {
    for (const locale of ['nb', 'sv']) {
      const alle = sokIArter(ARTSKATALOG, '', locale);
      expect(alle).toHaveLength(ARTSKATALOG.length);
      expect(navn(alle, locale)).toEqual(
        navn([...ARTSKATALOG].sort((a, b) => compareSpeciesByDisplayName(a, b, locale)), locale)
      );
    }
  });

  it('ett tegn og bare mellomrom filtrerer ikke', () => {
    expect(MIN_SOKELENGDE).toBe(2);
    expect(sok('k')).toHaveLength(ARTSKATALOG.length);
    expect(sok('   ')).toHaveLength(ARTSKATALOG.length);
    expect(sok(' ø ')).toHaveLength(ARTSKATALOG.length);
    expect(rangerArt(art('Kantarell'), 'k', 'nb')).toBe(0);
  });

  it('endrer ikke lista som kom inn', () => {
    const inn = [...ARTSKATALOG];
    sokIArter(inn, '', 'nb');
    sokIArter(inn, 'kantarell', 'nb');
    expect(inn).toEqual([...ARTSKATALOG]);
  });
});

describe('bøyde former — flertall og bestemt form', () => {
  // Det gamle norske søket brukte Postgres' ordstammer, så «kantareller» traff
  // «Kantarell». En ren tekstsammenligning gjør ikke det av seg selv.
  it('«kantareller» gir det samme som «kantarell»', () => {
    expect(sok('kantareller')).toEqual(['Kantarell', 'Blek kantarell', 'Falsk kantarell', 'Traktkantarell']);
    expect(sok('kantarellen')).toEqual(sok('kantarell'));
    expect(sok('kantarellene')).toEqual(sok('kantarell'));
  });

  it('treffene står stille mens man skriver seg fram til flertallsformen', () => {
    expect(sok('kantarelle')).toEqual(sok('kantarell'));
    expect(sok('fluesoppe')).toEqual(sok('fluesopp'));
  });

  it('norsk flertall og bestemt form av de vanlige slektsnavnene', () => {
    expect(sok('fluesopper')).toEqual(sok('fluesopp'));
    expect(sok('fluesopper')).toHaveLength(6);
    expect(sok('fluesoppene')).toEqual(sok('fluesopp'));
    expect(sok('steinsoppen')[0]).toBe('Steinsopp');
    expect(sok('sjampinjonger')).toEqual(sok('sjampinjong'));
    expect(sok('sjampinjonger')[0]).toBe('Sjampinjong');
    expect(sok('musseronger')).toEqual(sok('musserong'));
    expect(sok('piggsopper')).toEqual(['Piggsopp', 'Rødgul piggsopp']);
  });

  it('ord som ender på -e: «kremler», «kremlene» og «risker»', () => {
    const kremler = sok('kremle');
    expect(kremler.length).toBeGreaterThan(5);
    expect(sok('kremler')).toEqual(kremler);
    expect(sok('kremlene')).toEqual(kremler);
    expect(sok('risker')).toEqual(sok('riske'));
  });

  it('svensk flertall og bestemt form', () => {
    expect(sok('flugsvampar', 'sv')).toEqual(sok('flugsvamp', 'sv'));
    expect(sok('flugsvamparna', 'sv')).toEqual(sok('flugsvamp', 'sv'));
    expect(sok('kantarellerna', 'sv')).toEqual(sok('kantarell', 'sv'));
    expect(sok('champinjoner', 'sv')).toEqual(sok('champinjon', 'sv'));
    expect(sok('murklor', 'sv')).toEqual(sok('murkla', 'sv'));
    expect(sok('murklorna', 'sv')).toEqual(sok('murkla', 'sv'));
    expect(sok('riskor', 'sv')).toEqual(sok('riska', 'sv'));
    expect(sok('soppen', 'sv')).toEqual(sok('sopp', 'sv'));
  });

  it('intetkjønn og engelsk flertall', () => {
    expect(sok('judasøret')).toEqual(['Judasøre']);
    expect(sok('chanterelles')).toEqual(sok('chanterelle'));
    expect(sok('morels')).toEqual(sok('morel'));
  });

  it('ord på -el mister e-en når de bøyes: «morkler» og «morklene» finner de fire morklene', () => {
    // «morkl» står ikke i «morkel», så det holdt ikke å klippe endelsen. Begge
    // søkene ga null treff — for nettopp artene kalenderen peker på om våren.
    const morkler = ['Spiss morkel', 'Vanlig morkel', 'Sandmorkel', 'Stankmorkel'];
    expect(sok('morkel')).toEqual(morkler);
    expect(sok('morkler')).toEqual(morkler);
    expect(sok('morklene')).toEqual(morkler);
    expect(sok('morklar')).toEqual(morkler);
    expect(sok('morklane')).toEqual(morkler);
    expect(sok('sandmorkler')).toEqual(['Sandmorkel']);
    expect(sok('stankmorklene')).toEqual(['Stankmorkel']);
    expect(sok('morkler', 'sv')).toEqual(sok('morkel', 'sv'));
    expect(sok('morkler', 'sv')).toHaveLength(4);
  });

  it('treffene står stille forbi «morkl» og «morkle» mens man skriver «morklene»', () => {
    const morkler = sok('morkel');
    for (const underveis of ['mork', 'morkl', 'morkle', 'morkler', 'morklen', 'morklene']) {
      expect(sok(underveis), underveis).toEqual(morkler);
    }
  });

  it('svensk mister e-en på samme måte: «tryfflar» finner gul rottryffel', () => {
    expect(sok('tryffel', 'sv')).toEqual(['Gul rottryffel']);
    for (const form of ['tryffl', 'tryffla', 'tryfflar', 'tryfflarna', 'rottryfflar']) {
      expect(sok(form, 'sv'), form).toEqual(['Gul rottryffel']);
    }
  });

  it('e-en settes bare inn når verken søket eller en stamme treffer', () => {
    // «fingr» ender på konsonant + r, men stammen «fing» treffer begge artene.
    // Da er svaret det samme som før — «finger» prøves ikke først.
    const arter: SokbarArt[] = [{ norwegian_name: 'Fingsopp' }, { norwegian_name: 'Finger' }];
    expect(navn(sokIArter(arter, 'fingr', 'nb'))).toEqual(['Finger', 'Fingsopp']);
    // Først når ingen stamme treffer, settes e-en inn.
    expect(navn(sokIArter(arter, 'fingrene', 'nb'))).toEqual(['Finger']);
    // Finnes stammen i et navn, er det svaret: «fabler» er «fabl», ikke «fabel».
    const medStammen: SokbarArt[] = [{ norwegian_name: 'Fabel' }, { norwegian_name: 'Fabl sopp' }];
    expect(navn(sokIArter(medStammen, 'fabl', 'nb'))).toEqual(['Fabl sopp']);
    expect(navn(sokIArter(medStammen, 'fabler', 'nb'))).toEqual(['Fabl sopp']);
    // I katalogen: «gallr» er fortsatt «gall».
    expect(sok('gallr')).toEqual(['Gallemusserong', 'Gallerørsopp']);
    expect(sok('gallr')).toEqual(sok('gall'));
  });

  it('e-en settes bare inn etter en konsonant, og bare foran l, r eller n', () => {
    const arter: SokbarArt[] = [
      { norwegian_name: 'Tempel' },
      { norwegian_name: 'Finger' },
      { norwegian_name: 'Rød botten', swedish_name: 'Röd botten' },
      { norwegian_name: 'Broen' },
      { norwegian_name: 'Lyset' }
    ];
    expect(navn(sokIArter(arter, 'templer', 'nb'))).toEqual(['Tempel']);
    expect(navn(sokIArter(arter, 'templet', 'nb'))).toEqual(['Tempel']);
    expect(navn(sokIArter(arter, 'fingrene', 'nb'))).toEqual(['Finger']);
    expect(navn(sokIArter(arter, 'bottnar', 'sv'), 'sv')).toEqual(['Röd botten']);
    // Etter en vokal mangler det ingen e: «bron» er ikke «broen».
    expect(sokIArter(arter, 'bron', 'nb')).toEqual([]);
    // Og foran andre bokstaver settes ingen inn: «lyst» er ikke «lyset».
    expect(sokIArter(arter, 'lyst', 'nb')).toEqual([]);
  });

  it('formen med e må slutte et ord i det norske eller svenske navnet', () => {
    // «navel» står i skjøten i «Flammulina velutipes». Uten kravet traff
    // «navle» vintersopp.
    expect(sok('navel')).toEqual(['Vintersopp']);
    expect(sok('navl')).toEqual([]);
    expect(sok('navle')).toEqual([]);
    // «roder» står inne i «Scleroderma». «rødr» er starten på en art katalogen
    // ikke har (rødrandkjuke), og skal ikke vise potetrøyksopp underveis.
    expect(sok('roder')).toEqual(['Potetrøyksopp']);
    expect(sok('rødr')).toEqual([]);
    expect(sok('rødra')).toEqual([]);
    // Midt i et ord teller ikke: «fager» slutter ikke noe ord i «Vårfagerhatt».
    expect(sok('fager')).toEqual(['Vårfagerhatt']);
    expect(sok('fagr')).toEqual([]);
    // Engelske navn bøyes ikke slik: «angel» slutter et ord i «Destroying angel».
    expect(sok('angel')).toContain('Hvit fluesopp');
    expect(sok('angl')).toEqual([]);
  });

  it('en kandidat under fire tegn får ikke e-en — samme grense som for stammene', () => {
    const arter: SokbarArt[] = [{ norwegian_name: 'Odel' }, { norwegian_name: 'Aksel' }];
    expect(navn(sokIArter(arter, 'aksl', 'nb'))).toEqual(['Aksel']);
    expect(navn(sokIArter(arter, 'aksler', 'nb'))).toEqual(['Aksel']);
    expect(sokIArter(arter, 'odl', 'nb')).toEqual([]);
    expect(sokIArter(arter, 'odler', 'nb')).toEqual([]);
  });

  it('rører aldri et søk som allerede treffer noe', () => {
    // «Abcde» ender på en endelse, og stammen «abcd» ville også truffet den
    // andre arten. Søket treffer som det står, så stammen prøves ikke.
    const arter: SokbarArt[] = [{ norwegian_name: 'Abcde' }, { norwegian_name: 'Abcd sopp' }];
    expect(navn(sokIArter(arter, 'abcde', 'nb'))).toEqual(['Abcde']);
    // Uten treff som det står prøves stammen — og da treffer «abcd» begge.
    expect(navn(sokIArter(arter, 'abcden', 'nb'))).toEqual(['Abcde']);
    expect(navn(sokIArter(arter, 'abcdar', 'nb'))).toEqual(['Abcd sopp', 'Abcde']);
  });

  it('klipper minst mulig: «-r» før «-er», «-ne» før «-ene»', () => {
    const arter: SokbarArt[] = [{ norwegian_name: 'Kremle' }, { norwegian_name: 'Kreml' }];
    // «kremler» → «kremle» treffer bare den første; «kreml» prøves aldri.
    expect(navn(sokIArter(arter, 'kremler', 'nb'))).toEqual(['Kremle']);
    expect(navn(sokIArter(arter, 'kremlene', 'nb'))).toEqual(['Kremle']);
    // «kremlar» har ingen kortere stamme som treffer: «kremla» finnes ikke.
    expect(navn(sokIArter(arter, 'kremlar', 'nb'))).toEqual(['Kreml', 'Kremle']);
  });

  it('en stamme under fire tegn prøves ikke — «karen» er ikke «kar»', () => {
    expect(MIN_STAMMELENGDE).toBe(4);
    expect(sok('kar').length).toBeGreaterThan(0);
    expect(sok('karen')).toEqual([]);
    const arter: SokbarArt[] = [{ norwegian_name: 'Rød sopp' }, { norwegian_name: 'Rødsopp' }];
    expect(navn(sokIArter(arter, 'rød', 'nb'))).toHaveLength(2);
    expect(sokIArter(arter, 'røde', 'nb')).toEqual([]);
    expect(sokIArter(arter, 'rødsoppene', 'nb')).toHaveLength(2);
  });

  it('et ord som ikke er et artsnavn med endelse, gir fortsatt ingenting', () => {
    expect(sok('kantarellxyz')).toEqual([]);
    expect(sok('fluesoppinger')).toEqual([]);
    expect(sok('blåbær')).toEqual([]);
    expect(sok('tester')).toEqual([]);
  });

  it('rangerArt tar søket som det står — stammeforsøket gjelder hele lista', () => {
    expect(rangerArt(art('Kantarell'), 'kantareller', 'nb')).toBeNull();
    expect(rangerArt(art('Vanlig morkel'), 'morkler', 'nb')).toBeNull();
  });

  // 80 arter × 18 endelser = 1 440 søk mot hele katalogen per språk. Som én
  // test per språk tok det 0,6 s på en rolig maskin, men 7–10 s når andre
  // testsuiter kjørte samtidig: over vitests frist på 5 s, og hele kjøringen
  // ble rød uten at noe var galt. Én test per språk og endelse gjør de samme
  // søkene, og hver av dem ligger langt under fristen.
  describe.each(['nb', 'sv'])('hver art står først på navnet sitt med en hvilken som helst endelse bak (%s)', (locale) => {
    it.each(BOYNINGSENDELSER)('«-%s»', (endelse) => {
      for (const rad of ARTSKATALOG) {
        const visningsnavn = getSpeciesDisplayName(rad, locale);
        expect(sokIArter(ARTSKATALOG, visningsnavn + endelse, locale)[0], `${visningsnavn} + ${endelse}`).toBe(rad);
      }
    });
  });
});

describe('normaliserSok', () => {
  it('bretter nordiske tegn likt på tvers av norsk og svensk', () => {
    expect(normaliserSok('Rødskrubb')).toBe('rodskrubb');
    expect(normaliserSok('Smörsopp')).toBe('smorsopp');
    expect(normaliserSok('Fåresopp')).toBe('faresopp');
    expect(normaliserSok('Ängschampinjon')).toBe('angschampinjon');
    expect(normaliserSok('Lærke')).toBe(normaliserSok('Lärke'));
  });

  it('fjerner mellomrom, bindestreker og tegnsetting', () => {
    expect(normaliserSok('  Karl  Johan ')).toBe('karljohan');
    expect(normaliserSok('Karbol-sjampinjong')).toBe('karbolsjampinjong');
    expect(normaliserSok("St. George's mushroom")).toBe('stgeorgesmushroom');
    expect(normaliserSok('),(')).toBe('');
  });

  it('tåler tekst som allerede er dekomponert (a + ring, o + tøddel)', () => {
    expect(normaliserSok('fåresopp')).toBe('faresopp');
    expect(normaliserSok('smörsopp')).toBe('smorsopp');
  });
});

describe('synonymer', () => {
  it('treffer på et helt ord eller starten av et ord', () => {
    const karbol = art('Karbol-sjampinjong');
    expect(rangerArt(karbol, 'psalliota', 'nb')).toBe(SYNONYMRANG);
    expect(rangerArt(karbol, 'Psalliota xantho', 'nb')).toBe(SYNONYMRANG);
  });

  it('treffer ikke i skjøten mellom to navn', () => {
    // «…xanthoderma Psalliota…»: «ap» finnes bare der to synonymer møtes.
    expect(rangerArt(art('Karbol-sjampinjong'), 'ap', 'nb')).toBeNull();
  });

  it('et treff i et ekte navn slår alltid et synonymtreff', () => {
    // «Agaricus» står både i det gjeldende navnet og i synonymet.
    expect(rangerArt(art('Skogsjampinjong'), 'agaricus', 'nb')).toBeLessThan(SYNONYMRANG);
  });
});

describe('hele katalogen', () => {
  const tastaturUtenNordiskeTegn = (tekst: string) =>
    tekst.replace(/[øö]/gi, 'o').replace(/[åä]/gi, 'a').replace(/æ/gi, 'a');

  it.each(['nb', 'sv'])('hver art står først når man søker på navnet sitt (%s)', (locale) => {
    for (const rad of ARTSKATALOG) {
      const visningsnavn = getSpeciesDisplayName(rad, locale);
      expect(sokIArter(ARTSKATALOG, visningsnavn, locale)[0], visningsnavn).toBe(rad);
      expect(
        sokIArter(ARTSKATALOG, tastaturUtenNordiskeTegn(visningsnavn), locale)[0],
        `${visningsnavn} uten nordiske tegn`
      ).toBe(rad);
    }
  });

  it('hver art finnes på norsk, svensk, latinsk og engelsk navn, uansett språk', () => {
    for (const locale of ['nb', 'sv']) {
      for (const rad of ARTSKATALOG) {
        for (const etNavn of [rad.norwegian_name, rad.swedish_name, rad.latin_name, rad.english_name]) {
          if (!etNavn) continue;
          expect(sokIArter(ARTSKATALOG, etNavn, locale), `${etNavn} (${locale})`).toContain(rad);
        }
      }
    }
  });
});
