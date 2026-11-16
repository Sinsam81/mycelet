import { describe, expect, it } from 'vitest';
import {
  FORVEKSLING_RADGRENSE,
  slaaSammenForvekslinger,
  type ForvekslingsArt,
  type ForvekslingsRad
} from '../forvekslinger';
import { finnFrikjennendeFormuleringer, harHandlingsråd } from '../forvekslingstekst';

/**
 * Artene og radene under er lest fra produksjon 10. november 2026 (bare
 * lesing). Tekstene er ordrett de som står i `look_alikes` — hele poenget med
 * denne modulen er at de samme tekstene nå vises fra BEGGE sider av et par, så
 * testene bruker de ekte tekstene og ikke oppdiktede.
 */
const FALSK_KANTARELL: ForvekslingsArt = {
  id: 22,
  norwegian_name: 'Falsk kantarell',
  swedish_name: 'Narrkantarell',
  latin_name: 'Hygrophoropsis aurantiaca',
  edibility: 'inedible'
};
const BLEK_KANTARELL: ForvekslingsArt = {
  id: 86,
  norwegian_name: 'Blek kantarell',
  swedish_name: 'Blek kantarell',
  latin_name: 'Cantharellus pallens',
  edibility: 'edible'
};
const BROKET_KREMLE: ForvekslingsArt = {
  id: 38,
  norwegian_name: 'Broket kremle',
  swedish_name: 'Brokkremla',
  latin_name: 'Russula cyanoxantha',
  edibility: 'edible'
};
const GRONNKREMLE: ForvekslingsArt = {
  id: 68,
  norwegian_name: 'Grønnkremle',
  swedish_name: 'Grönkremla',
  latin_name: 'Russula aeruginea',
  edibility: 'edible'
};
const SNOBALLSJAMPINJONG: ForvekslingsArt = {
  id: 78,
  norwegian_name: 'Snøballsjampinjong',
  swedish_name: 'Snöbollschampinjon',
  latin_name: 'Agaricus arvensis',
  edibility: 'edible'
};
const SPISS_GIFTSLORSOPP: ForvekslingsArt = {
  id: 17,
  norwegian_name: 'Spiss giftslørsopp',
  swedish_name: 'Toppig giftspindling',
  latin_name: 'Cortinarius rubellus',
  edibility: 'deadly'
};
const SVART_TROMPETSOPP: ForvekslingsArt = {
  id: 4,
  norwegian_name: 'Svart trompetsopp',
  swedish_name: 'Svart trumpetsvamp',
  latin_name: 'Craterellus cornucopioides',
  edibility: 'edible'
};
const RODGUL_PIGGSOPP: ForvekslingsArt = {
  id: 36,
  norwegian_name: 'Rødgul piggsopp',
  swedish_name: 'Rödgul taggsvamp',
  latin_name: 'Hydnum rufescens',
  edibility: 'edible'
};

/** Kantarell → Falsk kantarell (high). Raden på kantarellens egen side. */
const KANTARELL_FRA: ForvekslingsRad = {
  danger_level: 'high',
  similarity_description: 'Begge er oransje-gule traktformede sopper. Klassisk forveksling for nybegynnere.',
  difference_description:
    'Ekte kantarell har FALSKE skiver (årer som går ned på stilken) og fastere kjøtt. Falsk kantarell har EKTE smale skiver og mykere kjøtt. Lukten er mild-fruktig på ekte kantarell, mer "soppete" på falsk. Ved tvil — la den stå.',
  mushroom_species: FALSK_KANTARELL
};
/** Falsk kantarell → Kantarell (high). Speilraden, sett fra kantarellens side. */
const FALSK_KANTARELL_TIL: ForvekslingsRad = {
  danger_level: 'high',
  similarity_description: 'Begge oransje traktsopper i barskog.',
  difference_description:
    'Falsk kantarell har ekte smale skiver, ekte kantarell har falske årer som går ned på stilken. Ved tvil — la den stå.',
  mushroom_species: FALSK_KANTARELL
};
/** Blek kantarell → Kantarell (low). Finnes bare i denne retningen. */
const BLEK_KANTARELL_TIL: ForvekslingsRad = {
  danger_level: 'low',
  similarity_description:
    'Blek kantarell ligner vanlig kantarell så mye at den lenge ble regnet som bare en blek form av den. Begge har gaffeldelte ribber som løper ned på stilken og samme fruktige aprikoslukt, og de kan stå i samme skog i samme uke.',
  difference_description:
    'Blek kantarell er kraftigere og buttere, og hatten er BLEKGUL TIL NESTEN HVIT — den står i tydelig kontrast til de eggegule ribbene under. Det hvitlige er et fint, melaktig BELEGG som kan gnis vekk med fingeren, slik at det gule kommer fram under. Hattkanten holder seg innrullet også på eldre sopp. Vanlig kantarell er jevnt eggegul over hele soppen. Begge er førsteklasses matsopper, så denne forvekslingen koster deg ingenting annet enn navnet i notatboka.',
  mushroom_species: BLEK_KANTARELL
};

