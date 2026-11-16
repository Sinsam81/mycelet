'use client';

import { FolgOmrade } from '@/components/home/FolgOmrade';
import { Hentefeil, skalProveIgjen } from '@/components/home/hentefeil';
import { erUtenomSesongFlush } from '@/components/home/utenom-sesong-flush';
import { RegistrerBruksdag } from '@/components/bruk/RegistrerBruksdag';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { forecastBarHeights } from '@/lib/utils/forecast-bars';
import { forecastBand } from '@/lib/utils/forecast-scale';
import { getCurrentPositionIfGranted, getCurrentPositionOnce } from '@/lib/hooks/useGeolocation';
import { lagreHusketPosisjon, lesHusketPosisjon, sammeRute } from '@/lib/map/husket-posisjon';
import { posisjonsVisning } from '@/lib/map/posisjon-visning';
import { standardPosisjon } from '@/lib/map/standard-posisjon';
import { nearestRegion } from '@/lib/prediction/tile-regions';
import type { HJEM_OMRADER } from '@/lib/bruk/bruksdag';

interface DayPoint {
  date: string;
  /** Short weekday label, already in the reader's language (see /api/mushroom-forecast). */
  label: string;
  isToday?: boolean;
  score: number;
  optimal: boolean;
}

type FlushStatus = 'fruiting' | 'soon' | 'building' | 'dry' | 'dormant';

interface Flush {
  status: FlushStatus;
  daysUntil: number | null;
  title: string;
  message: string;
  /** Hvorfor status er 'dormant' (flush.ts). Mangler i svar cachet før feltet kom. */
  reason?: 'offSeason' | 'cold' | 'speciesOffSeason';
  /** Ordene er sesongkvalifisert — tidlig eller sent i sesongen (flush.ts). */
  shoulder?: 'early' | 'late';
}

interface Forecast {
  today: { optimal: boolean; score: number; title: string; message: string; reasons: string[] };
  days: DayPoint[];
  flush?: Flush;
  hasForecast: boolean;
}

/** «egen» = brukerens egen eller huskede posisjon, «standard» = standardområdet for språket (bruksdag.ts). */
type Kilde = (typeof HJEM_OMRADER)[number];

interface Posisjon {
  lat: number;
  lng: number;
  kilde: Kilde;
}

/** Det kortet viser: prognosen OG posisjonen den gjelder for. De to hører sammen — aldri nytt navn på gammelt tall. */
interface Vist {
  prognose: Forecast;
  posisjon: Posisjon;
}

/**
 * ── HENTINGEN ───────────────────────────────────────────────────────────────
 *
 * Prognosen hentes gjennom appens QueryClient (Providers). Kortet holdt før
 * svaret i sin egen tilstand og hentet i en løs useEffect, så hver retur til
 * forsiden (Hjem → Kart → Hjem) startet på «Sjekker soppforholdene …» og
 * spurte på nytt om noe ruta selv holder i 30 minutter. Nå tegnes kortet med
 * en gang når svaret alt ligger i minnet, og friskes opp i bakgrunnen når det
 * er eldre enn et kvarter.
 *
 * Bare HENTINGEN er flyttet. Hvor kortet regner (posisjonsvalget), hva det
 * viser mens en ny henting går eller feiler, bruksdagen og «kortet har data»
 * er som før: oppførselstestene i __tests__/MushroomDayCard.test.tsx (alt før
 * «prognosen huskes mellom åpninger») ble skrevet mot den gamle hentingen og
 * besto mot begge.
 *
 * To ting er nye, med vilje: et kall som feiler får ETT forsøk til (før: ingen),
 * og svaret huskes mellom åpninger.
 */

/** Så lenge regnes en hentet prognose som fersk. Ruta selv holder svaret i 30 minutter. */
export const PROGNOSE_FERSK_MS = 15 * 60_000;
/** Så lenge huskes prognosen etter at kortet er borte fra skjermen. */
export const PROGNOSE_HUSKES_MS = 60 * 60_000;
/** Nye forsøk etter det første når hentingen feiler. Før: ingen. */
export const PROGNOSE_NYE_FORSOK = 1;

