import type { ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type * as Leaflet from 'leaflet';
import { stemAvFunnlag, type FunnTilLaget } from '@/lib/map/funnlag-avstemming';

/**
 * Funnlaget på kartet: markørene for brukernes funn, hver med en popup som er
 * sin egen lille React-rot.
 *
 * Laget ble tømt og bygget opp igjen ved hver henting. Det lukket popupen
 * brukeren hadde åpen (se src/lib/map/funnlag-avstemming.ts for hele
 * forklaringen). Denne klassen stemmer laget av i stedet: en markør som fortsatt
 * skal stå, røres ikke, og popup-roten dens får bare nytt innhold når noe i
 * innholdet faktisk er endret. Tilstanden inne i popupen — et halvskrevet
 * meldeskjema, en åpen slettebekreftelse — overlever da at kartet henter på
 * nytt.
 *
 * Bor i sin egen fil fordi MushroomMap.tsx ikke lar seg laste i en test.
 * Testen ved siden av (__tests__/funnlag.test.tsx) kjører ekte Leaflet og
 * ekte klyngelag.
 */

/** Det klassen trenger av klyngelaget (leaflet.markercluster). */
export interface Klyngelag {
  addLayer(layer: Leaflet.Layer): unknown;
  removeLayers(layers: Leaflet.Layer[]): unknown;
  clearLayers(): unknown;
}

export interface FunnIPopup extends FunnTilLaget {
  user_id?: string | null;
}

export interface Funnpopup {
  /**
   * Alt som avgjør hva popupen viser, som én streng. Er den lik forrige gang,
   * gjengis ikke popupen på nytt — ellers ville hver flytting av kartet gitt
   * én React-oppdatering per funn i utsnittet.
   */
  signatur: string;
  /** Lager innholdet. Kalles bare når signaturen er ny. */
  lag: () => ReactElement;
}

interface Innslag {
  marker: Leaflet.Marker;
  rot: Root;
  userId: string | null;
  signatur: string;
  lat: number;
  lng: number;
  edibility: string | null;
}

/** Som i kartet før: plass til bildet og teksten, og Leaflets eget kryss. */
const POPUP_VALG: Leaflet.PopupOptions = { closeButton: true, maxWidth: 320, minWidth: 240 };

export class Funnlag<T extends FunnIPopup> {
  private readonly innslag = new Map<string, Innslag>();

  constructor(
    private readonly leaflet: typeof Leaflet,
    /** Laget markørene ligger i. Kartet sammenligner på identitet for å kjenne igjen et utskiftet kart. */
    readonly klynger: Klyngelag,
    private readonly ikon: (funn: T) => Leaflet.Icon | Leaflet.DivIcon
  ) {}

  /** Antall markører i laget. */
  get antall(): number {
    return this.innslag.size;
  }

  /** Er funnet tegnet? */
  har(id: string): boolean {
    return this.innslag.has(id);
  }

  /** Markøren til et funn — for tester og feilsøking. */
  marker(id: string): Leaflet.Marker | undefined {
    return this.innslag.get(id)?.marker;
  }

  /**
   * Stem laget av mot et nytt svar. Synkront fra start til slutt: ingenting
   * annet rekker å røre laget mens det bygges om.
   */
  synk(funn: readonly T[], popup: (funn: T) => Funnpopup): void {
    const { ut, staar, inn } = stemAvFunnlag(this.innslag, funn);

    this.taUt(ut);

    for (const f of staar) {
      const innslag = this.innslag.get(f.id);
      if (!innslag) continue;
      innslag.userId = f.user_id ?? null;
      const neste = popup(f);
      if (neste.signatur === innslag.signatur) continue;
      // Samme rot, nytt innhold: React beholder tilstanden i popupen.
      innslag.rot.render(neste.lag());
      innslag.signatur = neste.signatur;
    }

    for (const f of inn) {
      // stemAvFunnlag slipper bare gjennom funn med koordinater.
      const lat = f.display_lat as number;
      const lng = f.display_lng as number;
      const marker = this.leaflet.marker([lat, lng], { icon: this.ikon(f) });
      const beholder = document.createElement('div');
      const rot = createRoot(beholder);
      const innhold = popup(f);
      rot.render(innhold.lag());
      marker.bindPopup(beholder, POPUP_VALG);
      this.klynger.addLayer(marker);
      this.innslag.set(f.id, {
        marker,
        rot,
        userId: f.user_id ?? null,
        signatur: innhold.signatur,
        lat,
        lng,
        edibility: f.edibility ?? null
      });
    }
  }

  /**
   * Ta ut alle funn fra én bruker — etter en blokkering. Skjer med en gang, av
   * markørene laget alt har, så det ikke avhenger av at en ny henting lykkes.
   * Returnerer hvor mange som ble tatt ut.
   */
  fjernFraBruker(userId: string): number {
    const ut = [...this.innslag].filter(([, innslag]) => innslag.userId === userId).map(([id]) => id);
    this.taUt(ut);
    return ut.length;
  }

  /**
   * Ta ut ett funn — etter en sletting. Som fjernFraBruker: med en gang, så
   * funnet ikke står igjen på kartet hvis hentingen etterpå feiler.
   */
  fjern(id: string): boolean {
    const fantes = this.innslag.has(id);
    this.taUt([id]);
    return fantes;
  }

  /** Tøm laget helt: når det bytter mellom egne og fellesskapets funn. */
  tom(): void {
    const rotter = [...this.innslag.values()].map((innslag) => innslag.rot);
    this.innslag.clear();
    this.klynger.clearLayers();
    for (const rot of rotter) rot.unmount();
  }

  /**
   * Kast alt uten å røre kartlaget — når kartet selv rives ned. Da er
   * markørene alt borte sammen med kartet, og bare React-røttene står igjen.
   */
  kast(): void {
    for (const innslag of this.innslag.values()) innslag.rot.unmount();
    this.innslag.clear();
  }

  private taUt(ider: readonly string[]): void {
    const markorer: Leaflet.Marker[] = [];
    const rotter: Root[] = [];
    for (const id of ider) {
      const innslag = this.innslag.get(id);
      if (!innslag) continue;
      markorer.push(innslag.marker);
      rotter.push(innslag.rot);
      this.innslag.delete(id);
    }
    if (markorer.length === 0) return;
    // Markørene først (det lukker en åpen popup), røttene etterpå.
    this.klynger.removeLayers(markorer);
    for (const rot of rotter) rot.unmount();
  }
}
