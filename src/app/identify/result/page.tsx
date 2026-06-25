'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { IdentifyResult } from '@/components/identify/IdentifyResult';
import { LookAlikeCheck } from '@/components/identify/LookAlikeCheck';
import { SafetyWarning } from '@/components/identify/SafetyWarning';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase/client';
import { isDangerousEdibility } from '@/lib/utils/edibility';
import { IdentifyResultPayload } from '@/types/identify';

export default function IdentifyResultPage() {
  const t = useTranslations('IdentifyResult');
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [payload, setPayload] = useState<IdentifyResultPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const raw = sessionStorage.getItem('identifyResult');
    if (!raw) {
      router.replace('/identify');
      return;
    }

    try {
      setPayload(JSON.parse(raw) as IdentifyResultPayload);
    } catch {
      router.replace('/identify');
    }
  }, [router]);

  const topSuggestion = payload?.suggestions?.[0];
  // Treat unknown/unmapped edibility as dangerous too: a Kindwise suggestion
  // outside our catalog with no mapped edibility must still surface the red
  // warning + Giftinformasjonen, never a soft "inedible" badge. See edibility.ts.
  const isDanger = payload?.suggestions?.some((s) => isDangerousEdibility(s.edibility)) ?? false;

  const handleSave = async () => {
    if (!payload || !topSuggestion) return;

    setError(null);
    setSaving(true);

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error(t('errorNotLoggedIn'));
      }

      if (payload.location.latitude == null || payload.location.longitude == null) {
        throw new Error(t('errorMissingGps'));
      }

      // The user confirms which suggestion is correct (defaults to the AI's top).
      const chosen = payload.suggestions[selectedIndex] ?? topSuggestion;

      // Save the identified photo with the find (best-effort — a photo upload
      // hiccup must not block logging). Gives every AI-logged find an image:
      // richer community feed + a labelled record for later review.
      let imageUrl: string | null = null;
      if (payload.originalImageDataUrl) {
        try {
          const blob = await (await fetch(payload.originalImageDataUrl)).blob();
          const fileName = `${user.id}/${Date.now()}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from('finding-images')
            .upload(fileName, blob, { upsert: false, contentType: blob.type || 'image/jpeg' });
          if (!uploadError) {
            imageUrl = supabase.storage.from('finding-images').getPublicUrl(fileName).data.publicUrl;
          }
        } catch {
          // ignore — log the find without the photo
        }
      }

      const { error: insertError } = await supabase.from('findings').insert({
        user_id: user.id,
        latitude: payload.location.latitude,
        longitude: payload.location.longitude,
        species_id: chosen.speciesId ?? null,
        species_name_override: chosen.name,
        ai_used: true,
        ai_top_suggestion: topSuggestion.name,
        ai_confidence: topSuggestion.probability / 100,
        ai_raw_response: { suggestions: payload.suggestions, confirmedIndex: selectedIndex },
        visibility: 'approximate',
        user_confirmed_species: true,
        image_url: imageUrl,
        thumbnail_url: imageUrl
      });

      if (insertError) throw insertError;
      toast.success(t('saveSuccess'));
      router.push('/map');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!payload) {
    return (
      <PageWrapper>
        <p className="text-sm text-gray-700">{t('loading')}</p>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <section className="space-y-4">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-forest-900">{t('title')}</h1>

        <SafetyWarning level={isDanger ? 'danger' : 'caution'} edibility={topSuggestion?.edibility} />

        <div className="overflow-hidden rounded-2xl bg-white shadow-card">
          <img src={payload.originalImageDataUrl} alt={t('imageAlt')} className="h-56 w-full object-cover" />
        </div>

        <p className="text-sm text-gray-700">{t('chooseSpeciesPrompt')}</p>
        <IdentifyResult
          suggestions={payload.suggestions.slice(0, 3)}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
        />

        <LookAlikeCheck suggestion={payload.suggestions[selectedIndex] ?? topSuggestion} />

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button onClick={handleSave} loading={saving}>
            {t('saveAsFinding')}
          </Button>
          <Button variant="outline" onClick={() => router.push('/identify')}>
            {t('takeNewPhoto')}
          </Button>
          <Button variant="outline" className="w-full" onClick={() => router.push('/forum/new')}>
            {t('askInForum')}
          </Button>
        </div>
      </section>
    </PageWrapper>
  );
}
