/**
 * Hvor et funn lagres: der brukeren står nå, eller der kartet står.
 *
 * HVORFOR
 * Skjemaet hadde to kilder og én regel: «GPS vinner hvis den finnes». GPS-en
 * var målingen fra da kartet ble åpnet, og kartsenteret kom bare til når det
 * ikke fantes noen måling i det hele tatt. To vanlige turer endte derfor med
 * funnet på feil sted, uten at noe på skjermen sa det:
 *
 *  - Åpnet kartet på parkeringsplassen, gikk førti minutter, trykket pluss ved
 *    soppen: lagret på parkeringsplassen.
 *  - Hjemme i sofaen med posisjon på, flyttet kartet til lysningen fra i går,
 *    trykket pluss: lagret hjemme. Kommentaren i kartet lovet nettopp denne
 *    bruken («registrere et funn i etterkant hjemmefra»), men veien dit var
 *    stengt for alle som hadde GPS — og et funn lagret hjemme peker på et hjem.
 *
 * Et funn på feil sted er gale data: i brukerens egne steder, og i det
 * modellen kalibreres mot.
 *
 * REGELEN
 * GPS-en skjemaet får, er alltid målt etter at det ble åpnet (fersk-posisjon.ts).
 * Kartsenteret følger alltid med. Så:
 *
 *  - Brukeren har valgt: det valget gjelder.
 *  - Kartet står der APPEN la det (plassholderen, GPS-sentreringen, «Finn
 *    meg», utsnittet «⭐ Lovende» zoomer til) og sier dermed ingenting om
 *    hvor funnet er: GPS-en brukes.
 *  - Brukeren har lagt kartet et sted, og GPS-en er enig (innen 150 m, og selv
 *    nøyaktig nok til å kunne være enig): GPS-en brukes, den er finest.
 *  - De to peker på ulike steder: appen velger IKKE. Brukeren må trykke.
 *  - Ingen fersk GPS: kartsenteret — av seg selv bare når brukeren har lagt
 *    kartet der. Et kart ingen har flyttet er ikke et funnsted, så da må
 *    brukeren si at det stemmer.
 *
 * Det appen aldri gjør, er å velge i stillhet mellom to steder som ikke er det
 * samme. Ren funksjon, så reglene kan leses i testen.
 */

import { haversineKm } from '@/lib/utils/geo-distance';

export type Posisjonskilde = 'gps' | 'kart';

export interface Punkt {
  lat: number;
  lng: number;
}

/** En fersk måling fra denne åpningen av skjemaet. */
export interface GpsMaaling extends Punkt {
  /** Oppgitt horisontal nøyaktighet i meter. */
  accuracy: number;
}

/**
 * Innenfor dette regnes GPS og kartsenter som samme sted. Det samme tallet er
 * grensen for hvor usikker GPS-en kan være og fortsatt få avgjøre: en måling
 * på ±400 m kan ikke sies å være enig med et punkt brukeren har siktet inn.
 */
export const SAMME_STED_M = 150;

export interface FunnposisjonInn {
  /** Beste ferske måling så langt; null til den kommer, og når den aldri kom. */
  gps: GpsMaaling | null;
  /** Letingen etter fersk posisjon pågår fortsatt. */
  soker: boolean;
  /** Kartsenteret da brukeren trykket pluss. Null hvis kartet ikke var klart. */
  kartsenter: Punkt | null;
  /** Har brukeren selv lagt kartet der det står? Se kartErFlyttet. */
  kartFlyttet: boolean;
  /** Brukerens uttrykkelige valg, om det er gjort. */
  valg: Posisjonskilde | null;
}

export type MaaVelgeGrunn =
  /** GPS og kartsenter peker på hvert sitt sted. */
  | 'ulike_steder'
  /** De ligger nær hverandre, men GPS-en er for usikker til å avgjøre. */
  | 'usikker_gps'
  /** Ingen fersk GPS, og kartet står der appen la det. */
  | 'kart_ikke_flyttet'
  /** Brukeren valgte GPS, men det kom ingen måling. */
  | 'gps_mangler';

export type Funnposisjon =
  | {
      status: 'klar';
      kilde: Posisjonskilde;
      lat: number;
      lng: number;
      /** true = appen valgte etter reglene over; false = brukeren trykket. */
      automatisk: boolean;
    }
  /** Venter på den ferske målingen. Lagring holdes igjen, ellers ble det gjetning. */
  | { status: 'venter' }
  /** Brukeren må trykke på én av de to. `avstandM` er avstanden mellom dem når begge finnes. */
  | { status: 'maa_velge'; grunn: MaaVelgeGrunn; avstandM: number | null }
  /** Verken måling eller kart. */
  | { status: 'ingen' };

export function avstandMeter(a: Punkt, b: Punkt): number {
  return haversineKm(a.lat, a.lng, b.lat, b.lng) * 1000;
}

