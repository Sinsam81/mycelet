/**
 * Når kan kartet la være å hente på nytt?
 *
 * HVORFOR
 * Laget med registrerte funn hentet alt på nytt ved hver eneste panorering og
 * zoom: opptil 6000 rader over seks forespørsler, og så ble hver markør bygget
 * opp igjen. Også når brukeren zoomet INN — der det forrige, større utsnittet
 * allerede inneholdt hver rad det nye trengte. På én strek dekning i
 * skogkanten, som er der kartet brukes, er det megabyte med data og et lag som
 * blinker ut og inn for å vise det samme.
 *
 * REGELEN
 * Et nytt utsnitt som ligger helt inne i det forrige hentede, trenger ingen ny
 * henting — SÅ LENGE den forrige ikke ble avkuttet. En avkuttet henting er et
 * vilkårlig utvalg (funksjonen har ingen ORDER BY, se paged-rpc.ts), og et
 * utvalg kan ikke gjenbrukes for et annet utsnitt: funnene som mangler, kan
 * være nettopp de som ligger der brukeren zoomet inn.
 *
 * For at også små panoreringer skal treffe, hentes det litt mer enn det som
 * vises (polstring). Men polstring gir flere rader, og flere rader gir
 * avkutting tidligere — taket på 6000 ble hevet nettopp for at Oslo ved vanlig
 * zoom skulle komme hel fram. Derfor polstres det bare når forrige henting sier
 * at det er god plass, og kallstedet henter det nakne utsnittet på nytt hvis en
 * polstret henting likevel ble avkuttet.
 *
 * Ren geometri og ett overslag — ingen nettverkskall — så reglene kan testes.
 */

export interface Utsnitt {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Andel av bredden og høyden som legges til på hver side. */
export const POLSTRING = 0.2;

/**
 * Polstres bare når overslaget for den polstrede hentingen ligger under denne
 * andelen av taket. Halvparten: tettheten varierer over kartet, og overslaget
 * må kunne bomme med det dobbelte uten at utvalget blir avkuttet.
 */
export const TRYGG_ANDEL_AV_TAK = 0.5;

/** Utvid utsnittet med `andel` av bredden og høyden på hver side, klemt til kloden. */
export function polstreUtsnitt(utsnitt: Utsnitt, andel: number = POLSTRING): Utsnitt {
  const dLat = (utsnitt.north - utsnitt.south) * andel;
  const dLng = (utsnitt.east - utsnitt.west) * andel;
  return {
    south: Math.max(-90, utsnitt.south - dLat),
    west: Math.max(-180, utsnitt.west - dLng),
    north: Math.min(90, utsnitt.north + dLat),
    east: Math.min(180, utsnitt.east + dLng)
  };
}

/** Ligger `ny` helt innenfor `forrige`? Kantene teller som innenfor. */
export function dekkerUtsnitt(forrige: Utsnitt, ny: Utsnitt): boolean {
  return (
    ny.south >= forrige.south && ny.north <= forrige.north && ny.west >= forrige.west && ny.east <= forrige.east
  );
}

export function ligger(punkt: { lat: number; lng: number }, utsnitt: Utsnitt): boolean {
  return (
    punkt.lat >= utsnitt.south && punkt.lat <= utsnitt.north && punkt.lng >= utsnitt.west && punkt.lng <= utsnitt.east
  );
}

/** Flateinnhold i kvadratgrader. Bare til forholdstall mellom utsnitt på samme breddegrad. */
export function utsnittAreal(utsnitt: Utsnitt): number {
  return Math.max(0, utsnitt.north - utsnitt.south) * Math.max(0, utsnitt.east - utsnitt.west);
}

export interface ForrigeHenting {
  /** Utsnittet som faktisk ble hentet (kan være polstret). */
  utsnitt: Utsnitt;
  /** Rader serveren ga for det utsnittet. */
  antallRader: number;
  /** Traff hentingen taket? Da er radene et utvalg. */
  avkortet: boolean;
}

/** Kan radene fra forrige henting brukes for det som vises nå? */
export function kanGjenbrukeHenting(forrige: ForrigeHenting | null, visning: Utsnitt): boolean {
  return forrige !== null && !forrige.avkortet && dekkerUtsnitt(forrige.utsnitt, visning);
}

/**
 * Utsnittet som skal hentes for det som vises: polstret når forrige henting
 * (samme art og årsfilter) tilsier at det er god plass under taket, ellers
 * akkurat det som vises. Uten en forrige henting, eller når den ble avkuttet,
 * vet vi ikke nok til å polstre.
 */
export function velgHenteutsnitt({
  visning,
  forrige,
  tak,
  polstring = POLSTRING
}: {
  visning: Utsnitt;
  forrige: ForrigeHenting | null;
  tak: number;
  polstring?: number;
}): Utsnitt {
  if (!forrige || forrige.avkortet) return visning;
  const forrigeAreal = utsnittAreal(forrige.utsnitt);
  if (!(forrigeAreal > 0)) return visning;
  const polstret = polstreUtsnitt(visning, polstring);
  const forventetRader = forrige.antallRader * (utsnittAreal(polstret) / forrigeAreal);
  return forventetRader <= tak * TRYGG_ANDEL_AV_TAK ? polstret : visning;
}
