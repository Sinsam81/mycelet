import type { Kurvepunkt, SesongkurveTekster, SesongkurveVisning } from '@/lib/species/sesongkurve';

/**
 * Sesongkurven på artssiden: når arten er registrert, uke for uke.
 *
 * Ren tegning. Tallene og tekstene kommer ferdige fra
 * src/lib/species/sesongkurve.ts, der det også står hva kurven er og hva den
 * ikke er — og når den ikke skal vises i det hele tatt. Herfra importeres bare
 * typer: datamodulen bak (phenology-data.ts, 54 kB) skal aldri følge med en
 * komponent ut til nettleseren.
 *
 * Ingen 'use client' og ingen hooks, så den rendres på serveren sammen med
 * resten av artssiden og legger ingenting til klientbunten.
 *
 * FIRE VALG I TEGNINGEN:
 *
 * - Ingen tall på y-aksen. Verdiene er normalisert til toppuka = 1, så bare
 *   formen betyr noe. Et tall der ville sett ut som en mengde.
 * - All tekst står UTENFOR svg-en. Flaten strekkes til kolonnens bredde
 *   (preserveAspectRatio="none"); tekst inni ville blitt strukket med.
 * - Hele figuren er ett bilde for en skjermleser (role="img"), med et navn som
 *   sier toppen i ord. Setningen står også synlig inni figuren — den er inne i
 *   bildet nettopp for at den ikke skal leses opp to ganger.
 * - Samme nøytrale grå for alle arter. Kurven er lik for matsopp og giftsopp,
 *   så den kan ikke ha en farge som sier noe om spiselighet. Den var grønn,
 *   med et mørkere grønt toppfelt — også på grønn fluesopp, rett under den
 *   røde boksen. Kalenderen gir aldri farlige arter grønt, fordi grønt leses
 *   som «klar til å plukkes» (YearTable.tsx); rødt ville gjort kurven til en
 *   advarsel den ikke er. Linja og toppfeltet har minst 3:1 mot sidens
 *   kremfarge, og toppfeltet minst 3:1 mot flaten ved siden av (låst i
 *   testen, regnet ut av de faktiske Tailwind-fargene).
 */

interface SesongKurveProps {
  visning: SesongkurveVisning;
  /** Korte månedsnavn, indeks 0 = januar («jan» … «des»). */
  manedsnavn: readonly string[];
  tekster: SesongkurveTekster;
}

/** Tegneflaten i svg-enheter. Bredden strekkes; høyden settes av klassen på svg-en. */
const BREDDE = 1000;
const HOYDE = 100;
/** Luft over toppuka, så kurven ikke ligger i kanten av flaten. */
const LUFT = 8;

function px(andel: number): number {
  return Math.round(Math.min(1, Math.max(0, andel)) * BREDDE * 10) / 10;
}

function py(verdi: number): number {
  return Math.round((HOYDE - Math.min(1, Math.max(0, verdi)) * (HOYDE - LUFT)) * 10) / 10;
}

function prosent(andel: number): string {
  return `${Math.round(Math.min(1, Math.max(0, andel)) * 1000) / 10}%`;
}

function linje(punkter: readonly Kurvepunkt[]): string {
  return punkter.map((punkt, i) => `${i === 0 ? 'M' : 'L'}${px(punkt.x)},${py(punkt.verdi)}`).join(' ');
}

/** Flaten under en linje: ned til grunnlinja i begge ender. */
function flate(punkter: readonly Kurvepunkt[]): string {
  const forste = punkter[0];
  const siste = punkter[punkter.length - 1];
  return `M${px(forste.x)},${HOYDE} ${linje(punkter).replace(/^M/, 'L')} L${px(siste.x)},${HOYDE} Z`;
}

/**
 * Hvor «i dag» står over streken. Midtstilt, bortsett fra helt i kantene, der
 * en midtstilt etikett ville stukket ut av figuren.
 */
function iDagPlassering(andel: number): { className: string; style: { left?: string; right?: string } } {
  if (andel < 0.08) return { className: 'absolute', style: { left: prosent(andel) } };
  if (andel > 0.92) return { className: 'absolute', style: { right: prosent(1 - andel) } };
  return { className: 'absolute -translate-x-1/2', style: { left: prosent(andel) } };
}

export function SesongKurve({ visning, manedsnavn, tekster }: SesongKurveProps) {
  const { punkter, topp, maneder, iDag } = visning;
  if (punkter.length < 2) return null;

  // Ukepunktene står midt i uka. Kurven føres flatt ut til kantene av aksen,
  // så flaten dekker hele vinduet og ikke slutter en halv uke før.
  const kurve: Kurvepunkt[] = [
    { x: 0, verdi: punkter[0].verdi },
    ...punkter,
    { x: 1, verdi: punkter[punkter.length - 1].verdi }
  ];
  const plassering = iDag != null ? iDagPlassering(iDag) : null;

  return (
    <figure className="m-0">
      <div role="img" aria-label={tekster.ariaLabel}>
        <p className="text-xs font-semibold text-gray-900">{tekster.topp}</p>

        {/* «i dag» står over streken, utenfor svg-en. Utenfor det målte vinduet
            (desember–mars) finnes verken strek eller etikett. */}
        {plassering ? (
          <div className="relative mt-1 h-4 text-[11px] font-semibold leading-4 text-gray-900">
            <span className={plassering.className} style={plassering.style}>
              {tekster.iDag}
            </span>
          </div>
        ) : null}

        <svg
          viewBox={`0 0 ${BREDDE} ${HOYDE}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
          className={`block h-20 w-full border-b border-gray-300 ${plassering ? '' : 'mt-2'}`.trim()}
        >
          {/* Månedsskillene, bak kurven. */}
          {maneder.map(({ maaned, skille }) =>
            skille != null ? (
              <line
                key={maaned}
                x1={px(skille)}
                x2={px(skille)}
                y1={0}
                y2={HOYDE}
                className="stroke-gray-200"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ) : null
          )}
          <path d={flate(kurve)} className="fill-gray-200" />
          {/* Perioden med flest registrerte funn — den setningen over nevner. */}
          {topp.length >= 2 ? <path d={flate(topp)} className="fill-gray-500" /> : null}
          <path
            d={linje(kurve)}
            className="fill-none stroke-gray-700"
            strokeWidth={1.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {iDag != null ? (
            <line
              x1={px(iDag)}
              x2={px(iDag)}
              y1={0}
              y2={HOYDE}
              className="stroke-gray-900"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>

        <div className="relative mt-1 h-4 text-[11px] leading-4 text-gray-600">
          {maneder.map(({ maaned, etikett }) =>
            etikett != null ? (
              <span key={maaned} className="absolute -translate-x-1/2" style={{ left: prosent(etikett) }}>
                {manedsnavn[maaned - 1]}
              </span>
            ) : null
          )}
        </div>
      </div>

      <figcaption className="mt-2 text-[11px] leading-snug text-gray-600">{tekster.bildetekst}</figcaption>
    </figure>
  );
}
