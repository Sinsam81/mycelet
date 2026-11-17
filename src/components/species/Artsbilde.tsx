'use client';

import { useCallback, useState } from 'react';

/**
 * Et artsbilde som faller tilbake på utgaven vi vet finnes.
 *
 * Artssiden ber Wikimedia Commons om bredere utgaver av bildene enn de som er
 * lagret i basen (src/lib/species/artsbilde.ts). De bredere utgavene er
 * avledet av URL-en, ikke lagret — så hvis én av dem ikke lar seg laste
 * (Commons struper, eller slutter en dag å skalere opp små originaler), skal
 * leseren få bildet som alltid har virket, ikke et knust bildeikon.
 *
 *   `srcSet`   flere bredder av samme bilde. Feiler den nettleseren valgte,
 *              fjernes hele lista og `src` brukes alene. Å bytte bare `src`
 *              holder ikke: nettleseren fortsetter å velge fra srcset.
 *   `reserve`  utgaven som er lagret i basen, når `src` selv er en avledet
 *              bredde. Feiler `src`, vises reserven.
 *
 * Siden er server-rendret, så bildet kan ha feilet FØR React koblet på
 * onError — og da kommer hendelsen aldri. Derfor sjekkes bildet også idet
 * komponenten monteres: et ferdig lastet bilde uten bredde er et som feilet.
 *
 * Krediteringen (<PhotoCredit>) hører til fila, ikke bredden, og står utenfor.
 */
interface ArtsbildeProps {
  /** Utgaven vi helst viser. */
  src: string;
  srcSet?: string | null;
  sizes?: string;
  /** Den lagrede utgaven, når `src` er en avledet bredde. */
  reserve?: string | null;
  alt: string;
  className?: string;
  /** Utelatt = straks (hovedbildet). `lazy` for bilder lenger ned på siden. */
  loading?: 'lazy' | 'eager';
}

export function Artsbilde({ src, srcSet, sizes, reserve, alt, className, loading }: ArtsbildeProps) {
  // Hvilken `src` som feilet — så tilstanden nullstiller seg selv når
  // bildekarusellen blar til neste bilde.
  const [feiletSrc, setFeiletSrc] = useState<string | null>(null);
  const feilet = feiletSrc === src;

  const reserveSrc = reserve && reserve !== src ? reserve : null;
  const harUtvei = Boolean(srcSet) || reserveSrc != null;

  // Bare ved montering: etter det er onError koblet på, og fanger feilen selv.
  const sjekkVedMontering = useCallback((bilde: HTMLImageElement | null) => {
    if (bilde && bilde.complete && bilde.naturalWidth === 0 && bilde.getAttribute('src')) {
      setFeiletSrc(bilde.getAttribute('src'));
    }
  }, []);

  if (feilet || !harUtvei) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Commons-miniatyr i fast bredde; next/image ville sendt den gjennom en ekstra omkoding
      <img src={feilet ? (reserveSrc ?? src) : src} alt={alt} className={className} loading={loading} decoding="async" />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- se over
    <img
      ref={sjekkVedMontering}
      src={src}
      srcSet={srcSet ?? undefined}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      onError={() => setFeiletSrc(src)}
    />
  );
}