export function velgFunnposisjon({ gps, soker, kartsenter, kartFlyttet, valg }: FunnposisjonInn): Funnposisjon {
  const avstandM = gps && kartsenter ? avstandMeter(gps, kartsenter) : null;

  if (valg === 'kart' && kartsenter) {
    return { status: 'klar', kilde: 'kart', lat: kartsenter.lat, lng: kartsenter.lng, automatisk: false };
  }
  if (valg === 'gps') {
    if (gps) return { status: 'klar', kilde: 'gps', lat: gps.lat, lng: gps.lng, automatisk: false };
    if (soker) return { status: 'venter' };
    // Brukeren ba om GPS og fikk ingen. Da bytter vi ikke til kartet bak ryggen.
    return kartsenter ? { status: 'maa_velge', grunn: 'gps_mangler', avstandM: null } : { status: 'ingen' };
  }

  if (gps) {
    const gpsKlar: Funnposisjon = { status: 'klar', kilde: 'gps', lat: gps.lat, lng: gps.lng, automatisk: true };
    if (!kartsenter || avstandM === null || !kartFlyttet) return gpsKlar;
    if (avstandM > SAMME_STED_M) return { status: 'maa_velge', grunn: 'ulike_steder', avstandM };
    if (gps.accuracy > SAMME_STED_M) return { status: 'maa_velge', grunn: 'usikker_gps', avstandM };
    return gpsKlar;
  }

  if (soker) return { status: 'venter' };
  if (!kartsenter) return { status: 'ingen' };
  if (!kartFlyttet) return { status: 'maa_velge', grunn: 'kart_ikke_flyttet', avstandM: null };
  return { status: 'klar', kilde: 'kart', lat: kartsenter.lat, lng: kartsenter.lng, automatisk: true };
}

/** Meter per skjermpiksel i Web Mercator (256 px-fliser), på en gitt breddegrad og zoom. */
export function meterPerPiksel(lat: number, zoom: number): number {
  return (156_543.033_92 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/**
 * Hvor langt kartsenteret kan ligge fra der appen la det og fortsatt regnes
 * som urørt. Leaflet runder til hele piksler når det flytter kartet, og på
 * zoom 11 er en piksel nesten førti meter — derfor piksler, med et gulv i
 * meter for de dype zoomnivåene.
 */
export function flyttetoleranseMeter(lat: number, zoom: number): number {
  return Math.max(15, 6 * meterPerPiksel(lat, zoom));
}

/**
 * Har BRUKEREN lagt kartet der det står?
 *
 * `autoSenter` er det siste senteret appen selv valgte uten at noen ba om et
 * sted: plassholderen før posisjonen er kjent, sentreringen på GPS ved åpning,
 * «Finn meg», og utsnittet «⭐ Lovende» zoomer til (senterForBoks). Står kartet
 * fortsatt der, er senteret ikke et sted brukeren har pekt ut. Null betyr at
 * kartet åpnet på et sted noen valgte (dyplenke, søkt sted, utsnittet fra
 * forrige besøk).
 *
 * Sammenligner posisjoner, ikke hendelser: da spiller det ingen rolle om
 * kartet ble flyttet med en finger, to fingre, musehjulet eller et søk.
 */
export function kartErFlyttet(senter: Punkt, autoSenter: Punkt | null, toleranseM: number): boolean {
  if (!autoSenter) return true;
  return avstandMeter(senter, autoSenter) > toleranseM;
}

/**
 * Senteret kartet får når APPEN zoomer det til en boks — «⭐ Lovende» rundt de
 * lovende områdene. Det er det nye `autoSenter` etter en slik flytting: midten
 * av en boks appen regnet ut er ikke et sted noen har pekt på.
 *
 * Leaflets fitBounds legger boksen midt på SKJERMEN, og skjermen er Web
 * Mercator. Der strekkes breddegradene mot nord, så midten ligger nord for
 * gjennomsnittet av breddegradene: noen meter for en boks på ti kilometer,
 * flere hundre når søket har gått ut til 35 km. Lengdegraden er det vanlige
 * gjennomsnittet.
 *
 * Målet regnes ut; det leses ikke av kartet etterpå. Flyttingen er animert, og
 * Leaflet melder «moveend» også når fitBounds stopper en panorering som alt
 * pågår — FØR den nye flyttingen starter. Den som lytter på neste «moveend»,
 * skriver da ned stedet kartet var på vei bort fra. Samme valg som de andre
 * stedene appen flytter kartet selv: de skriver ned målet de ba om.
 */
export function senterForBoks(sorvest: Punkt, nordost: Punkt): Punkt {
  const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const midtY = (mercatorY(sorvest.lat) + mercatorY(nordost.lat)) / 2;
  return {
    lat: ((2 * Math.atan(Math.exp(midtY)) - Math.PI / 2) * 180) / Math.PI,
    lng: (sorvest.lng + nordost.lng) / 2
  };
}

/** «350 m» / «2,1 km». Enhetene skrives likt på norsk og svensk, og begge bruker desimalkomma. */
export function formaterAvstand(meter: number): string {
  const tiere = Math.round(meter / 10) * 10;
  if (tiere < 1000) return `${Math.max(10, tiere)} m`;
  const km = meter / 1000;
  const avrundet = km >= 10 ? Math.round(km).toString() : (Math.round(km * 10) / 10).toString().replace('.', ',');
  return `${avrundet} km`;
}
