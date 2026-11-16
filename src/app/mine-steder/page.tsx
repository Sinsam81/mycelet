import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Camera, ExternalLink, Lock, Map as MapIcon, MapPin } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { createClient } from '@/lib/supabase/server';
import { intlLocale } from '@/lib/utils/intl-locale';
import { MyPlacesFilter } from '@/components/places/MyPlacesFilter';
import { GpxEksportKnapp } from '@/components/places/GpxEksportKnapp';
import { StedetsFunn } from '@/components/places/StedetsFunn';
import { NyligSlettet, type SlettetFunn } from '@/components/places/NyligSlettet';
import { RegistrerBruksdag } from '@/components/bruk/RegistrerBruksdag';
import { dagerTilRydding } from '@/lib/findings/mine-funn';
import { groupFindings, speciesName, type FindingRow, type JoinedSpecies } from '@/lib/findings/steder';
import { timeZoneForLocale } from '@/i18n/config';
// Angrefristen har ÉN kilde: ryddejobben som faktisk fjerner funnene. Lista
// under regner dagene som står igjen av samme tall, så de to ikke kan drive.
import { PURGE_AFTER_DAYS } from '@/app/api/cron/purge-deleted-findings/route';
import { isUuid } from '@/app/api/findings/[id]/soft-delete';
import { privatSide } from '@/lib/seo/side-titler';

export async function generateMetadata() {
  const t = await getTranslations('MineSteder');
  return privatSide(t('metaTitle'));
}

/**
 * "Mine steder" — the user's own finds grouped by place. This is the secret-
 * spots vault: it reads the user's OWN findings (all visibilities) via RLS,
 * so nothing here is ever visible to anyone else. Groups by location_name
 * when present, else by a ~1 km coordinate bucket (src/lib/findings/steder.ts).
 *
 * Each place card opens into the finds behind it, where the owner can change
 * the sharing level, edit the note or delete the find (PATCH/DELETE
 * /api/findings/:id). Deleted finds stay listed at the bottom for the whole
 * undo window. The page itself only reads — every write goes through those
 * routes, on a click.
 */

interface DeletedRow {
  id: string;
  location_name: string | null;
  found_at: string;
  deleted_at: string;
  species_name_override: string | null;
  mushroom_species: JoinedSpecies;
}

/**
 * Så mange slettede funn vises. Nok for de aller fleste; den som har ryddet
 * bort flere i løpet av angrefristen, får vite at lista er kortet ned.
 */
const DELETED_LIMIT = 100;

