'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Camera } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { reencodeImageForUpload } from '@/lib/utils/image';
import { isNativePlatform } from '@/lib/native/platform';
import { captureNativePhoto } from '@/lib/native/camera';

type Visibility = 'public' | 'approximate' | 'private';
type SharingMode = 'public' | 'approximate' | 'zone' | 'private';

/**
 * 'positive' = the user found something. The traditional flow.
 * 'negative' = the user looked here and didn't find what they expected.
 *
 * Per docs/roadmap.md "Feedback-loop = forretningsmodellen": no-finds are
 * as valuable to the prediction model as positives. The whole reason this
 * toggle exists is to turn empty searches into training data.
 */
type FindingType = 'positive' | 'negative';

interface AddFindingSheetProps {
  latitude: number | null;
  longitude: number | null;
  onClose: () => void;
  onSaved: (speciesName?: string) => void;
}

interface SpeciesOption {
  id: number;
  norwegian_name: string;
  latin_name: string;
}

export function AddFindingSheet({ latitude, longitude, onClose, onSaved }: AddFindingSheetProps) {
  const t = useTranslations('AddFindingSheet');
  const supabase = useMemo(() => createClient(), []);

  const [findingType, setFindingType] = useState<FindingType>('positive');
  const [speciesQuery, setSpeciesQuery] = useState('');
  const [speciesOptions, setSpeciesOptions] = useState<SpeciesOption[]>([]);
  const [speciesId, setSpeciesId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [sharingMode, setSharingMode] = useState<SharingMode>('approximate');
  const [zoneLabel, setZoneLabel] = useState('');
  const [zonePrecisionKm, setZonePrecisionKm] = useState(5);
  const [positionOffsetMeters, setPositionOffsetMeters] = useState(0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const setImageFromFile = (file: File | null) => {
    setImageFile(file);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(file ? URL.createObjectURL(file) : null);
  };

  // On native, open the camera/photo picker via Capacitor; on web, fall back to
  // the hidden <input type="file">. Both flow through the same EXIF-stripping upload.
  const handleAddPhoto = async () => {
    if (!isNativePlatform()) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const file = await captureNativePhoto();
      if (file) setImageFromFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorFetchImage'));
    }
  };

  const applyOffset = (lat: number, lng: number, meters: number) => {
    if (meters <= 0) return { lat, lng };
    const angle = (45 * Math.PI) / 180;
    const deltaLat = (meters / 111320) * Math.cos(angle);
    const deltaLng = (meters / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
    return { lat: lat + deltaLat, lng: lng + deltaLng };
  };

  const uploadImage = async (file: File) => {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error(t('errorNotLoggedIn'));

    // Re-encode via canvas before upload: strips EXIF (incl. GPS), so the
    // photo can't leak the exact spot of an approximate/private find.
    const blob = await reencodeImageForUpload(file);
    const fileName = `${user.id}/${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage.from('finding-images').upload(fileName, blob, {
      upsert: false,
      contentType: 'image/jpeg'
    });

    if (uploadError) throw new Error(t('errorImageUpload', { message: uploadError.message }));

    const {
      data: { publicUrl }
    } = supabase.storage.from('finding-images').getPublicUrl(fileName);

    return publicUrl;
  };

  const searchSpecies = async (value: string) => {
    setSpeciesQuery(value);
    if (value.trim().length < 2) {
      setSpeciesOptions([]);
      return;
    }

    const { data } = await supabase
      .from('mushroom_species')
      .select('id,norwegian_name,latin_name')
      .or(`norwegian_name.ilike.%${value}%,latin_name.ilike.%${value}%`)
      .order('norwegian_name', { ascending: true })
      .limit(8);

    setSpeciesOptions(data ?? []);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!latitude || !longitude) {
      setError(t('errorGpsMissing'));
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error(t('errorNotLoggedIn'));
      }

      const adjusted = applyOffset(latitude, longitude, positionOffsetMeters);
      const isNegative = findingType === 'negative';
      // No image for negative observations — there's nothing to photograph.
      const imageUrl = !isNegative && imageFile ? await uploadImage(imageFile) : null;
      const visibility: Visibility = sharingMode === 'zone' ? 'approximate' : (sharingMode as Visibility);
      const isZoneFinding = sharingMode === 'zone';

      if (isZoneFinding && !zoneLabel.trim()) {
        throw new Error(t('errorZoneLabelRequired'));
      }

      const saveResponse = await fetch('/api/findings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speciesId,
          latitude: adjusted.lat,
          longitude: adjusted.lng,
          notes: notes || null,
          visibility,
          imageUrl,
          thumbnailUrl: imageUrl,
          isZoneFinding,
          zoneLabel: isZoneFinding ? zoneLabel.trim() : null,
          zonePrecisionKm: isZoneFinding ? zonePrecisionKm : 5,
          isNegativeObservation: isNegative
        })
      });

      if (!saveResponse.ok) {
        const body = await saveResponse.json().catch(() => null);
        throw new Error(body?.error || t('errorSaveFinding'));
      }
      onSaved(speciesQuery || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorSaveFinding'));
    } finally {
      setLoading(false);
    }
  };

  const isNegative = findingType === 'negative';

  return (
    <div className="absolute inset-x-0 bottom-0 z-[1100] max-h-full overflow-y-auto overscroll-contain rounded-t-2xl border border-gray-200 bg-white p-4 shadow-2xl">
      <div className="mb-3 h-1.5 w-12 rounded-full bg-gray-300" />
      <h3 className="text-lg font-semibold">{isNegative ? t('logNoFinding') : t('addFinding')}</h3>

      <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
        {/* Type-toggle øverst — feedback-loopen trenger negative observasjoner
            for å trene prediksjons-modellen. Se docs/roadmap.md. */}
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setFindingType('positive')}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
              !isNegative ? 'bg-white text-forest-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            🍄 {t('finding')}
          </button>
          <button
            type="button"
            onClick={() => setFindingType('negative')}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
              isNegative ? 'bg-white text-forest-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            🚫 {t('noFinding')}
          </button>
        </div>

        {isNegative ? (
          <p className="rounded-lg bg-forest-50 px-3 py-2 text-xs text-forest-900">
            {t('negativeHint')}
          </p>
        ) : null}

        <label className="block text-sm font-medium text-gray-800">
          {isNegative ? t('speciesLabelNegative') : t('speciesLabel')}
          <input
            value={speciesQuery}
            onChange={(event) => searchSpecies(event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            placeholder={t('speciesPlaceholder')}
          />
        </label>

        {speciesOptions.length > 0 ? (
          <div className="max-h-32 overflow-auto rounded-lg border border-gray-200">
            {speciesOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setSpeciesId(option.id);
                  setSpeciesQuery(option.norwegian_name);
                  setSpeciesOptions([]);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
              >
                <span className="text-sm">{option.norwegian_name}</span>
                <span className="text-xs italic text-gray-500">{option.latin_name}</span>
              </button>
            ))}
          </div>
        ) : null}

        <label className="block text-sm font-medium text-gray-800">
          {t('notesLabel')}
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            rows={3}
            placeholder={isNegative ? t('notesPlaceholderNegative') : t('notesPlaceholder')}
          />
        </label>

        {!isNegative ? (
          <>
            <div className="text-sm font-medium text-gray-800">
              <span>{t('imageLabel')}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => setImageFromFile(event.target.files?.[0] ?? null)}
              />
              {imagePreview ? (
                <div className="mt-1 space-y-1">
                  <img src={imagePreview} alt={t('imagePreviewAlt')} className="h-28 w-full rounded-lg object-cover" />
                  <button type="button" onClick={() => setImageFromFile(null)} className="text-xs font-medium text-red-700 hover:underline">
                    {t('removeImage')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleAddPhoto}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm font-medium text-gray-700 hover:border-forest-600 hover:bg-forest-50"
                >
                  <Camera className="h-4 w-4" /> {t('addPhoto')}
                </button>
              )}
            </div>
          </>
        ) : null}

        <label className="block text-sm font-medium text-gray-800">
          {t('adjustPosition')}
          <input
            type="range"
            min={0}
            max={500}
            step={10}
            value={positionOffsetMeters}
            onChange={(event) => setPositionOffsetMeters(Number(event.target.value))}
            className="mt-2 w-full"
          />
          <span className="text-xs text-gray-600">{t('offset', { meters: positionOffsetMeters })}</span>
        </label>

        {latitude && longitude ? (
          <p className="text-xs text-gray-600">
            {t('coordinatePreview', {
              lat: applyOffset(latitude, longitude, positionOffsetMeters).lat.toFixed(5),
              lng: applyOffset(latitude, longitude, positionOffsetMeters).lng.toFixed(5)
            })}
          </p>
        ) : null}

        <label className="block text-sm font-medium text-gray-800">
          {t('sharingLevel')}
          <select
            value={sharingMode}
            onChange={(event) => setSharingMode(event.target.value as SharingMode)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          >
            <option value="public">{t('sharingPublic')}</option>
            <option value="approximate">{t('sharingApproximate')}</option>
            <option value="zone">{t('sharingZone')}</option>
            <option value="private">{t('sharingPrivate')}</option>
          </select>
        </label>

        {sharingMode === 'zone' ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-800">{t('zoneInfo')}</p>
            <label className="mt-2 block text-sm font-medium text-gray-800">
              {t('zoneName')}
              <input
                value={zoneLabel}
                onChange={(event) => setZoneLabel(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder={t('zoneNamePlaceholder')}
              />
            </label>
            <label className="mt-2 block text-sm font-medium text-gray-800">
              {t('zoneGranularity')}
              <input
                type="range"
                min={1}
                max={15}
                step={1}
                value={zonePrecisionKm}
                onChange={(event) => setZonePrecisionKm(Number(event.target.value))}
                className="mt-1 w-full"
              />
              <span className="text-xs text-gray-600">{t('zonePrecisionKm', { km: zonePrecisionKm })}</span>
            </label>
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" className="flex-1" loading={loading}>
            {isNegative ? t('logNoFinding') : t('saveFinding')}
          </Button>
        </div>
      </form>
    </div>
  );
}
