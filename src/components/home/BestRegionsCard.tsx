'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { regionBandHex, regionScoreToCondition } from '@/lib/prediction/region-score';
import { previousDate, withinCronGraceWindow } from '@/lib/prediction/tile-freshness';
import { useFolgerOmrade } from '@/components/home/folger-omrade-hendelse';
import { Hentefeil, skalProveIgjen } from '@/components/home/hentefeil';

/**
 * «Hvor i landet er det best i dag?»
 *
 * DETTE ER DEN ENE ROMLIGE SAMMENLIGNINGEN MODELLEN BÆRER — og den brukeren
 * aldri fikk se, fordi kartet bare viser ett utsnitt om gangen.
 *
 * Målt 2026-08-04: spennet MELLOM regioner er 47 poeng (Bergen 81, Oslo 34),
 * mot median 7 poeng INNE i ett kartutsnitt. Sju ganger større. Kartet kan ikke
 * rangere skogholt mot skogholt (romlig AUC ~0,52), men landsdel mot landsdel er
 * en helt annen og mye grovere påstand — og den handler om FORHOLD (vær, sesong,
 * fukt), ikke om at vi vet hvor soppen står.
 *
 * En som står i Oslo skal få vite at Vestlandet ligger 47 poeng over, selv om
 * det er fem timer å kjøre. Det er brukerens valg om det er verdt turen; vår
 * jobb er å ikke skjule at forskjellen finnes.
 *
 * ETT LAND OM GANGEN. Lista blandet først norske og svenske regioner, og da
 * druknet den lokale rangeringen: 2026-08-04 lå fire av de fem øverste i Norge,
 * så en svensk bruker måtte lete nedover for å finne noe hen kunne kjøre til.
 * «Best i landet» skal bety brukerens eget land.
 *
 * Standardvalget følger SPRÅKET, som er det appen allerede bruker til å avgjøre
 * hvor brukeren hører hjemme (MYCELET_LOCALE → Accept-Language → nb). Men språk
 * er ikke posisjon — en nordmann kan stå i Värmland — så bryteren er der, og
 * valget huskes ikke lenger enn økta. Vi gjetter, vi låser ikke.
 */

interface RegionRad {
  name: string;
  country: 'NO' | 'SE' | null;
  score: number;
  leadingSpecies: string | null;
  verdict: string;
  lat: number;
  lng: number;
}

const FLAGG: Record<string, string> = { NO: '🇳🇴', SE: '🇸🇪' };

/**
 * ── HENTINGEN ───────────────────────────────────────────────────────────────
 *
 * Lista hentes gjennom appens QueryClient (Providers), ikke med en løs
 * useEffect. Kortet holdt før svaret i sin egen tilstand, så hver retur til
 * forsiden (Hjem → Kart → Hjem) monterte det tomt og hentet på nytt — tre grå
 * streker og et nytt kall for tall serveren selv regner ut én gang i døgnet.
 * Og feilet det ene kallet, var kortet borte til neste gang forsiden ble åpnet,
 * uten et forsøk til.
 *
 * Nå: en retur innen et kvarter tegner lista med en gang, uten kall. Etter det
 * tegnes den fortsatt med en gang, og friskes opp i bakgrunnen. Et kall som
 * feiler prøves to ganger til før kortet gir opp. Minnet gjelder innenfor én
 * rasterdag: første åpning etter nattens raster starter tomt (regionerNokkel).
 *
 * ⚠️ networkMode 'always'. Standarden ('online') setter spørringen på VENT når
 * nettleseren har meldt «offline», i stedet for å la kallet feile. Da ville de
 * tre grå strekene blitt stående så lenge dekningen var borte — i skogen, der
 * appen brukes. Med 'always' oppfører hentingen seg som et vanlig kall: den
 * prøver, feiler, og kortet tar seg selv bort.
 */

/** Så lenge regnes lista som fersk. Rasteret bak den lages én gang i døgnet. */
export const REGIONER_FERSK_MS = 15 * 60_000;
/** Så lenge huskes lista etter at kortet er borte fra skjermen. */
export const REGIONER_HUSKES_MS = 60 * 60_000;
/** Nye forsøk etter det første, før kortet gir opp. */
export const REGIONER_NYE_FORSOK = 2;

