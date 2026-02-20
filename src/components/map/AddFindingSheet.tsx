'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';

type Visibility = 'public' | 'approximate' | 'private';
type SharingMode = 'public' | 'approximate' | 'zone' | 'private';

interface AddFindingSheetProps {
  latitude: number | null;
  longitude: number | null;
  onClose: () => void;
  onSaved: () => void;
}

interface SpeciesOption {
  id: number;
  norwegian_name: string;
  latin_name: string;
}

export function AddFindingSheet({ latitude, longitude, onClose, onSaved }: AddFindingSheetProps) {
  const supabase = useMemo(() => createClient(), []);

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
    if (!user) throw new Error('Du må være logget inn');

    const fileExt = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage.from('finding-images').upload(fileName, file, {
      upsert: false
    });

    if (uploadError) throw new Error(`Bildeopplasting feilet: ${uploadError.message}`);

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
      setError('GPS-posisjon mangler. Tillat lokasjon og prøv igjen.');
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Du må være logget inn');
      }

      const adjusted = applyOffset(latitude, longitude, positionOffsetMeters);
      const imageUrl = imageFile ? await uploadImage(imageFile) : null;
      const visibility: Visibility = sharingMode === 'zone' ? 'approximate' : (sharingMode as Visibility);
      const isZoneFinding = sharingMode === 'zone';

      if (isZoneFinding && !zoneLabel.trim()) {
        throw new Error('Legg inn et sonenavn (f.eks. Nordmarka sør).');
      }

      const { error: insertError } = await supabase.from('findings').insert({
        user_id: user.id,
        species_id: speciesId,
        latitude: adjusted.lat,
        longitude: adjusted.lng,
        notes: notes || null,
        visibility,
        image_url: imageUrl,
        thumbnail_url: imageUrl,
        is_zone_finding: isZoneFinding,
        zone_label: isZoneFinding ? zoneLabel.trim() : null,
        zone_precision_km: isZoneFinding ? zonePrecisionKm : 5
      });

      if (insertError) throw insertError;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke lagre funn');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-[1100] rounded-t-2xl border border-gray-200 bg-white p-4 shadow-2xl">
      <div className="mb-3 h-1.5 w-12 rounded-full bg-gray-300" />
      <h3 className="text-lg font-semibold">Legg til funn</h3>

      <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-gray-800">
          Velg art (valgfritt)
          <input
            value={speciesQuery}
            onChange={(event) => searchSpecies(event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            placeholder="Søk art"
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
          Notater
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            rows={3}
            placeholder="Beskriv funnet"
          />
        </label>

        <label className="block text-sm font-medium text-gray-800">
          Bilde (valgfritt)
          <input
            type="file"
            accept="image/*"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setImageFile(file);
              if (imagePreview) URL.revokeObjectURL(imagePreview);
              setImagePreview(file ? URL.createObjectURL(file) : null);
            }}
          />
        </label>

        {imagePreview ? <img src={imagePreview} alt="Forhåndsvisning" className="h-28 w-full rounded-lg object-cover" /> : null}

        <label className="block text-sm font-medium text-gray-800">
          Juster posisjon (meter)
          <input
            type="range"
            min={0}
            max={500}
            step={10}
            value={positionOffsetMeters}
            onChange={(event) => setPositionOffsetMeters(Number(event.target.value))}
            className="mt-2 w-full"
          />
          <span className="text-xs text-gray-600">Offset: {positionOffsetMeters}m</span>
        </label>

        {latitude && longitude ? (
          <p className="text-xs text-gray-600">
            Koordinat-preview: {applyOffset(latitude, longitude, positionOffsetMeters).lat.toFixed(5)},{' '}
            {applyOffset(latitude, longitude, positionOffsetMeters).lng.toFixed(5)}
          </p>
        ) : null}

        <label className="block text-sm font-medium text-gray-800">
          Delingsnivå
          <select
            value={sharingMode}
            onChange={(event) => setSharingMode(event.target.value as SharingMode)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          >
            <option value="public">Eksakt punkt (offentlig)</option>
            <option value="approximate">Omtrentlig (±500m)</option>
            <option value="zone">Sone-funn (hemmeligsted-vennlig)</option>
            <option value="private">Privat</option>
          </select>
        </label>

        {sharingMode === 'zone' ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-800">Sone-funn skjuler nøyaktig punkt og viser kun område.</p>
            <label className="mt-2 block text-sm font-medium text-gray-800">
              Sone-navn
              <input
                value={zoneLabel}
                onChange={(event) => setZoneLabel(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder="f.eks. Nordmarka sør"
              />
            </label>
            <label className="mt-2 block text-sm font-medium text-gray-800">
              Grovhet (km-grid)
              <input
                type="range"
                min={1}
                max={15}
                step={1}
                value={zonePrecisionKm}
                onChange={(event) => setZonePrecisionKm(Number(event.target.value))}
                className="mt-1 w-full"
              />
              <span className="text-xs text-gray-600">{zonePrecisionKm} km</span>
            </label>
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Avbryt
          </Button>
          <Button type="submit" className="flex-1" loading={loading}>
            Lagre funn
          </Button>
        </div>
      </form>
    </div>
  );
}
