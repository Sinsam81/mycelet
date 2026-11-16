import { sesongtilstand } from '@/lib/sesong/sesongtilstand';

/**
 * «I dag» for en rute som svarer en leser i Norge eller Sverige.
 *
 * HVORFOR
 * Serveren går i UTC. /api/mushroom-day og /api/mushroom-forecast tok dagen
 * fra `now.toISOString().slice(0, 10)` og måneden fra `now.getMonth()`, så
 * mellom midnatt og kl. 01 (vintertid) eller 02 (sommertid) norsk tid var «i
 * dag» fortsatt i går: sjudagersstripen på forsiden viste «I dag» for dagen som
 * nettopp var slutt, og kalte dagen leseren faktisk sto i for morgendagens
 * ukedag. Ved et månedsskifte fulgte sesongleddet med — 1. juni kl. 00.30 var
 * det fortsatt mai, og mai er utenom sesongen.
 *
 * Datoen kommer fra sesongtilstand(), den ene kilden for «hvor i soppåret er
 * vi» (Europe/Oslo — Norge og Sverige deler sone). Denne legger bare til
 * dagen i måneden, som assessMushroomDay trenger for det glidende
 * sesongleddet.
 *
 * Tidspunktet sendes inn, så tester aldri avhenger av dagens dato.
 */
export interface OsloDag {
  /** ÅÅÅÅ-MM-DD, Oslo-tid. */
  dato: string;
  /** 1–12, Oslo-tid. */
  maaned: number;
  /** 1–31, Oslo-tid. */
  dagIManeden: number;
}

export function osloIDag(naa: Date): OsloDag {
  const { osloDato, maaned } = sesongtilstand(naa);
  return { dato: osloDato, maaned, dagIManeden: Number(osloDato.slice(8, 10)) };
}

/**
 * Dag i året (1–366) for Oslo-datoen — det fenologikurvene slås opp på.
 * `dayOfYearOf(new Date())` regnet i UTC og lå en dag bak mellom midnatt og
 * kl. 01/02 norsk tid, også over et månedsskifte.
 */
export function osloDagIAaret(naa: Date): number {
  const [aar, maaned, dag] = osloIDag(naa).dato.split('-').map(Number);
  return Math.floor((Date.UTC(aar, maaned - 1, dag) - Date.UTC(aar, 0, 1)) / 86_400_000) + 1;
}