/**
 * Rasterdagen: datoen nattens raster senest kan ha akkurat nå. Dagens UTC-dato
 * fra klokka 02 UTC, gårsdagens før det — flisjobbene går 01:15 (Norge) og
 * 01:45 (Sverige) UTC og skriver UTC-datoen (tile-freshness.ts).
 *
 * Ikke kalenderdagen. Mellom midnatt UTC og jobbene svarer ruta selv med
 * gårsdagens raster, så en grense ved midnatt ville lagt en liste hentet i
 * det vinduet under DAGENS dato, der den kunne bli stående til neste midnatt.
 */
export function rasterdag(naar: Date): string {
  const idag = naar.toISOString().slice(0, 10);
  return withinCronGraceWindow(naar) ? previousDate(idag) : idag;
}

/**
 * SPRÅKET ER EN DEL AV NØKKELEN. Ruta svarer med dommer og artsnavn på ett
 * språk; et mellomlager uten språk i nøkkelen serverer den første leserens
 * språk til alle (i18n-regelen i CLAUDE.md).
 *
 * DAGEN OGSÅ — rasterdagen kortet ble åpnet. Overskriften sier «i dag», og en
 * feilet oppfriskning lar lista i minnet stå (se `feilet` under). Uten dagen i
 * nøkkelen var det ingen grense for hvor gammel den lista kunne være: appen sto
 * på Hjem om kvelden, ble tatt fram igjen i skogen neste morgen uten dekning,
 * og en tur innom kartet og tilbake tegnet gårsdagens tall og dommer under
 * «Best i landet i dag» — og der ble de stående. Nå er en ny rasterdag en ny
 * nøkkel: en åpning etter nattens raster henter på nytt, og feiler det, tar
 * kortet seg selv bort. Samme grep som dagen i prognoseNokkel (MushroomDayCard).
 */
export const regionerNokkel = (locale: string, dag: string) => ['prediction-regions', locale, dag] as const;

export async function hentBesteRegioner(locale: string): Promise<RegionRad[]> {
  // Språket står også i adressen, så svaret og nøkkelen ikke kan være uenige:
  // uten det leser ruta informasjonskapselen, og den kan ha byttet siden
  // forrige henting.
  const svar = await fetch(`/api/prediction/regions?locale=${encodeURIComponent(locale)}`);
  if (!svar.ok) throw new Hentefeil('Områdelista', svar.status);
  const data = (await svar.json()) as { regions?: unknown } | null;
  return Array.isArray(data?.regions) ? (data.regions as RegionRad[]) : [];
}

/** Nettverksfeil og 5xx: inntil to nye forsøk. 4xx: aldri (hentefeil.ts). */
export function skalProveRegionerIgjen(antallFeil: number, feil: unknown): boolean {
  return skalProveIgjen(antallFeil, feil, REGIONER_NYE_FORSOK);
}