export default async function MineStederPage({
  searchParams
}: {
  /**
   * `?funn=<id>`: kartets popup sender eieren hit for å endre deling eller
   * notat. Stedet med funnet åpnes, og funnet markeres. Bare en id — aldri en
   * posisjon — og den brukes bare til å velge blant radene RLS alt har gitt.
   */
  searchParams: Promise<{ funn?: string | string[] }>;
}) {
  const t = await getTranslations('MineSteder');
  const { funn: funnParam } = await searchParams;
  const apneFunnId = typeof funnParam === 'string' && isUuid(funnParam) ? funnParam.toLowerCase() : null;
  const locale = await getLocale();
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?redirect=/mine-steder');

  const [{ data, error }, { data: deletedData, error: deletedError }] = await Promise.all([
    supabase
      .from('findings')
      .select(
        'id, location_name, latitude, longitude, found_at, image_url, visibility, is_zone_finding, zone_label, zone_precision_km, notes, created_at, updated_at, species_name_override, mushroom_species(norwegian_name,swedish_name)'
      )
      .eq('user_id', user.id)
      .eq('is_negative_observation', false)
      // Funn brukeren har slettet (migrasjon 056) skal ikke telles eller stå
      // blant stedene. De hentes for seg under, til «Nylig slettet».
      .is('deleted_at', null)
      .order('found_at', { ascending: false })
      .limit(1000),
    // Slettede funn ligger i PURGE_AFTER_DAYS dager før ryddejobben fjerner
    // dem. Eier-RLS («Brukere kan lese egne funn») ser ikke på deleted_at, så
    // samme sesjonsklient leser dem. Ingen koordinater: lista trenger dem ikke.
    supabase
      .from('findings')
      .select('id, location_name, found_at, deleted_at, species_name_override, mushroom_species(norwegian_name,swedish_name)')
      .eq('user_id', user.id)
      .eq('is_negative_observation', false)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      // Én rad for mye: slik vet vi om lista er kortet ned, uten et eget tellekall.
      .limit(DELETED_LIMIT + 1)
  ]);

  // Serveren står i UTC. Et funn gjort 00:30 norsk tid skal ikke få gårsdagens dato.
  const foundDate = (iso: string) =>
    new Date(iso).toLocaleDateString(intlLocale(locale), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: timeZoneForLocale(locale)
    });
  const nowMs = new Date().getTime();

  const spots = groupFindings((data ?? []) as unknown as FindingRow[], {
    unknownSpecies: t('unknownSpecies'),
    nearPlace: (lat, lng) => t('nearPlace', { lat, lng }),
    foundDate
  }, locale, nowMs);
  const totalFinds = spots.reduce((sum, s) => sum + s.count, 0);

  const deletedRows = (deletedData ?? []) as unknown as DeletedRow[];
  const recentlyDeleted: SlettetFunn[] = deletedRows.slice(0, DELETED_LIMIT).map((row) => ({
    id: row.id,
    artsnavn: speciesName(row, t('unknownSpecies'), locale),
    sted: row.location_name?.trim() || null,
    funnetTekst: foundDate(row.found_at),
    slettetTid: row.deleted_at,
    dagerIgjen: dagerTilRydding(row.deleted_at, nowMs, PURGE_AFTER_DAYS)
  }));

  return (
    <PageWrapper>
      {/* «Kommer de tilbake til skogen sin?» — bruksflate «steder» (migrasjon 066). */}
      <RegistrerBruksdag flate="steder" />
      <section className="space-y-4">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-forest-700">{t('onlyVisibleToYou')}</p>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-forest-900">{t('heading')}</h1>
          <p className="mt-1 text-sm text-gray-700">
            {t('intro')} {totalFinds > 0 ? t('summary', { finds: totalFinds, places: spots.length }) : ''}
          </p>
          {/* Egne funn ut som GPX-veipunkter (Garmin, UT.no, Organic Maps),
              generert av /api/me/gpx. Gratis med vilje: dette er brukerens
              egne data, og å ta betalt for å få dem UT ville stått i mot både
              GDPR-eksport-presedensen og ærlighets-merkevaren. */}
          {totalFinds > 0 ? (
            <div className="mt-3">
              <GpxEksportKnapp antall={totalFinds} />
            </div>
          ) : null}
          {/* Historikken er nabosida: det som ennå ikke er blitt et sted. */}
          <Link href="/identifiseringer" className="mt-3 inline-block text-xs font-semibold text-forest-800 underline">
            🔍 {t('identificationsLink')} →
          </Link>
        </header>

        {/* Tom er ikke det samme som feilet. Ved en forbigående spørrefeil
            (RLS-endring, pool-metning, timeout) rendret siden tidligere
            tom-tilstanden med «du har ikke lagret noen steder ennå» — for en
            betalende bruker hvis eneste grunn til å betale ER de lagrede
            stedene, ser det ut som at dataene er slettet. */}
        {error ? (
          <article className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
            <h2 className="font-serif text-lg font-semibold text-amber-900">{t('loadErrorHeading')}</h2>
            <p className="mt-1 text-sm text-amber-900">{t('loadErrorBody')}</p>
          </article>
        ) : spots.length === 0 ? (
          <article className="rounded-2xl bg-white p-6 text-center shadow-card">
            <p className="text-4xl">🍄</p>
            <h2 className="mt-2 font-serif text-xl font-semibold text-forest-900">{t('emptyHeading')}</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-700">
              {t('emptyBody')}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link
                href="/identify"
                className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-700"
              >
                <Camera className="h-4 w-4" /> {t('identifyFinding')}
              </Link>
              <Link
                href="/map"
                className="inline-flex items-center gap-1.5 rounded-full border border-forest-300 bg-white px-4 py-2 text-sm font-semibold text-forest-900 hover:bg-forest-50"
              >
                <MapIcon className="h-4 w-4" /> {t('logOnMap')}
              </Link>
            </div>
          </article>
        ) : (
          <MyPlacesFilter
            places={spots.map((s) => ({
              key: s.key,
              label: s.label,
              species: [...s.species.keys()],
              count: s.count,
              lastVisit: s.lastVisit
            }))}
          >
            {spots.map((spot, index) => {
              // Knytter «Vis funnene» til stedsnavnet for skjermlesere.
              const headingId = `sted-${index}`;
              const topSpecies = [...spot.species.entries()].sort((a, b) => b[1] - a[1]);
              const shown = topSpecies.slice(0, 4);
              const more = topSpecies.length - shown.length;
              const years = [...spot.years].sort((a, b) => b - a);
              return (
                <li key={spot.key} className="overflow-hidden rounded-2xl bg-white shadow-card">
                  <div className="flex">
                    {spot.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={spot.thumb} alt="" className="h-auto w-24 shrink-0 object-cover" />
                    ) : null}
                    <div className="min-w-0 flex-1 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h2
                          id={headingId}
                          className="flex min-w-0 items-center gap-1.5 font-serif text-lg font-semibold leading-tight text-forest-950"
                        >
                          <MapPin className="h-4 w-4 shrink-0 text-forest-700" />
                          <span className="truncate">{spot.label}</span>
                        </h2>
                        {spot.allPrivate ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-forest-100 px-2 py-0.5 text-[11px] font-semibold text-forest-900">
                            <Lock className="h-3 w-3" /> {t('secretPlace')}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-600">
                        {t('cardStats', { finds: spot.count, species: spot.species.size })}{' '}
                        {foundDate(spot.lastVisit)}
                        {years.length > 1 ? t('cardSeasons', { seasons: years.length, first: years[years.length - 1], last: years[0] }) : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {shown.map(([name, n]) => (
                          <span key={name} className="rounded-full bg-forest-50 px-2 py-0.5 text-[11px] font-medium text-forest-900">
                            {name}
                            {n > 1 ? ` ×${n}` : ''}
                          </span>
                        ))}
                        {more > 0 ? <span className="px-1 py-0.5 text-[11px] text-gray-500">{t('moreSpecies', { count: more })}</span> : null}
                      </div>
                      {/* Hovedhandlingen holder brukeren i Mycelet: kartet åpner på stedet
                          med dagens forhold (værstripa) og egne funn synlige (mine=1). Google
                          er veibeskrivelsen, ikke stedet. */}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                        <Link
                          href={`/map?lat=${spot.lat.toFixed(5)}&lng=${spot.lng.toFixed(5)}&zoom=14&sted=${encodeURIComponent(spot.label)}&mine=1`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-forest-800 underline"
                        >
                          <MapPin className="h-3 w-3" /> {t('seeConditionsHere')}
                        </Link>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${spot.lat.toFixed(5)},${spot.lng.toFixed(5)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 underline"
                        >
                          <ExternalLink className="h-3 w-3" /> {t('navigateThere')}
                        </a>
                      </div>
                    </div>
                  </div>
                  {/* Funnene bak kortet: endre deling, endre notat, slett.
                      Rendres først når kortet åpnes. */}
                  <StedetsFunn
                    funn={spot.finds}
                    angrefristDager={PURGE_AFTER_DAYS}
                    stedId={headingId}
                    apneFunnId={apneFunnId}
                  />
                </li>
              );
            })}
          </MyPlacesFilter>
        )}

        {/* Hele angrefristen, synlig. Står også når lista over er tom — den
            som slettet sitt eneste funn ved et feilklikk, skal finne det her.
            Feilet hovedspørringen, sier kortet over allerede fra. */}
        {recentlyDeleted.length > 0 ? (
          <NyligSlettet
            funn={recentlyDeleted}
            angrefristDager={PURGE_AFTER_DAYS}
            avkortet={deletedRows.length > DELETED_LIMIT}
          />
        ) : deletedError && !error ? (
          <p className="rounded-2xl bg-white p-4 text-sm text-gray-700 shadow-card">{t('recentlyDeletedLoadError')}</p>
        ) : null}

        <p className="text-xs text-gray-500">
          🔒 {t('privacyNote')}
        </p>
      </section>
    </PageWrapper>
  );
}