/**
 * Nøkkelen i minnet. Alt svaret avhenger av, står her:
 *  · ruta — to desimaler, samme avrunding som adressen og rutas eget lager;
 *  · språket — dommen, banneret og ukedagene er tekst på leserens språk, og et
 *    lager uten språk i nøkkelen serverer første lesers språk til alle;
 *  · dagen — «i dag» i svaret er rutas UTC-dato. Et svar fra i går skal aldri
 *    kunne tegnes som dagens.
 * `kilde` («egen» / «standard») står IKKE her: den sier hvor posisjonen kom
 * fra, ikke hva prognosen er, og følger posisjonen i kortets egen tilstand.
 */
export const prognoseNokkel = (p: { lat: number; lng: number }, locale: string, dag: string) =>
  ['mushroom-forecast', p.lat.toFixed(2), p.lng.toFixed(2), locale, dag] as const;

/** Rutas «i dag»: UTC-datoen (todayKey i /api/mushroom-forecast). */
const utcDag = (naar: Date) => naar.toISOString().slice(0, 10);

async function hentPrognose(p: { lat: number; lng: number }): Promise<Forecast> {
  // Grovkorn til ~1 km FØR posisjonen legges i en URL. Hjemskjermen lastes
  // hver gang appen åpnes, og en URL med meterpresis GPS havner i
  // infrastrukturens forespørselslogg — over en sesong blir det et
  // bevegelsesspor vi ikke har bruk for. Ruta runder uansett selv til to
  // desimaler for cache-nøkkelen sin, og værdataene er regionale, så svaret
  // er identisk.
  const res = await fetch(`/api/mushroom-forecast?lat=${p.lat.toFixed(2)}&lon=${p.lng.toFixed(2)}`, {
    cache: 'no-store'
  });
  if (!res.ok) throw new Hentefeil('Prognosen', res.status);
  return (await res.json()) as Forecast;
}

/** Sendes på window én gang, når kortet først har data — andre flater (tilbudsarket) kan vente på den. */
// Én kilde for hendelsesnavnet: tilbudsarket lytter på det samme (provetilbud-venting.ts).
import { FORSIDEKORT_KLAR_EVENT } from '@/lib/billing/provetilbud-venting';
export { FORSIDEKORT_KLAR_EVENT };

// Tint the flush banner by status — green when ripe, amber when on the way,
// muted when dry/dormant. The flush title already carries its own emoji.
const FLUSH_TINT: Record<FlushStatus, string> = {
  fruiting: 'border-forest-200 bg-forest-50 text-forest-900',
  soon: 'border-amber-200 bg-amber-50 text-amber-900',
  building: 'border-amber-200 bg-amber-50 text-amber-900',
  dry: 'border-gray-200 bg-gray-50 text-gray-700',
  dormant: 'border-gray-200 bg-gray-50 text-gray-600'
};

/**
 * Grønt er kortets «dra nå» — samme farge som en feiret ring. Et 'fruiting'
 * med sesongkvalifiserte ord («men sent i sesongen», «men tidlig i sesongen»)
 * tegnes gult, som 'building' og 'soon': flush.ts kvalifiserer bare når dommen
 * over IKKE feirer, så ringen over er da alltid gul eller grå, og etter
 * 17. november kan den ikke bli grønn i det hele tatt. Et grønt banner ville
 * vært det eneste på skjermen som fortsatt sa «dra nå», under ord som sier
 * «sent, mindre å finne» og over «Det er stille i alle områdene nå». Gult er
 * appens «delvis» — det ordene sier. Statusen og tallene er de samme.
 */
export function flushTint(flush: { status: FlushStatus; shoulder?: 'early' | 'late' }): string {
  if (flush.status === 'fruiting' && flush.shoulder) return FLUSH_TINT.building;
  return FLUSH_TINT[flush.status];
}

// Tersklene og båndlogikken ligger i forecast-scale.ts, delt med
// PlaceForecastStrip. De var fire ulike sett på samme skjerm.
function colorFor(score: number, optimal: boolean): string {
  const band = forecastBand(score, optimal);
  return band === 'green' ? '#15803d' : band === 'amber' ? '#d97706' : '#9ca3af';
}

