'use client';

import { RegistrerBruksdag } from '@/components/bruk/RegistrerBruksdag';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
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

/** Sendes på window én gang, når kortet først har data — andre flater (tilbudsarket) kan vente på den. */
export const FORSIDEKORT_KLAR_EVENT = 'mycelet:forsidekort-klar';

// Tint the flush banner by status — green when ripe, amber when on the way,
// muted when dry/dormant. The flush title already carries its own emoji.
const FLUSH_TINT: Record<FlushStatus, string> = {
  fruiting: 'border-forest-200 bg-forest-50 text-forest-900',
  soon: 'border-amber-200 bg-amber-50 text-amber-900',
  building: 'border-amber-200 bg-amber-50 text-amber-900',
  dry: 'border-gray-200 bg-gray-50 text-gray-700',
  dormant: 'border-gray-200 bg-gray-50 text-gray-600'
};

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
 */
export function MushroomDayCard() {
  const t = useTranslations('MushroomDayCard');
  const locale = useLocale();
  const [data, setData] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [posisjon, setPosisjon] = useState<Posisjon | null>(null);
  /** Posisjonen dataene på skjermen faktisk gjelder for (etiketten følger den, ikke ønsket). */
  const [vist, setVist] = useState<Posisjon | null>(null);
  /** Fersk måling fra denne monteringen (stille eller ved eget trykk) — bekrefter det som vises, eller ikke. */
  const [ferskFix, setFerskFix] = useState<{ lat: number; lng: number } | null>(null);
  /** Frosset ved første data: én hjem-rad per montering, med kilden kortet viste. */
  const [registrert, setRegistrert] = useState<Kilde | null>(null);
  const klarSendt = useRef(false);

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

  // 2. Hent prognosen for den valgte posisjonen. Bytter posisjonen mens en
  // henting pågår, forkastes det gamle svaret (cancelled) — det huskede og det
  // ferske kappløpet skal ikke ende med feil etikett på riktig tall.
  useEffect(() => {
    if (!posisjon) return;
    let cancelled = false;
    const hent = async () => {
      setLoading(true);
      try {
        // Grovkorn til ~1 km FØR posisjonen legges i en URL. Hjemskjermen lastes
        // hver gang appen åpnes, og en URL med meterpresis GPS havner i
        // infrastrukturens forespørselslogg — over en sesong blir det et
        // bevegelsesspor vi ikke har bruk for. Ruta runder uansett selv til to
        // desimaler for cache-nøkkelen sin, og værdataene er regionale, så svaret
        // er identisk.
        const res = await fetch(
          `/api/mushroom-forecast?lat=${posisjon.lat.toFixed(2)}&lon=${posisjon.lng.toFixed(2)}`,
          { cache: 'no-store' }
        );
        const neste = res.ok ? ((await res.json()) as Forecast) : null;
        if (cancelled) return;
        // Feiler en OPPFRISKING, blir det som alt vises stående; feiler den
        // første hentingen, er det ingenting å vise (som før).
        setData((forrige) => neste ?? forrige);
        if (neste) {
          setVist(posisjon);
          setRegistrert((forrige) => forrige ?? posisjon.kilde);
          if (!klarSendt.current) {
            klarSendt.current = true;
            window.dispatchEvent(new Event(FORSIDEKORT_KLAR_EVENT));
          }
        }
      } catch {
        // Nett nede: samme regel som over — behold det som vises, ellers ingenting.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void hent();
    return () => {
      cancelled = true;
    };
  }, [posisjon]);

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

  if (loading && !data) {
    // Reserve the loaded card's height so content below doesn't jump when the
    // forecast arrives (was the main layout-shift / CLS source on the home page).
    return (
      <div className="flex min-h-[15rem] items-center justify-center rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">
        {t('checkingConditions')}
      </div>
    );
  }
  // Weather unavailable → render nothing rather than a broken card.
  if (!data) return null;

  const { today, days } = data;
  // Standard → «omtrentlig» + det store delingstilbudet. Alt en fersk måling fra
  // denne åpningen IKKE bekrefter (husket fra forrige uke, Safari uten Permissions
  // API, trukket tilgang) → den lille «Min posisjon»-lenka. Se posisjon-visning.ts.
  const { omtrentlig, kanRettes } = vist
    ? posisjonsVisning(vist, ferskFix)
    : { omtrentlig: false, kanRettes: false };
  const areaLabel = vist ? omradeEtikett(vist) : '';
  // Regnes over hele uka før noe tegnes — se forecast-bars.ts.
  const barHeights = forecastBarHeights(days.map((d) => d.score));
  const color = colorFor(today.score, today.optimal);
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - today.score / 100);

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

      {data.flush ? (
        <div className={`mt-3 rounded-xl border px-3 py-2 ${FLUSH_TINT[data.flush.status]}`}>
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
          {omtrentlig ? <span className="text-gray-400"> · {t('approximate')}</span> : null}
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
