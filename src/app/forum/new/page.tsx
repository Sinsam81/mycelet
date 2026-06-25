'use client';

import { ChangeEvent, FormEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Camera, X } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { Button } from '@/components/ui/Button';
import { useCreatePost, useMyFindings } from '@/lib/hooks/useForum';
import { createClient } from '@/lib/supabase/client';
import { reencodeImageForUpload } from '@/lib/utils/image';
import { isNativePlatform } from '@/lib/native/platform';
import { captureNativePhoto } from '@/lib/native/camera';

type Category = 'find' | 'question' | 'tip' | 'discussion';

// Next 15+ requires useSearchParams() inside a Suspense boundary; default
// export at the bottom wraps NewForumPostInner.
function NewForumPostInner() {
  const t = useTranslations('ForumNew');
  const router = useRouter();
  const searchParams = useSearchParams();

  const categoryOptions: Array<{ label: string; value: Category }> = [
    { label: t('categoryFind'), value: 'find' },
    { label: t('categoryQuestion'), value: 'question' },
    { label: t('categoryTip'), value: 'tip' },
    { label: t('categoryDiscussion'), value: 'discussion' }
  ];
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Revoke object URLs on unmount only (via a ref) — depending on `previews`
  // would revoke still-shown previews whenever we append a photo.
  const previewsRef = useRef<string[]>([]);
  previewsRef.current = previews;
  useEffect(() => () => previewsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const uploadForumImage = async (file: File) => {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) throw new Error(t('mustBeLoggedIn'));

    // EXIF-stripped re-encode — forum photos must not carry GPS metadata.
    const blob = await reencodeImageForUpload(file);
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

    const { error: uploadError } = await supabase.storage.from('forum-images').upload(path, blob, { upsert: false, contentType: 'image/jpeg' });
    if (uploadError) throw new Error(uploadError.message);

    const {
      data: { publicUrl }
    } = supabase.storage.from('forum-images').getPublicUrl(path);

    return publicUrl;
  };

  const addFiles = (files: File[]) => {
    const toAdd = files.slice(0, 4 - images.length);
    if (toAdd.length === 0) return;
    setImages((prev) => [...prev, ...toAdd].slice(0, 4));
    setPreviews((prev) => [...prev, ...toAdd.map((file) => URL.createObjectURL(file))].slice(0, 4));
  };

  const onSelectImages = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  // Native: open the camera/picker via Capacitor (one photo at a time, appended).
  // Web: fall back to the hidden multi-file input.
  const handleAddPhoto = async () => {
    if (images.length >= 4) return;
    if (!isNativePlatform()) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const file = await captureNativePhoto();
      if (file) addFiles([file]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('couldNotGetImage'));
    }
  };

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setImages((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!title.trim() || !content.trim()) {
      setError(t('titleAndContentRequired'));
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
      setError(err instanceof Error ? err.message : t('couldNotPublish'));
    }
  };

  return (
    <PageWrapper>
      <section className="space-y-4">
        <header>
          <p className="text-xs font-medium uppercase tracking-widest text-forest-700">{t('community')}</p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-forest-900">{t('newPost')}</h1>
        </header>

        <form className="space-y-3 rounded-2xl bg-white p-4 shadow-card" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-gray-800">
            {t('titleLabel')}
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>

          <label className="block text-sm font-medium text-gray-800">
            {t('categoryLabel')}
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
            {t('contentLabel')}
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              rows={5}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              required
            />
          </label>

          <div className="text-sm font-medium text-gray-800">
            <span>{t('imagesLabel')}</span>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onSelectImages} />
            {previews.length > 0 ? (
              <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {previews.map((preview, index) => (
                  <div key={preview} className="relative">
                    <img src={preview} alt={t('selectedImageAlt')} className="h-20 w-full rounded-lg object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      aria-label={t('removeImage')}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {images.length < 4 ? (
              <button
                type="button"
                onClick={handleAddPhoto}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm font-medium text-gray-700 hover:border-forest-600 hover:bg-forest-50"
              >
                <Camera className="h-4 w-4" /> {t('takeOrPickPhoto')}
              </button>
            ) : null}
          </div>

          <label className="block text-sm font-medium text-gray-800">
            {t('linkFindingLabel')}
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={findingId}
              onChange={(event) => setFindingId(event.target.value)}
            >
              <option value="">{t('noLink')}</option>
              {(findingOptions ?? []).map((finding) => {
                const speciesName = finding.mushroom_species?.norwegian_name || finding.species_name_override || t('unknownSpecies');
                const dateLabel = new Date(finding.found_at).toLocaleDateString('nb-NO');
                const zoneLabel = finding.is_zone_finding ? ` • ${t('zone')}: ${finding.zone_label ?? t('unknown')} (${finding.zone_precision_km ?? 5} km)` : '';
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
              {t('cancel')}
            </Button>
            <Button type="submit" className="flex-1" loading={createPost.isPending}>
              {t('publish')}
            </Button>
          </div>
        </form>
      </section>
    </PageWrapper>
  );
}


export default function NewForumPostPage() {
  const t = useTranslations('ForumNew');
  return (
    <Suspense fallback={<PageWrapper><p className="text-sm text-gray-700">{t('loading')}</p></PageWrapper>}>
      <NewForumPostInner />
    </Suspense>
  );
}