export function BestRegionsCard({
  /**
   * Serveren så en aktiv varselrad. Da er «Få varsel på e-post» en oppfordring
   * til noe brukeren alt har — og den skal bort også i det øyeblikket hen
   * begynner å følge et område fra stripa i forsidekortet (useFolgerOmrade).
   */
  folger: folgerFraServer = false
}: {
  folger?: boolean;
} = {}) {
  const t = useTranslations('Home');
  const locale = useLocale();
  const folger = useFolgerOmrade(folgerFraServer);
  const [land, setLand] = useState<'NO' | 'SE'>(locale === 'sv' ? 'SE' : 'NO');
  const [utvidet, setUtvidet] = useState(false);
  /** Rasterdagen kortet ble åpnet. En åpning etter nattens raster får ny nøkkel, og dermed ny liste. */
  const [dag] = useState(() => rasterdag(new Date()));

  const sporring = useQuery({
    queryKey: regionerNokkel(locale, dag),
    queryFn: () => hentBesteRegioner(locale),
    staleTime: REGIONER_FERSK_MS,
    gcTime: REGIONER_HUSKES_MS,
    retry: skalProveRegionerIgjen,
    networkMode: 'always'
  });
  const regions = sporring.data ?? null;
  // Kortet forsvinner helt hvis kallet feiler. En tom ramme med en
  // feilmelding på forsiden er verre enn ingen ramme. Men bare når det ikke
  // er noe å vise: feiler en oppfriskning i bakgrunnen, står lista som alt er
  // på skjermen (TanStack beholder forrige svar ved siden av feilen). Den
  // lista er aldri hentet før rasterdagen kortet ble åpnet — se regionerNokkel.
  const feilet = sporring.isError && !regions;

  // Land som faktisk har regioner i rasteret. Uten dette ville bryteren tilbudt
  // et land der lista er tom — verre enn å ikke tilby valget.
  const tilgjengeligeLand = useMemo(
    () => (['NO', 'SE'] as const).filter((l) => (regions ?? []).some((r) => r.country === l)),
    [regions]
  );
  const iLandet = useMemo(
    () => (regions ?? []).filter((r) => r.country === land),
    [regions, land]
  );

  if (feilet || (regions && regions.length === 0)) return null;

  const vist = regions ? (utvidet ? iLandet : iLandet.slice(0, 5)) : [];
  // Ingen av landets områder over laveste bånd (vinteren, en tørr uke): da er
  // «der de er best» en rangering av støy, og undertittelen sier det i stedet.
  // Samme stige som prikken og dommen. Kortet skjules IKKE — det er eneste vei
  // til /soppforhold og varselpåmeldingen inne fra appen (se lenkene under).
  const alleStille = iLandet.length > 0 && iLandet.every((r) => regionScoreToCondition(r.score) === 'poor');

  return (
    <article className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">{t('bestRegionsTitle')}</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {alleStille ? t('bestRegionsQuiet') : t('bestRegionsSubtitle')}
          </p>
        </div>
        {tilgjengeligeLand.length > 1 ? (
          <div className="flex shrink-0 gap-1 rounded-full bg-gray-100 p-0.5" role="group">
            {tilgjengeligeLand.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => {
                  setLand(l);
                  setUtvidet(false);
                }}
                aria-pressed={land === l}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  land === l ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {FLAGG[l]} {t(l === 'NO' ? 'bestRegionsNorway' : 'bestRegionsSweden')}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!regions ? (
        <div className="mt-3 space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {vist.map((r, i) => (
            <li key={r.name}>
              <Link
                // Navnet er ikke pynt: det gir kartet en værstripe med en
                // nullstillingsknapp, som er den eneste veien ut av utsnittet.
                href={`/map?lat=${r.lat}&lng=${r.lng}&zoom=10&sted=${encodeURIComponent(r.name)}`}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-forest-50"
              >
                <span className="w-4 shrink-0 text-xs font-semibold text-gray-400">{i + 1}</span>
                {/* Regionstigen, ikke rutestigen. Prikken kom tidligere fra
                    colorForScore, som er kalibrert på ENKELTRUTER — derfor
                    lyste et områdetall på 79 grønt ved siden av en dom som
                    egentlig sa «gode dager». Farge og dom leser nå samme
                    stige, som er hele poenget med å ha én. */}
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: regionBandHex(r.score) }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {r.country ? `${FLAGG[r.country]} ` : ''}
                    {r.name}
                  </span>
                  {/* Dommen, ikke bare tallet — «34» alene sier ingenting. */}
                  <span className="block truncate text-xs text-gray-500">{r.verdict}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-700">{r.score}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {regions && iLandet.length > 5 ? (
        <button
          type="button"
          onClick={() => setUtvidet((v) => !v)}
          className="mt-2 w-full rounded-lg py-1.5 text-xs font-medium text-forest-800 transition hover:bg-forest-50"
        >
          {utvidet ? t('bestRegionsCollapse') : t('bestRegionsExpand', { count: iLandet.length - 5 })}
        </button>
      ) : null}

      {/* Veien videre. Uten disse to var /soppforhold UTILGJENGELIG inne fra
          appen — ingen lenke fra forsiden, ingen fra navigasjonen — og
          soppvarselets eneste påmeldingsknapp ligger nettopp der. Trakten
          «se at det er bra et sted → få beskjed neste gang» var brutt for
          alle som ikke kom inn utenfra.

          Varsel-lenka vises ikke til en som alt følger et område. Lenka til
          /soppforhold står alltid. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link href="/soppforhold" className="text-xs font-medium text-forest-800 hover:underline">
          {t('bestRegionsAllAreas')} →
        </Link>
        {folger ? null : (
          <Link href="/profile?vis=soppvarsel" className="text-xs font-medium text-forest-800 hover:underline">
            {t('bestRegionsAlert')} →
          </Link>
        )}
      </div>

      {/* Forbeholdet hører i detaljen, ikke i overskriften — men det skal stå. */}
      <p className="mt-2 text-[11px] leading-relaxed text-gray-600">{t('bestRegionsDisclaimer')}</p>
    </article>
  );
}
