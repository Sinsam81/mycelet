/**
 * Liten punktcache for oppslag mot tredjeparts kart- og skogtjenester.
 *
 * HVORFOR
 * «Lovende steder» sampler et n×n-rutenett og slår opp skog OG høyde per celle.
 * Med n=7 er det 49 + 49 kall per forsøk, og klienten utvider radien
 * sekvensielt over [5, 10, 20, 35] km til en radius gir treff — altså inntil
 * 392 forespørsler mot NIBIOs WMS og Kartverkets høydetjeneste fra ETT
 * knappetrykk. «Soppbilder på kartet» gjør det samme med n=6.
 *
 * Skogtypen og høyden i et punkt endrer seg ikke mellom to knappetrykk. Uten
 * cache er hvert eneste av disse kallene en gjentakelse — både ventetid for
 * brukeren og belastning på offentlige tjenester vi ikke har avtale med.
 *
 * HVA DEN IKKE ER
 * Per instans, i minnet. Vercel skalerer horisontalt, så treffraten avhenger av
 * hvor varm instansen er; dette er en bremse, ikke et arkiv. En varig cache
 * (Supabase-tabell eller Vercel KV) er neste steg om belastningen blir et
 * problem — den hører hjemme i en egen endring.
 *
 * Nøkkelen rundes til fire desimaler (~11 m). Finere enn både SR16-rasteret og
 * CORINE, så to kall som runder likt måler uansett samme flekk.
 */

interface Entry<T> {
  value: T;
  at: number;
  ttlMs: number;
}

export interface PointCacheOptions {
  /** Hvor lenge en verdi er gyldig. */
  ttlMs: number;
  /** Tak på antall nøkler. Eldste innslag kastes først (innsettingsrekkefølge). */
  maxEntries: number;
}

export class PointCache<T> {
  private readonly store = new Map<string, Entry<T>>();

  constructor(private readonly options: PointCacheOptions) {}

  private static key(lat: number, lon: number): string {
    return `${lat.toFixed(4)},${lon.toFixed(4)}`;
  }

  get(lat: number, lon: number): { hit: true; value: T } | { hit: false } {
    const key = PointCache.key(lat, lon);
    const entry = this.store.get(key);
    if (!entry) return { hit: false };
    if (Date.now() - entry.at > entry.ttlMs) {
      this.store.delete(key);
      return { hit: false };
    }
    return { hit: true, value: entry.value };
  }

  /**
   * `ttlMs` overstyrer standarden for ETT innslag. Brukes til å holde
   * «ingen data»-svar kort: et null-svar kan like gjerne være en tredjepart som
   * var nede et øyeblikk, og det skal ikke fryses inn for et døgn.
   */
  set(lat: number, lon: number, value: T, ttlMs?: number): void {
    const key = PointCache.key(lat, lon);
    // Skriv nøkkelen på nytt bakerst, så «eldste først» er lesbart av Map-en.
    this.store.delete(key);
    this.store.set(key, { value, at: Date.now(), ttlMs: ttlMs ?? this.options.ttlMs });
    while (this.store.size > this.options.maxEntries) {
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      this.store.delete(oldest.value);
    }
  }

  /** Kun for tester. */
  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
