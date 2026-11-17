/**
 * Hvem leseren har blokkert — for funnlaget på kartet.
 *
 * Blokkering skjuler innlegg og kommentarer i forumet gjennom RLS (migrasjon
 * 032). Funnene på kartet leses gjennom `get_findings_in_bounds`, som ikke
 * kjenner blokkeringslista, så en bruker du hadde blokkert sto fortsatt på
 * kartet med nåler, bilder og notater. Kartet filtrerer dem nå bort selv
 * (utenBlokkerte i src/lib/moderation/blokkering.ts) — og trenger lista.
 *
 * Lista er et LØFTE, ikke en React-tilstand, med vilje. Funnlaget hentes med
 * en gang kartet står, og det skal ikke tegnes ufiltrert først og filtrert
 * etterpå: da ville den blokkertes funn blinket fram ved hver åpning. Kartet
 * starter derfor oppslaget samtidig med hentingen av funnene og venter på
 * begge før det tegner — på lista høyst en frist, se tredje regel. En tilstand
 * ville i tillegg gitt en ny henting av funnene i det lista kom inn.
 *
 * Fire regler:
 *  - Lista hentes én gang og gjenbrukes for hver flytting av kartet.
 *  - En henting som FEILET huskes ikke. Da vises funnene ufiltrert (som på
 *    forsiden), og neste lasting prøver igjen — ellers ville ett nettverksglipp
 *    ved åpning slått av filteret for resten av økta.
 *  - Ventingen har en FRIST. Et oppslag som verken svarer eller feiler — én
 *    forespørsel som blir hengende i skogkanten — holdt ellers hele funnlaget
 *    tomt, også brukerens egne offentlige funn, til nettleseren selv ga opp
 *    forespørselen. Hver ny lasting ventet på det samme løftet, så det hjalp
 *    ikke at senere forespørsler gikk gjennom. Etter fristen tegnes funnene
 *    ufiltrert, som ved en feil, og neste lasting starter et nytt oppslag.
 *    Kommer svaret likevel, tas det i bruk (naarHentet).
 *  - En blokkering gjort fra kartet gjelder straks (leggTil), også om
 *    hentingen er underveis eller feiler.
 *
 * Filteret er kosmetisk, ikke et sikkerhetsskille: radene er offentlige og
 * kommer fortsatt over nettet. Poenget er at «blokker» betyr at du slipper å
 * se personen.
 */

/** Svaret fra `supabase.from('blocked_users').select('blocked_id')` — RLS gir bare egne rader. */
export interface BlokkerteSvar {
  data: ReadonlyArray<{ blocked_id?: unknown }> | null;
  error: unknown;
}

/**
 * Så lenge venter funnlaget på lista før det tegner uten den. Oppslaget starter
 * samtidig med hentingen av funnene, så fristen løper mens funnene hentes: den
 * forsinker bare tegningen når funnene er inne og lista ikke er det.
 */
export const BLOKKERTE_FRIST_MS = 2_500;

export interface BlokkerteHuskValg {
  /** Så lenge venter ider() på et oppslag (ms). Standard BLOKKERTE_FRIST_MS. */
  fristMs?: number;
}

export interface BlokkerteHusk {
  /**
   * Id-ene leseren har blokkert, så langt de er kjent. Avvises aldri, og
   * venter høyst fristen: en feil eller et oppslag som ikke svarer, gir det
   * som er kjent lokalt.
   *
   * Settet er huskens eget, ikke en kopi. Kommer lista — eller en blokkering
   * fra kartet — til etter at løftet er løst, er id-ene med når settet LESES.
   * En lasting som fikk svaret sitt ved fristen og tegner et par sekunder
   * senere, filtrerer dermed med det som er kjent i det den tegner.
   */
  ider(): Promise<ReadonlySet<string>>;
  /**
   * Løses i det lista er hentet — aldri, hvis ingen henting lykkes. Starter
   * ikke noe oppslag selv. Kartet bruker det til å ta ut funnene til de
   * blokkerte av det som ALT er tegnet: det kan ha tegnet uten lista mens
   * oppslaget lot vente på seg, eller etter at et tidligere oppslag feilet.
   * Kom lista i tide, er det ingenting å ta ut.
   */
  naarHentet(): Promise<ReadonlySet<string>>;
  /** En blokkering gjort her og nå. Gjelder med en gang. */
  leggTil(id: string): void;
}

export function lagBlokkerteHusk(hent: () => PromiseLike<BlokkerteSvar>, valg: BlokkerteHuskValg = {}): BlokkerteHusk {
  const { fristMs = BLOKKERTE_FRIST_MS } = valg;
  /** Alt som er kjent: lista når den er hentet, og blokkeringer gjort herfra. */
  const kjente = new Set<string>();
  let hentet = false;
  let meldHentet: (ider: ReadonlySet<string>) => void = () => {};
  const hentetLofte = new Promise<ReadonlySet<string>>((los) => {
    meldHentet = los;
  });
  /** Oppslaget nye kall venter på. Null når ingen pågår, det feilet, eller fristen gikk ut. */
  let ventes: Promise<void> | null = null;

  const startOppslag = (): Promise<void> => {
    const denne: Promise<void> = new Promise((ferdig) => {
      const girOpp = () => {
        // Huskes ikke — men bare hvis ingen nyere henting har tatt plassen.
        if (ventes === denne) ventes = null;
        ferdig();
      };
      const frist = setTimeout(girOpp, fristMs);
      // Promise.resolve().then(…): også en henter som kaster med en gang
      // havner i feilgrenen under, etter at `denne` er satt.
      Promise.resolve()
        .then(() => hent())
        .then(({ data, error }) => {
          if (error) throw error;
          const ider: string[] = [];
          for (const rad of data ?? []) {
            if (typeof rad.blocked_id === 'string' && rad.blocked_id) ider.push(rad.blocked_id);
          }
          return ider;
        })
        .then(
          (ider) => {
            clearTimeout(frist);
            // Det første svaret gjelder. Et eldre oppslag som svarer etter at
            // et nyere har levert, har ikke noe nytt å si.
            if (!hentet) {
              hentet = true;
              for (const id of ider) kjente.add(id);
              meldHentet(kjente);
            }
            ferdig();
          },
          () => {
            clearTimeout(frist);
            girOpp();
          }
        );
    });
    return denne;
  };

  return {
    ider() {
      if (hentet) return Promise.resolve(kjente);
      ventes ??= startOppslag();
      return ventes.then(() => kjente);
    },
    naarHentet() {
      return hentetLofte;
    },
    leggTil(id) {
      if (id) kjente.add(id);
    }
  };
}