/** De tre radene som peker PÅ grønn fluesopp (id 52). Arten har ingen egne rader. */
const GRONN_FLUESOPP_TIL: ForvekslingsRad[] = [
  {
    danger_level: 'critical',
    similarity_description:
      'Broket kremle har ofte grønne og olivenfargede former, og den vokser under eik og bøk i Sør-Norge og Sør-Sverige – nøyaktig der grønn fluesopp står, fra august til oktober. Begge har hvite skiver og hvit stilk, og unge eksemplarer av begge er runde og uanselige. Svampguiden advarer uerfarne plukkere mot akkurat denne forvekslingen, og SNL nevner det samme for grønnkremle.',
    difference_description:
      'Grav opp HELE stilken. Grønn fluesopp har RING på stilken og et SLIREBEGER (pose) nederst, ofte skjult i jorda – kremler har verken ring eller pose. Kremlestilken knekker tvert som kritt; fluesoppstilken er seig og lar seg rive opp i tråder. IKKE stol på farge: grønn fluesopp kan være blekgul, gulgrønn, grågrønn eller BRUNGRØNN, med innvokste mørkere fibrer og glatt, urillet hattkant. Broket kremle kjennes i tillegg på MYKE, BØYELIGE skiver som føles fettede og ikke smuldrer når du drar fingeren over dem. Ved tvil — la stå.',
    mushroom_species: BROKET_KREMLE
  },
  {
    danger_level: 'critical',
    similarity_description:
      'Begge kan ha en grågrønn til olivengrønn hatt og vokse under bjørk i samme skogtype på samme tid av året. På avstand, og særlig for unge sopper, er fargen alene ikke nok til å skille dem.',
    difference_description:
      'Se på stilken og skivene. Grønn fluesopp har ring på stilken og en tydelig volva (pose) nederst, ofte delvis nedgravd — grav derfor alltid opp hele stilken. Kremler har verken ring eller volva, og skivene er sprø og smuldrer når du drar fingeren over dem. Kremlestilken knekker som kritt; fluesoppstilken er seig og trevlete. Ved tvil — la den stå.',
    mushroom_species: GRONNKREMLE
  },
  {
    danger_level: 'critical',
    similarity_description: 'Unge, hvite eksemplarer kan ligne dødelig grønn/hvit fluesopp.',
    difference_description:
      'Sjampinjong har rosa→sjokoladebrune skiver og INGEN pose ved basen. Fluesopp har alltid hvite skiver og en volva (pose) nederst på stilken. Grav alltid opp hele stilken. Ved tvil — la den stå.',
    mushroom_species: SNOBALLSJAMPINJONG
  }
];

/**
 * De to radene som peker PÅ piggsopp (id 7), lest 16. november 2026. Piggsopp
 * er en matsopp uten egne rader — og begge artene som peker hit er matsopper.
 */
const PIGGSOPP_TIL: ForvekslingsRad[] = [
  {
    danger_level: 'low',
    similarity_description:
      'Nære slektninger i den samme mosekledde gran- og bjørkeskogen, fra sensommer til november. Begge har lyse, sprø pigger under hatten i stedet for skiver, og de står ofte i samme rekke.',
    difference_description:
      'Se hvor piggene slutter. Rødgul piggsopp er mindre, gyllen til rødoransje, og har pigger BARE UNDER HATTEN. Piggsopp (blek piggsopp) er større, kremhvit, og piggene LØPER NEDOVER STILKEN. Begge er blant våre sikreste matsopper — sopp med LYSE, sprø pigger under hatten har ingen giftige dobbeltgjengere her. Forbeholdet gjelder de lyse: sopp med mørkbrune eller svarte pigger er andre slekter, og flere av dem er uspiselige.',
    mushroom_species: RODGUL_PIGGSOPP
  },
  {
    danger_level: 'low',
    similarity_description:
      'Blek piggsopp er like blek, like kjøttfull og like uregelmessig trakt-/vifteformet, og står i samme skog i samme periode. Ovenfra, halvveis dekket av strø, ser de nesten like ut — begge er blant de første artene nybegynnere lærer, nettopp fordi de er trygge.',
    difference_description:
      'Snu soppen — det er hele svaret. Blek kantarell har RIBBER: butte, gaffeldelte årer som løper nedover stilken. Piggsopp har PIGGER: myke, lyse tagger tett i tett, som en børste. Begge er gode matsopper, så du kan ta med begge — bare vit hva du har, for de skal ha ulik steketid.',
    mushroom_species: BLEK_KANTARELL
  }
];

