/**
 * localStorage som ikke kan ta ned siden.
 *
 * `window.localStorage` KASTER — den returnerer ikke null — når nettleseren har
 * blokkert lagring: Chrome/Edge med «Blokker alle informasjonskapsler» for
 * domenet, iOS Safari med all lagring blokkert, og enkelte private-modus-
 * varianter. Selve PROPERTY-oppslaget kaster SecurityError, så et `getItem` uten
 * try/catch er nok til å velte hele React-treet.
 *
 * På /map var det fatalt: kart-introen og turgjenopprettingen leser storage på
 * hver mount, og kartet ER produktet. En bruker med blokkert lagring fikk ingen
 * kart i det hele tatt.
 *
 * Alle fire funksjonene er stille ved feil. Det er riktig her: lagringen er en
 * bekvemmelighet (har du sett introen, hadde du en tur i gang), aldri noe
 * sikkerhetskritisk. Ingen advarsel går tapt fordi en av dem returnerer null.
 */

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLocal(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // Full kvote eller blokkert lagring — ikke noe å gjøre, og ikke noe å kaste.
  }
}

export function removeLocal(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Se over.
  }
}

/** Leser og parser JSON. Ugyldig eller utilgjengelig innhold gir null. */
export function readLocalJson<T>(key: string): T | null {
  const raw = readLocal(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Skadet verdi: rydd opp, men bare hvis vi i det hele tatt får lov.
    removeLocal(key);
    return null;
  }
}
