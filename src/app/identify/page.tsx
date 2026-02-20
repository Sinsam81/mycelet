'use client';

import { Camera, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { Button } from '@/components/ui/Button';
import { useGeolocation } from '@/lib/hooks/useGeolocation';
import { useIdentify } from '@/lib/hooks/useIdentify';
import { fileToDataUrl, optimizeImageForIdentification } from '@/lib/utils/image';

export default function IdentifyPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const { latitude, longitude } = useGeolocation();
  const identify = useIdentify();

  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);

    try {
      const [optimizedBase64, originalDataUrl] = await Promise.all([
        optimizeImageForIdentification(file),
        fileToDataUrl(file)
      ]);

      const result = await identify.mutateAsync({
        imageBase64: optimizedBase64,
        originalImageDataUrl: originalDataUrl,
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined
      });

      sessionStorage.setItem('identifyResult', JSON.stringify(result));
      router.push('/identify/result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Identifikasjon feilet');
    }
  };

  return (
    <PageWrapper>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">Identifiser sopp</h1>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 rounded-lg border-2 border-dashed border-gray-300 p-6 text-center">
            <p className="text-sm text-gray-700">Sentrer soppen i bildet. Ta gjerne flere vinkler.</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button onClick={() => fileInputRef.current?.click()} loading={identify.isPending} icon={<Camera className="h-4 w-4" />}>
              Ta bilde / velg bilde
            </Button>
            <Button variant="outline" icon={<Search className="h-4 w-4" />} onClick={() => router.push('/species')}>
              Søk i soppdatabasen
            </Button>
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {identify.isPending ? <p className="mt-3 text-sm text-gray-700">Analyserer bilde...</p> : null}
        </div>
      </section>
    </PageWrapper>
  );
}