function rad(art: ForvekslingsArt, faregrad: string | null = 'low'): ForvekslingsRad {
  return {
    danger_level: faregrad,
    similarity_description: `Ligner ${art.norwegian_name}.`,
    difference_description: `Skilles fra ${art.norwegian_name}.`,
    mushroom_species: art
  };
}

describe('arten som bare finnes som en annens forveksling', () => {
  // Selve feilen: siden til grønn fluesopp spurte på species_id = 52, fant
  // ingenting og skrev «ikke ført inn ennå».
  const resultat = slaaSammenForvekslinger({ fram: [], bak: GRONN_FLUESOPP_TIL });

  it('får kortene til artene som forveksles med den', () => {
    expect(resultat.kort.map((k) => k.art.norwegian_name)).toEqual([
      'Broket kremle',
      'Grønnkremle',
      'Snøballsjampinjong'
    ]);
    expect(resultat.ingenRegistrert).toBe(false);
    expect(resultat.ufullstendig).toBe(false);
  });

  it('viser dem uten faregrad — radens «kritisk» gjelder fluesoppen, ikke kremla på kortet', () => {
    for (const kort of resultat.kort) {
      expect(kort.retning).toBe('til');
      expect(kort.faregrad).toBeNull();
    }
  });

  it('beholder begge tekstene ordrett', () => {
    expect(resultat.kort[0].likhet).toBe(GRONN_FLUESOPP_TIL[0].similarity_description);
    expect(resultat.kort[0].skille).toBe(GRONN_FLUESOPP_TIL[0].difference_description);
  });

  it('viser ingen tekst som frikjenner et funn, og hver kritiske rad ender i et råd', () => {
    // Tekstene er skrevet fra matsoppens side. Lest fra giftsoppens side skal
    // de fortsatt bare kunne dømme et funn ute — se forvekslingstekst.ts.
    for (const kort of resultat.kort) {
      for (const vist of [kort.likhet, kort.skille]) {
        expect(finnFrikjennendeFormuleringer(vist ?? ''), vist ?? '').toEqual([]);
      }
      expect(harHandlingsråd(kort.skille ?? ''), kort.art.norwegian_name ?? '').toBe(true);
    }
  });
});