/**
 * "Soppforhold i dag" + 7-day trend on the home page. Calls /api/mushroom-forecast
 * and shows a color-coded score ring + verdict + the data-backed "why" for today,
 * plus a small bar chart of the days ahead.
 *
 * Hvor kortet regner, avgjøres FØR noe hentes (posisjon → henting → bruksdag):
 *   1. Husket posisjon fra kartet (husket-posisjon.ts) brukes med én gang.
 *   2. Er posisjonstilgang alt gitt, hentes en fersk, grov posisjon (≤ 4 s) gjennom
 *      Capacitor-laget — i iOS-skallet fantes ikke navigator.geolocation, så alle
 *      app-brukere sto på Oslo ved hver åpning. Kortet spør ALDRI selv; kartet gjør det.
 *   3. Ellers standardområdet for språket (Oslo / Stockholm), merket «omtrentlig».
 *   4. Bare en posisjon som en fersk måling fra DENNE åpningen bekrefter, er ferdig.
 *      Husket (kan være ei uke gammel; på Safari eller etter trukket tilgang kommer
 *      det aldri en fersk av seg selv) og standard får «Min posisjon», så den kan
 *      rettes her og ikke bare fra kartet (posisjon-visning.ts).
 * Bruksdagen (hjem, «egen»/«standard») skrives én gang, med den kilden som faktisk
 * ble vist først — aldri «standard» og så «egen» for samme åpning.
 *
 * Under dommen ligger «Følg området ditt» (FolgOmrade) — samme skille mellom
 * «egen» og «standard» avgjør om stripa navngir området eller spør hvor
 * brukeren plukker.
 */
