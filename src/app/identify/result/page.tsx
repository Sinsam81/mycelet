'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { IdentifyResult } from '@/components/identify/IdentifyResult';
import { SafetyWarning } from '@/components/identify/SafetyWarning';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase/client';
import { IdentifyResultPayload } from '@/types/identify';

export default function IdentifyResultPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [payload, setPayload] = useState<IdentifyResultPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const isDanger = payload?.suggestions?.some((s) => s.edibility === 'toxic' || s.edibility === 'deadly') ?? false;

  const handleSave = async () => {
    if (!payload || !topSuggestion) return;

    setError(null);
    setSaving(true);

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Du må være logget inn for å lagre funn.');
      }

      if (payload.location.latitude == null || payload.location.longitude == null) {
        throw new Error('GPS-posisjon mangler. Ta nytt bilde med lokasjon aktivert.');
      }

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
        species_id: topSuggestion.speciesId ?? null,
        species_name_override: topSuggestion.name,
        ai_used: true,
        ai_top_suggestion: topSuggestion.name,
        ai_confidence: topSuggestion.probability / 100,
        ai_raw_response: { suggestions: payload.suggestions },
        visibility: 'approximate',
        user_confirmed_species: Boolean(topSuggestion.speciesId),
        image_url: imageUrl,
        thumbnail_url: imageUrl
      });

      if (insertError) throw insertError;
      toast.success('Funn lagret! 🍄');
      router.push('/map');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke lagre funn.');
    } finally {
      setSaving(false);
    }
  };

  if (!payload) {
    return (
      <PageWrapper>
        <p className="text-sm text-gray-700">Laster resultat...</p>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">Resultat</h1>

        <SafetyWarning level={isDanger ? 'danger' : 'caution'} edibility={topSuggestion?.edibility} />

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <img src={payload.originalImageDataUrl} alt="Opplastet soppbilde" className="h-56 w-full object-cover" />
        </div>

        <IdentifyResult suggestions={payload.suggestions.slice(0, 3)} />

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button onClick={handleSave} loading={saving}>
            Lagre som funn
          </Button>
          <Button variant="outline" onClick={() => router.push('/identify')}>
            Ta nytt bilde
          </Button>
          <Button variant="outline" className="w-full" onClick={() => router.push('/forum/new')}>
            Spør i forumet
          </Button>
        </div>
      </section>
    </PageWrapper>
  );
}