describe('arten som ikke har ført egne forvekslinger', () => {
  // Hullet i den første rettingen: «ikke ført inn ennå» forsvant så snart ÉN
  // rad pekte hit. Piggsopp fikk to kort med to matsopper, og ingenting sa at
  // piggsoppens EGNE forvekslinger aldri er ført inn.
  const resultat = slaaSammenForvekslinger({ fram: [], bak: PIGGSOPP_TIL });

  it('viser kortene fra den andre siden, og sier at artens egne rader er tomme', () => {
    expect(resultat.kort.map((k) => [k.art.id, k.retning, k.faregrad])).toEqual([
      [36, 'til', null],
      [86, 'til', null]
    ]);
    expect(resultat.ufullstendig).toBe(false);
    expect(resultat.ingenRegistrert).toBe(false);
    expect(resultat.egneRaderTomme).toBe(true);
  });

  it('sier det samme om giftsoppen — det er siden som vet hvem som trenger forbeholdet', () => {
    // Grønn fluesopp har heller ingen egne rader. Flagget beskriver radene,
    // ikke arten: der står den røde boksen, og forbeholdet ville vært absurd.
    expect(slaaSammenForvekslinger({ fram: [], bak: GRONN_FLUESOPP_TIL }).egneRaderTomme).toBe(true);
  });

  it('gjelder ikke arten som har egne rader', () => {
    const kantarell = slaaSammenForvekslinger({
      fram: [KANTARELL_FRA],
      bak: [FALSK_KANTARELL_TIL, BLEK_KANTARELL_TIL]
    });
    expect(kantarell.egneRaderTomme).toBe(false);
  });

  it('påstås aldri når spørringen på artens egen side feilet', () => {
    // Da vet vi ikke om radene finnes. «Klarte ikke å hente» er beskjeden, ikke
    // «ikke ført inn» — samme regel som for ingenRegistrert.
    const feilet = slaaSammenForvekslinger({ fram: null, bak: PIGGSOPP_TIL, framFeilet: true });
    expect(feilet.kort).toHaveLength(2);
    expect(feilet.ufullstendig).toBe(true);
    expect(feilet.egneRaderTomme).toBe(false);
  });

  it('påstås ikke når artens egne rader finnes, men ikke lot seg vise', () => {
    const utenArt = slaaSammenForvekslinger({
      fram: [{ danger_level: 'critical', mushroom_species: null }],
      bak: PIGGSOPP_TIL
    });
    expect(utenArt.kort.every((k) => k.retning === 'til')).toBe(true);
    expect(utenArt.ufullstendig).toBe(true);
    expect(utenArt.egneRaderTomme).toBe(false);
  });

  it('står fast når det er den ANDRE siden som ikke er hel', () => {
    // Artens egne rader er lest helt og er tomme. Det er sant uansett hva som
    // skjedde med radene som peker hit.
    expect(slaaSammenForvekslinger({ fram: [], bak: null, bakFeilet: true }).egneRaderTomme).toBe(true);
    const medHull = slaaSammenForvekslinger({
      fram: [],
      bak: [...PIGGSOPP_TIL, { danger_level: 'low', mushroom_species: null }]
    });
    expect(medHull.kort).toHaveLength(2);
    expect(medHull.ufullstendig).toBe(true);
    expect(medHull.egneRaderTomme).toBe(true);
  });
});

describe('par som er ført i begge retninger', () => {
  it('gir ett kort, og raden skrevet for denne siden vinner', () => {
    // Kantarell har både sin egen rad mot falsk kantarell og speilraden.
    const { kort } = slaaSammenForvekslinger({ fram: [KANTARELL_FRA], bak: [FALSK_KANTARELL_TIL] });
    expect(kort).toHaveLength(1);
    expect(kort[0].retning).toBe('fra');
    expect(kort[0].faregrad).toBe('high');
    expect(kort[0].skille).toBe(KANTARELL_FRA.difference_description);
  });

  it('legger til arten som bare er ført fra den andre siden', () => {
    // Slik ser kantarellens side ut i dag: én egen rad, to rader som peker hit.
    const { kort } = slaaSammenForvekslinger({
      fram: [KANTARELL_FRA],
      bak: [FALSK_KANTARELL_TIL, BLEK_KANTARELL_TIL]
    });
    expect(kort.map((k) => [k.art.id, k.retning, k.faregrad])).toEqual([
      [22, 'fra', 'high'],
      [86, 'til', null]
    ]);
  });

  it('gjentar ikke en art som står to ganger i samme retning', () => {
    const { kort } = slaaSammenForvekslinger({ fram: [], bak: [BLEK_KANTARELL_TIL, BLEK_KANTARELL_TIL] });
    expect(kort).toHaveLength(1);
  });
});

describe('rekkefølgen', () => {
  it('setter den farligste forvekslingen først', () => {
    const { kort } = slaaSammenForvekslinger({
      fram: [rad(SVART_TROMPETSOPP, 'low'), rad(FALSK_KANTARELL, 'medium'), rad(SPISS_GIFTSLORSOPP, 'critical')],
      bak: []
    });
    expect(kort.map((k) => k.faregrad)).toEqual(['critical', 'medium', 'low']);
  });

  it('legger artene som bare peker hit etter sidens egne rader', () => {
    const { kort } = slaaSammenForvekslinger({
      fram: [rad(SVART_TROMPETSOPP, 'low')],
      bak: [rad(BLEK_KANTARELL, 'critical')]
    });
    expect(kort.map((k) => k.art.id)).toEqual([4, 86]);
  });

  it('begraver aldri en dødelig art under harmløse nærarter, selv uten faregrad', () => {
    // Finnes ikke i dataene i dag (alle rader ført fra en giftsopp har en
    // speilrad), men neste migrasjon skal ikke kunne gjemme en giftsopp nederst.
    const { kort } = slaaSammenForvekslinger({
      fram: [rad(SVART_TROMPETSOPP, 'low'), rad(FALSK_KANTARELL, 'medium')],
      bak: [rad(SPISS_GIFTSLORSOPP, 'low')]
    });
    expect(kort[0].art.id).toBe(17);
    expect(kort[0].retning).toBe('til');
  });

  it('behandler ukjent spiselighet som farlig i rekkefølgen', () => {
    const ukjent: ForvekslingsArt = { id: 999, norwegian_name: 'Ukjent art', edibility: null };
    const { kort } = slaaSammenForvekslinger({ fram: [rad(SVART_TROMPETSOPP, 'low')], bak: [rad(ukjent)] });
    expect(kort[0].art.id).toBe(999);
  });

  it('er stabil når radene kommer i en annen rekkefølge fra basen', () => {
    const a = slaaSammenForvekslinger({ fram: [], bak: GRONN_FLUESOPP_TIL });
    const b = slaaSammenForvekslinger({ fram: [], bak: [...GRONN_FLUESOPP_TIL].reverse() });
    expect(b.kort.map((k) => k.art.id)).toEqual(a.kort.map((k) => k.art.id));
  });

  it('viser en rad uten faregrad som laveste, ikke som en feil', () => {
    const { kort } = slaaSammenForvekslinger({ fram: [rad(SVART_TROMPETSOPP, null)], bak: [] });
    expect(kort[0].faregrad).toBe('low');
  });
});