export function MushroomDayCard({
  innlogget = false,
  /**
   * Serveren så alt en aktiv kontorad for soppvarselet. Da spør «Følg området
   * ditt»-stripa aldri — og den slipper å hente noe som helst.
   */
  folgerOmrade = false
}: {
  innlogget?: boolean;
  folgerOmrade?: boolean;
}) {
  const t = useTranslations('MushroomDayCard');
  const locale = useLocale();
  /** Posisjonen kortet ØNSKER å regne på. Det som vises, kan henge etter (se `viser`). */
  const [posisjon, setPosisjon] = useState<Posisjon | null>(null);
  /**
   * Det kortet sist viste. Står når prognosen for en NY posisjon er underveis,
   * og når den hentingen feiler — med sin egen posisjon, så etiketten følger
   * tallet og ikke ønsket.
   */
  const [sistVist, setSistVist] = useState<Vist | null>(null);
  /** Fersk måling fra denne monteringen (stille eller ved eget trykk) — bekrefter det som vises, eller ikke. */
  const [ferskFix, setFerskFix] = useState<{ lat: number; lng: number } | null>(null);
  /** Frosset ved første data: én hjem-rad per montering, med kilden kortet viste. */
  const [registrert, setRegistrert] = useState<Kilde | null>(null);
  const klarSendt = useRef(false);
  /** Dagen kortet ble åpnet. En ny åpning etter midnatt får ny nøkkel, og dermed nytt svar. */
  const [dag] = useState(() => utcDag(new Date()));

  // 1. Hvor? Se dokkommentaren over. Kjøres på nytt ved språkbytte, fordi
  // standardområdet følger språket — bruksdagen og hendelsen er alt frosset.
  useEffect(() => {
    let cancelled = false;
    const velg = async () => {
      const husket = lesHusketPosisjon();
      if (husket) setPosisjon({ lat: husket.lat, lng: husket.lng, kilde: 'egen' });
      const fersk = await getCurrentPositionIfGranted();
      if (cancelled) return;
      if (fersk) {
        lagreHusketPosisjon(fersk.latitude, fersk.longitude);
        setFerskFix({ lat: fersk.latitude, lng: fersk.longitude });
        // Samme ~1 km-rute som den huskede → samme forespørsel → ingen ny henting.
        if (husket && sammeRute(husket, { lat: fersk.latitude, lng: fersk.longitude })) return;
        setPosisjon({ lat: fersk.latitude, lng: fersk.longitude, kilde: 'egen' });
      } else if (!husket) {
        const std = standardPosisjon(locale);
        setPosisjon({ lat: std.lat, lng: std.lng, kilde: 'standard' });
      }
    };
    void velg();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  // 2. Hent prognosen for den valgte posisjonen — se «HENTINGEN» over.
  // networkMode 'always': standarden setter spørringen på VENT når nettleseren
  // har meldt «offline». Da ville «Sjekker soppforholdene …» stått så lenge
  // dekningen var borte. Slik feiler kallet som før, og kortet viser det det
  // har — eller ingenting.
  const sporring = useQuery({
    queryKey: posisjon ? prognoseNokkel(posisjon, locale, dag) : (['mushroom-forecast', 'uten-posisjon'] as const),
    queryFn: posisjon ? () => hentPrognose(posisjon) : skipToken,
    staleTime: PROGNOSE_FERSK_MS,
    gcTime: PROGNOSE_HUSKES_MS,
    // Nettverksfeil og 5xx: ett forsøk til. 4xx: aldri (hentefeil.ts).
    retry: (antallFeil, feil) => skalProveIgjen(antallFeil, feil, PROGNOSE_NYE_FORSOK),
    networkMode: 'always'
  });

  // En NY posisjon i SAMME rute: spørringen ser bare nøkkelen, og den er den
  // samme, så av seg selv gjør den ingenting. Før hentet kortet på nytt hver
  // gang posisjonen ble satt. To tilfeller der det fortsatt må skje:
  //  · forrige henting for ruta FEILET — ellers var et nytt trykk på «Min
  //    posisjon» etter en feil et dødt trykk;
  //  · svaret er eldre enn et kvarter (kortet har stått åpent lenge).
  // Er svaret ferskt, er det ingenting å hente: det er hele poenget med minnet.
  // Referansen sørger for at dette skjer ved posisjonsbyttet og aldri ellers —
  // en feil skal ikke selv sette i gang en ny henting. cancelRefetch: false:
  // går det alt en henting for ruta, er det den vi venter på.
  const hentingFeilet = sporring.isError;
  // «Gammelt» krever at det FINNES et svar: en rute uten svar henter
  // spørringen selv i det nøkkelen byttes.
  const svaretErGammelt = sporring.data !== undefined && sporring.isStale;
  const hentIgjen = sporring.refetch;
  const vurdertFor = useRef<Posisjon | null>(null);
  useEffect(() => {
    if (vurdertFor.current === posisjon) return;
    vurdertFor.current = posisjon;
    if (posisjon && (hentingFeilet || svaretErGammelt)) void hentIgjen({ cancelRefetch: false });
  }, [posisjon, hentingFeilet, svaretErGammelt, hentIgjen]);

  // Svaret for posisjonen kortet ønsker — finnes det, vises det, under sitt
  // eget sted. Spørringen svarer alltid for nøkkelen i DENNE tegningen, så et
  // tregt svar for det forrige stedet kan aldri havne under det nye navnet.
  const svarNaa: Vist | null = posisjon && sporring.data ? { prognose: sporring.data, posisjon } : null;
  // Husk det, så det står når neste henting er underveis eller feiler: feiler
  // en OPPFRISKING, blir det som alt vises stående; feiler den første
  // hentingen, er det ingenting å vise (som før). Satt under tegning — Reacts
  // eget mønster for tilstand som følger av andre verdier — så kortet aldri
  // tegnes tomt én gang mellom svaret og minnet om det.
  if (
    svarNaa &&
    (sistVist === null || sistVist.prognose !== svarNaa.prognose || sistVist.posisjon !== svarNaa.posisjon)
  ) {
    setSistVist(svarNaa);
  }
  // Frosset ved første data: kilden kortet viste FØRST, aldri «standard» og så «egen».
  if (svarNaa && registrert === null) {
    setRegistrert(svarNaa.posisjon.kilde);
  }
  const viser = svarNaa ?? sistVist;

  // «Kortet har data» — én gang per åpning. Tilbudsarket (ProvGratisVedStart)
  // står FØR kortet i treet og setter lytteren sin i sin egen mount-effekt, så
  // den er på plass også når svaret kommer rett fra minnet: denne effekten kan
  // tidligst kjøre etter at posisjonen er valgt, altså etter første tegning.
  const harData = viser !== null;
  useEffect(() => {
    if (!harData || klarSendt.current) return;
    klarSendt.current = true;
    window.dispatchEvent(new Event(FORSIDEKORT_KLAR_EVENT));
  }, [harData]);

  // Brukerens eget trykk — den ene gangen kortet får be om tillatelse, og da
  // gjennom Capacitor-laget så det virker i skallet også.
  const hentMinPosisjon = async () => {
    try {
      const pos = await getCurrentPositionOnce();
      lagreHusketPosisjon(pos.latitude, pos.longitude);
      setFerskFix({ lat: pos.latitude, lng: pos.longitude });
      setPosisjon({ lat: pos.latitude, lng: pos.longitude, kilde: 'egen' });
    } catch {
      // Avslått eller utilgjengelig: kortet blir stående på det det viser, som før.
    }
  };

  // Etiketten: bynavnet inne i et av områdene våre, «nærmeste område: Bergen, 35 km»
  // like utenfor, og bare den generelle teksten når ingen boks er i nærheten.
  const omradeEtikett = (p: Posisjon): string => {
    const naer = nearestRegion(p.lat, p.lng);
    if (naer?.inside) return naer.region.name;
    if (naer) return t('nearestArea', { name: naer.region.name, km: naer.distanceKm });
    return p.kilde === 'standard' ? t('defaultRegion') : t('yourPosition');
  };

  if (!viser) {
    // Ingenting å vise ennå. Venter kortet fortsatt på et svar — posisjonen er
    // ikke valgt, eller en henting går (det ene nye forsøket medregnet)?
    // isPending dekker også en ny åpning etter en feilet henting: spørringen
    // går tilbake til «venter» i det den prøver igjen, så plassen holdes av.
    if (posisjon === null || sporring.isPending) {
      // Reserve the loaded card's height so content below doesn't jump when the
      // forecast arrives (was the main layout-shift / CLS source on the home page).
      return (
        <div className="flex min-h-[15rem] items-center justify-center rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">
          {t('checkingConditions')}
        </div>
      );
    }
    // Weather unavailable → render nothing rather than a broken card.
    return null;
  }

  const data = viser.prognose;
  /** Posisjonen dataene på skjermen faktisk gjelder for (etiketten følger den, ikke ønsket). */
  const vist: Posisjon | null = viser.posisjon;
  const { today, days } = data;
  // Standard → «omtrentlig» + det store delingstilbudet. Alt en fersk måling fra
  // denne åpningen IKKE bekrefter (husket fra forrige uke, Safari uten Permissions
  // API, trukket tilgang) → den lille «Min posisjon»-lenka. Se posisjon-visning.ts.
  const { omtrentlig, kanRettes } = vist
    ? posisjonsVisning(vist, ferskFix)
    : { omtrentlig: false, kanRettes: false };
  const areaLabel = vist ? omradeEtikett(vist) : '';
  // Området stripa har lov til å navngi: bare når kortet regner på brukerens
  // EGEN posisjon, og bare når den ligger i eller inntil et område vi dekker
  // (nearestRegion gir null over 60 km). Standardområdet navngis aldri.
  const folgbartOmrade =
    vist && vist.kilde === 'egen' ? (nearestRegion(vist.lat, vist.lng)?.region.name ?? null) : null;
  // Regnes over hele uka før noe tegnes — se forecast-bars.ts.
  const barHeights = forecastBarHeights(days.map((d) => d.score));
  const color = colorFor(today.score, today.optimal);
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - today.score / 100);
  // Desember–mai: dommen over og flush-banneret er samme tekst. Vis den én
  // gang, og bruk plassen på veien videre — se utenom-sesong-flush.ts.
  const utenomSesong = erUtenomSesongFlush(data.flush, today.title);

  return (
    <article className="min-h-[15rem] rounded-xl bg-white p-4 shadow-sm">
      {/* «Så soppforholdene i dag» — først her, når kortet faktisk viser noe (migrasjon 064),
          og med kilden det viste først: «egen» eller «standard» (bruksdag.ts). */}
      {registrert ? <RegistrerBruksdag flate="hjem" omrade={registrert} /> : null}
      <div className="flex items-center gap-4">
        <svg
          viewBox="0 0 110 110"
          className="h-24 w-24 shrink-0"
          role="img"
          aria-label={t('ringLabel', { score: today.score })}
        >
          <circle cx="55" cy="55" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
          <circle
            cx="55"
            cy="55"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 55 55)"
          />
          <text x="55" y="52" textAnchor="middle" fontSize="26" fontWeight="700" fill={color}>
            {today.score}
          </text>
          <text x="55" y="70" textAnchor="middle" fontSize="10" fill="#6b7280">
            {t('outOf100')}
          </text>
        </svg>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-forest-900">{today.title}</h2>
          <p className="mt-0.5 text-sm text-gray-700">{today.message}</p>
          {today.reasons.length > 0 ? (
            <ul className="mt-2 space-y-0.5">
              {today.reasons.slice(0, 2).map((reason, i) => (
                <li key={i} className="truncate text-xs text-gray-600">
                  ✓ {reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {/* Rett under dommen, inne i kortet — aldri et sprettoppvindu. Stripa
          avgjør selv om den skal vises (folg-omrade.ts) og henter ingenting når
          den ikke kan. */}
      <FolgOmrade
        innlogget={innlogget}
        folgerAlt={folgerOmrade}
        posisjonsKilde={vist?.kilde ?? 'standard'}
        omrade={folgbartOmrade}
      />

      {utenomSesong ? (
        // Ingen ny påstand om funn: bare hvor appen faktisk har noe å vise nå —
        // kalenderen (artene som har sesong om vinteren og våren) og, for
        // innloggede, stedene fra deres egen sesong.
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
          <Link href="/calendar" className="font-medium text-forest-800 hover:underline">
            {t('offSeasonCalendar')} →
          </Link>
          {innlogget ? (
            <Link href="/mine-steder" className="font-medium text-forest-800 hover:underline">
              {t('offSeasonMyPlaces')} →
            </Link>
          ) : null}
        </div>
      ) : data.flush ? (
        <div className={`mt-3 rounded-xl border px-3 py-2 ${flushTint(data.flush)}`}>
          <p className="text-sm font-semibold">{data.flush.title}</p>
          <p className="mt-0.5 text-xs opacity-90">{data.flush.message}</p>
        </div>
      ) : null}

      {data.hasForecast && days.length > 1 ? (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="mb-1.5 text-xs font-medium text-gray-500">{t('outlookAhead')}</p>
          <div className="flex h-16 items-end justify-between gap-1.5">
            {days.map((d, i) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.score}/100`}>
                <div className="flex h-12 w-full items-end">
                  {/* Høyden er relativ til UKA, ikke til 0–100. Se
                      forecast-bars.ts: spennet innenfor én uke har median 17
                      poeng, som på den gamle absolutte skalaen ble 8 piksler i
                      en 48 px-boks — usynlig. Fargen er fortsatt absolutt. */}
                  <div
                    className="w-full rounded-t"
                    style={{ height: `${barHeights[i]}%`, backgroundColor: colorFor(d.score, d.optimal) }}
                  />
                </div>
                <span className={`text-[9px] ${d.isToday ? 'font-semibold text-forest-900' : 'text-gray-500'}`}>
                  {d.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Without a position the whole card is regional. Say so plainly and make
          the offer, rather than showing a default region that reads as local.
          Deliberately NOT a prompt on load — the user taps if they want it. */}
      {omtrentlig ? (
        <button
          type="button"
          onClick={() => void hentMinPosisjon()}
          className="mt-3 flex w-full items-start gap-2 rounded-xl border border-forest-200 bg-forest-50/60 px-3 py-2 text-left transition hover:bg-forest-50"
        >
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
          <span className="text-xs leading-relaxed text-forest-900">
            <span className="font-semibold">{t('sharePositionTitle')}</span>{' '}
            <span className="text-forest-800">{t('sharePositionBody', { area: areaLabel })}</span>
          </span>
        </button>
      ) : null}

      {/* The map computes a different quantity on the same 0-100 face — this is
          the line that stops the two from reading as a contradiction. */}
      <p className="mt-3 border-t border-gray-100 pt-2.5 text-[11px] leading-relaxed text-gray-500">
        {t('scaleNote')}
      </p>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-gray-500">
          📍 {areaLabel}
          {omtrentlig ? <span className="text-gray-600"> · {t('approximate')}</span> : null}
        </span>
        <div className="flex items-center gap-3">
          {/* Også for en husket posisjon: den kan være gammel, og uten lenka her var
              kartet eneste vei til å rette den. */}
          {kanRettes ? (
            <button
              type="button"
              onClick={() => void hentMinPosisjon()}
              className="inline-flex items-center gap-1 font-medium text-forest-800 hover:underline"
            >
              <MapPin className="h-3 w-3" /> {t('myPosition')}
            </button>
          ) : null}
          <Link href="/map" className="font-medium text-forest-800 hover:underline">
            {t('seeMap')}
          </Link>
        </div>
      </div>
    </article>
  );
}
