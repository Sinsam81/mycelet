import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ChevronLeft } from 'lucide-react';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { SpeciesPhotoCarousel } from '@/components/species/SpeciesPhotoCarousel';
import { createClient } from '@/lib/supabase/server';

interface SpeciesDetailPageProps {
  params: Promise<{ id: string }>;
}

const MONTH_NAMES = [
  'jan', 'feb', 'mar', 'apr', 'mai', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'des'
];

function formatSeason(start: number, end: number): string {
  const s = MONTH_NAMES[start - 1];
  const e = MONTH_NAMES[end - 1];
  if (!s || !e) return '—';
  return start === end ? s : `${s} – ${e}`;
}

const DANGER_LABELS: Record<string, string> = {
  low: 'Lav',
  medium: 'Middels',
  high: 'Høy',
  critical: 'Kritisk'
};

const DANGER_STYLES: Record<string, string> = {
  low: 'bg-gray-100 text-gray-800',
  medium: 'bg-yellow-100 text-yellow-900',
  high: 'bg-orange-100 text-orange-900',
  critical: 'bg-red-700 text-white'
};

export default async function SpeciesDetailPage({ params }: SpeciesDetailPageProps) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (Number.isNaN(id)) notFound();

  const supabase = createClient();

  const [{ data: species, error: speciesError }, { data: photos }, { data: lookAlikes }] = await Promise.all([
    supabase
      .from('mushroom_species')
      .select('*')
      .eq('id', id)
      .single(),
    supabase
      .from('species_photos')
      .select('id,image_url,thumbnail_url,caption,is_primary')
      .eq('species_id', id)
      .order('is_primary', { ascending: false }),
    supabase
      .from('look_alikes')
      .select(
        'look_alike_id,danger_level,similarity_description,difference_description,' +
          'mushroom_species!look_alikes_look_alike_id_fkey(id,norwegian_name,latin_name,edibility,primary_image_url)'
      )
      .eq('species_id', id)
      .limit(6)
  ]);

  if (speciesError || !species) {
    notFound();
  }

  const isToxic = species.edibility === 'toxic' || species.edibility === 'deadly';

  return (
    <PageWrapper wide>
      <section className="space-y-6">
        <Link
          href="/species"
          className="inline-flex items-center gap-1 text-sm font-medium text-forest-700 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />
          Tilbake til biblioteket
        </Link>

        <div className="grid gap-6 md:grid-cols-2 md:items-start lg:gap-10">
          {/* Left: photo carousel */}
          <SpeciesPhotoCarousel photos={photos ?? []} speciesName={species.norwegian_name} />

          {/* Right: content */}
          <div className="space-y-5">
            <header className="space-y-2">
              <h1 className="font-serif text-4xl font-bold leading-tight text-forest-900">
                {species.norwegian_name}
              </h1>
              <p className="text-base italic text-gray-600">{species.latin_name}</p>
              {(species.swedish_name || species.english_name) ? (
                <div className="flex flex-wrap gap-x-4 text-xs text-gray-500">
                  {species.swedish_name ? <span>🇸🇪 {species.swedish_name}</span> : null}
                  {species.english_name ? <span>🇬🇧 {species.english_name}</span> : null}
                </div>
              ) : null}
              <div className="pt-1">
                <EdibilityBadge edibility={species.edibility} />
              </div>
            </header>

            {isToxic ? (
              <div
                className={`rounded-xl p-4 ${
                  species.edibility === 'deadly'
                    ? 'bg-red-900 text-white'
                    : 'border-2 border-red-600 bg-red-50 text-red-900'
                }`}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-6 w-6 shrink-0" />
                  <div className="space-y-1.5">
                    <p className="text-base font-bold uppercase tracking-wide">
                      {species.edibility === 'deadly' ? 'Dødelig giftig — ikke spis' : 'Giftig — ikke spis'}
                    </p>
                    {species.toxin_info ? (
                      <p className="text-sm">
                        <span className="font-semibold">Toksin:</span> {species.toxin_info}
                      </p>
                    ) : null}
                    {species.symptoms ? (
                      <p className="text-sm">
                        <span className="font-semibold">Symptomer:</span> {species.symptoms}
                      </p>
                    ) : null}
                    <p className="pt-1 text-sm font-medium">
                      Ved svelging — ring Giftinformasjonen{' '}
                      <a
                        href="tel:+4722591300"
                        className={`underline ${species.edibility === 'deadly' ? 'text-white' : 'text-red-900'}`}
                      >
                        22 59 13 00
                      </a>{' '}
                      umiddelbart.
                    </p>
                    <Link
                      href="/sikkerhet"
                      className={`inline-block pt-1 text-xs underline ${
                        species.edibility === 'deadly' ? 'text-white/90' : 'text-red-800'
                      }`}
                    >
                      Mer om sikkerhet og soppkontroll →
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}

            {species.edibility === 'conditionally_edible' && species.edibility_notes ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />
                  <div>
                    <p className="font-semibold text-amber-900">Betinget spiselig — krever tilberedning</p>
                    <p className="mt-1 text-sm text-amber-900">{species.edibility_notes}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {species.description ? (
              <p className="text-base leading-relaxed text-gray-800">{species.description}</p>
            ) : null}

            <dl className="space-y-0 border-t border-gray-200 pt-4 text-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-forest-700">Detaljer</p>
              <div className="flex justify-between border-b border-gray-100 py-2">
                <dt className="text-gray-600">Sesong</dt>
                <dd className="font-medium text-gray-900">{formatSeason(species.season_start, species.season_end)}</dd>
              </div>
              <div className="flex justify-between border-b border-gray-100 py-2">
                <dt className="text-gray-600">Habitat</dt>
                <dd className="font-medium text-gray-900 text-right">
                  {(species.habitat ?? []).join(', ') || '—'}
                </dd>
              </div>
              {species.swedish_name ? (
                <div className="flex justify-between border-b border-gray-100 py-2">
                  <dt className="text-gray-600">Svensk navn</dt>
                  <dd className="font-medium text-gray-900">{species.swedish_name}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>

        {/* Look-alikes section */}
        {(lookAlikes?.length ?? 0) > 0 ? (
          <article className="space-y-4 rounded-xl bg-white p-5 shadow-sm md:p-6">
            <header>
              <p className="text-xs font-semibold uppercase tracking-widest text-forest-700">
                Forveksling og nærarter
              </p>
              <h2 className="font-serif text-2xl font-bold text-forest-900">Se også</h2>
            </header>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(lookAlikes ?? []).map((item: any) => {
                const lookAlike = item.mushroom_species;
                if (!lookAlike) return null;
                const danger = item.danger_level ?? 'low';

                return (
                  <Link
                    key={item.look_alike_id}
                    href={`/species/${lookAlike.id}`}
                    className="group block overflow-hidden rounded-lg border border-gray-200 bg-white transition hover:border-forest-300 hover:shadow-md"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
                      {lookAlike.primary_image_url ? (
                        <img
                          src={lookAlike.primary_image_url}
                          alt={lookAlike.norwegian_name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                          Ingen bilde
                        </div>
                      )}
                      <span
                        className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-semibold shadow-sm ${
                          DANGER_STYLES[danger] ?? DANGER_STYLES.low
                        }`}
                      >
                        Fare: {DANGER_LABELS[danger] ?? danger}
                      </span>
                    </div>

                    <div className="space-y-2 p-3">
                      <div>
                        <p className="font-serif text-base font-bold text-forest-900">{lookAlike.norwegian_name}</p>
                        <p className="text-xs italic text-gray-600">{lookAlike.latin_name}</p>
                      </div>
                      <EdibilityBadge edibility={lookAlike.edibility} />
                      {item.difference_description ? (
                        <p className="text-xs text-gray-700">
                          <span className="font-semibold">Hvordan skille:</span> {item.difference_description}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          </article>
        ) : null}
      </section>
    </PageWrapper>
  );
}