describe('en feil er aldri en tom liste', () => {
  it('sier «ikke ført inn» bare når begge retninger er lest og tomme', () => {
    const tomt = slaaSammenForvekslinger({ fram: [], bak: [] });
    expect(tomt).toEqual({ kort: [], ufullstendig: false, ingenRegistrert: true, egneRaderTomme: true });
  });

  it('sier aldri «ikke ført inn» når spørringen på artens egen side feilet', () => {
    const resultat = slaaSammenForvekslinger({ fram: null, bak: [], framFeilet: true });
    expect(resultat.ufullstendig).toBe(true);
    expect(resultat.ingenRegistrert).toBe(false);
  });

  it('sier aldri «ikke ført inn» når spørringen på motsatt side feilet', () => {
    // Uten dette ville grønn fluesopp falt tilbake til den gamle feilen hver
    // gang den nye spørringen feilet: ingen rader på egen side, og stille.
    const resultat = slaaSammenForvekslinger({ fram: [], bak: null, bakFeilet: true });
    expect(resultat.ufullstendig).toBe(true);
    expect(resultat.ingenRegistrert).toBe(false);
  });

  it('viser kortene fra retningen som virket, men merker lista som ufullstendig', () => {
    const resultat = slaaSammenForvekslinger({ fram: [KANTARELL_FRA], bak: null, bakFeilet: true });
    expect(resultat.kort).toHaveLength(1);
    expect(resultat.ufullstendig).toBe(true);
  });

  it('merker lista som ufullstendig når en spørring traff radgrensen', () => {
    const mange = Array.from({ length: FORVEKSLING_RADGRENSE }, (_, i) =>
      rad({ id: 1000 + i, norwegian_name: `Art ${i}`, edibility: 'edible' })
    );
    expect(slaaSammenForvekslinger({ fram: mange, bak: [] }).ufullstendig).toBe(true);
    expect(slaaSammenForvekslinger({ fram: [], bak: mange }).ufullstendig).toBe(true);
    expect(slaaSammenForvekslinger({ fram: mange.slice(1), bak: [] }).ufullstendig).toBe(false);
  });

  it('merker lista som ufullstendig når en rad mangler arten sin', () => {
    const resultat = slaaSammenForvekslinger({
      fram: [{ danger_level: 'critical', mushroom_species: null }],
      bak: []
    });
    expect(resultat.kort).toEqual([]);
    expect(resultat.ufullstendig).toBe(true);
    expect(resultat.ingenRegistrert).toBe(false);
  });
});

describe('radformen fra PostgREST', () => {
  it('tåler at relasjonen kommer som array med ett element', () => {
    const { kort } = slaaSammenForvekslinger({
      fram: [{ ...KANTARELL_FRA, mushroom_species: [FALSK_KANTARELL] }],
      bak: []
    });
    expect(kort[0].art.id).toBe(22);
  });

  it('gjør tomme tekster om til null, så siden ikke rendrer en tom etikett', () => {
    const { kort } = slaaSammenForvekslinger({
      fram: [{ danger_level: 'low', similarity_description: '   ', difference_description: '', mushroom_species: BLEK_KANTARELL }],
      bak: []
    });
    expect(kort[0].likhet).toBeNull();
    expect(kort[0].skille).toBeNull();
  });
});
