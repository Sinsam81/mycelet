import { notFound } from 'next/navigation';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { createClient } from '@/lib/supabase/server';

interface SpeciesDetailPageProps {
  params: { id: string };
}

export default async function SpeciesDetailPage({ params }: SpeciesDetailPageProps) {
  const id = Number(params.id);
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
      .select('look_alike_id,danger_level,similarity_description,difference_description,mushroom_species!look_alikes_look_alike_id_fkey(norwegian_name,latin_name,edibility)')
      .eq('species_id', id)
      .limit(6)
  ]);

  if (speciesError || !species) {
    notFound();
  }

  const primaryPhoto = photos?.[0]?.image_url;

  return (
    <PageWrapper>
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{species.norwegian_name}</h1>
          <p className="italic text-gray-600">{species.latin_name}</p>
        </div>

        <EdibilityBadge edibility={species.edibility} />

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="h-52 bg-gray-100">
            {primaryPhoto ? (
              <img src={primaryPhoto} alt={species.norwegian_name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">Ingen bilder</div>
            )}
          </div>
        </div>

        <article className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Beskrivelse</h2>
          <p className="text-sm text-gray-800">{species.description ?? 'Ingen beskrivelse ennå.'}</p>
        </article>

        <article className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Sesong</h2>
          <p className="text-sm text-gray-800">
            {species.season_start} - {species.season_end}
          </p>
        </article>

        <article className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Habitat</h2>
          <p className="text-sm text-gray-800">{(species.habitat ?? []).join(', ') || 'Ikke oppgitt'}</p>
        </article>

        <article className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Forvekslingsarter</h2>
          <div className="space-y-2">
            {(lookAlikes ?? []).map((item: any) => {
              const lookAlike = item.mushroom_species;
              if (!lookAlike) return null;

              const dangerLabel: Record<string, string> = {
                low: 'Lav',
                medium: 'Middels',
                high: 'Høy',
                critical: 'Kritisk'
              };
              const dangerStyle: Record<string, string> = {
                low: 'bg-gray-100 text-gray-800',
                medium: 'bg-yellow-100 text-yellow-900',
                high: 'bg-orange-100 text-orange-900',
                critical: 'bg-red-100 text-red-900'
              };
              const danger = item.danger_level ?? 'low';

              return (
                <div key={item.look_alike_id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-gray-900">{lookAlike.norwegian_name}</p>
                      <p className="text-sm italic text-gray-600">{lookAlike.latin_name}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${dangerStyle[danger] ?? dangerStyle.low}`}>
                      {dangerLabel[danger] ?? danger}
                    </span>
                  </div>
                  {item.similarity_description ? (
                    <p className="mt-2 text-sm text-gray-800"><span className="font-medium">Likhet:</span> {item.similarity_description}</p>
                  ) : null}
                  {item.difference_description ? (
                    <p className="mt-1 text-sm text-gray-800"><span className="font-medium">Hvordan skille:</span> {item.difference_description}</p>
                  ) : null}
                </div>
              );
            })}
            {(lookAlikes?.length ?? 0) === 0 ? <p className="text-sm text-gray-700">Ingen registrerte forvekslingsarter.</p> : null}
          </div>
        </article>
      </section>
    </PageWrapper>
  );
}
