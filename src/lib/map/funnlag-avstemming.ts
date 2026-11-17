/**
 * Avstemming av funnlaget: hva må ut, hva kan stå, og hva må inn.
 *
 * Funnlaget ble tømt og bygget opp igjen ved HVER henting — også når hentingen
 * bare skyldtes at kartet hadde flyttet seg. Å tømme laget fjerner markørene,
 * og Leaflet lukker popupen til en markør som fjernes. Åpner du et funn som
 * ikke får plass i utsnittet, flytter Leaflet kartet for å vise popupen;
 * flyttingen starter en ny henting, og når svaret kommer, forsvinner popupen
 * du leser i. Bekreftelsen før sletting står i den popupen, og nå gjør også
 * skjemaet for å melde et funn det.
 *
 * Laget stemmes derfor av mot det nye svaret i stedet: markører for funn som
 * fortsatt er med, blir stående — med popupen og alt brukeren har skrevet i
 * den. Bare det som faktisk er borte, tas ut, og bare det som er nytt, legges
 * til. Markørene blinker heller ikke lenger ved hver flytting.
 *
 * Ren funksjon uten Leaflet, så regelen kan prøves for seg. Den som utfører
 * den på kartet, er Funnlag i src/components/map/funnlag.ts.
 */

/** Det laget husker om en markør det har tegnet. */
export interface TegnetFunn {
  lat: number;
  lng: number;
  edibility: string | null;
}

/** Det avstemmingen trenger av et funn fra databasen. */
export interface FunnTilLaget {
  id: string;
  display_lat: number | null;
  display_lng: number | null;
  edibility: string | null;
}

export interface Funnavstemming<T> {
  /** Id-er som skal ut av laget: funn som er borte, og funn som må tegnes på nytt. */
  ut: string[];
  /** Funn som alt står riktig. Markøren røres ikke; popupens innhold kan oppdateres. */
  staar: T[];
  /** Funn som trenger en ny markør. */
  inn: T[];
}

/** Et funn uten visningskoordinater kan ikke tegnes (private funn har ingen for andre lesere). */
function kanTegnes(funn: FunnTilLaget): funn is FunnTilLaget & { display_lat: number; display_lng: number } {
  return Boolean(funn.display_lat) && Boolean(funn.display_lng);
}

export function stemAvFunnlag<T extends FunnTilLaget>(
  tegnet: ReadonlyMap<string, TegnetFunn>,
  nye: readonly T[]
): Funnavstemming<T> {
  const staar: T[] = [];
  const inn: T[] = [];
  const sett = new Set<string>();

  for (const funn of nye) {
    if (!kanTegnes(funn) || sett.has(funn.id)) continue;
    sett.add(funn.id);
    const forrige = tegnet.get(funn.id);
    // Markøren står på et punkt og har farge etter spiselighet. Er en av dem
    // endret, tegnes funnet på nytt i stedet for å flyttes.
    const uendret =
      forrige !== undefined &&
      forrige.lat === funn.display_lat &&
      forrige.lng === funn.display_lng &&
      forrige.edibility === (funn.edibility ?? null);
    (uendret ? staar : inn).push(funn);
  }

  const staarId = new Set(staar.map((funn) => funn.id));
  const ut = [...tegnet.keys()].filter((id) => !staarId.has(id));
  return { ut, staar, inn };
}
