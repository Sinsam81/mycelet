'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { Button } from '@/components/ui/Button';
import { useCreatePost, useMyFindings } from '@/lib/hooks/useForum';
import { createClient } from '@/lib/supabase/client';

type Category = 'find' | 'question' | 'tip' | 'discussion';

const categoryOptions: Array<{ label: string; value: Category }> = [
  { label: 'Funn', value: 'find' },
  { label: 'Spørsmål', value: 'question' },
  { label: 'Tips', value: 'tip' },
  { label: 'Diskusjon', value: 'discussion' }
];

export default function NewForumPostPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const createPost = useCreatePost();
  const { data: findingOptions } = useMyFindings();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<Category>('find');
  const [findingId, setFindingId] = useState<string>(() => searchParams.get('findingId') ?? '');
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  const uploadForumImage = async (file: File) => {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) throw new Error('Du må være logget inn');

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage.from('forum-images').upload(path, file, { upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const {
      data: { publicUrl }
    } = supabase.storage.from('forum-images').getPublicUrl(path);

    return publicUrl;
  };

  const onSelectImages = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []).slice(0, 4);
    previews.forEach((url) => URL.revokeObjectURL(url));
    setImages(selected);
    setPreviews(selected.map((file) => URL.createObjectURL(file)));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!title.trim() || !content.trim()) {
      setError('Tittel og innhold er påkrevd.');
      return;
    }

    try {
      const uploadedUrls = await Promise.all(images.map(uploadForumImage));
      const mappedImages = uploadedUrls.map((url) => ({ url }));

      const post = await createPost.mutateAsync({
        title: title.trim(),
        content: content.trim(),
        category,
        findingId: findingId || null,
        images: mappedImages
      });

      router.push(`/forum/${post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke publisere innlegg.');
    }
  };

  return (
    <PageWrapper>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">Nytt innlegg</h1>

        <form className="space-y-3 rounded-xl bg-white p-4 shadow-sm" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-gray-800">
            Tittel
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>

          <label className="block text-sm font-medium text-gray-800">
            Kategori
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={category}
              onChange={(event) => setCategory(event.target.value as Category)}
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-gray-800">
            Innhold
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              rows={5}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              required
            />
          </label>

          <label className="block text-sm font-medium text-gray-800">
            Bilder (opptil 4)
            <input type="file" accept="image/*" multiple className="mt-1 w-full" onChange={onSelectImages} />
          </label>

          {previews.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {previews.map((preview) => (
                <img key={preview} src={preview} alt="Valgt bilde" className="h-20 w-full rounded-lg object-cover" />
              ))}
            </div>
          ) : null}

          <label className="block text-sm font-medium text-gray-800">
            Koble til funn (valgfritt)
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={findingId}
              onChange={(event) => setFindingId(event.target.value)}
            >
              <option value="">Ingen kobling</option>
              {(findingOptions ?? []).map((finding) => {
                const speciesName = finding.mushroom_species?.norwegian_name || finding.species_name_override || 'Ukjent art';
                const dateLabel = new Date(finding.found_at).toLocaleDateString('nb-NO');
                const zoneLabel = finding.is_zone_finding ? ` • Sone: ${finding.zone_label ?? 'Ukjent'} (${finding.zone_precision_km ?? 5} km)` : '';
                return (
                  <option key={finding.id} value={finding.id}>
                    {speciesName} ({dateLabel}){zoneLabel}
                  </option>
                );
              })}
            </select>
          </label>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => router.push('/forum')}>
              Avbryt
            </Button>
            <Button type="submit" className="flex-1" loading={createPost.isPending}>
              Publiser
            </Button>
          </div>
        </form>
      </section>
    </PageWrapper>
  );
}
