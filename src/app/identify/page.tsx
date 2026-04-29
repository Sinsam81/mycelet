'use client';

import { Camera, Info, Search } from 'lucide-react';
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
  const [aiDisabled, setAiDisabled] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    setAiDisabled(false);

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
      const message = err instanceof Error ? err.message : 'Identifikasjon feilet';
      if (message.toLowerCase().includes('ikke aktivert')) {
        setAiDisabled(true);
      } else {
        setError(message);
      }
    }
  };

  return (
    <PageWrapper>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">Identifiser sopp</h1>

        {aiDisabled ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 shrink-0 text-amber-700" />
              <div className="space-y-2">
                <p className="font-semibold text-amber-900">AI-identifikasjon er under oppsett</p>
                <p className="text-sm text-amber-900">
                  Vi venter fortsatt på API-tilgang fra leverandøren. I mellomtiden kan du:
                </p>
                <ul className="list-disc pl-5 text-sm text-amber-900">
                  <li>Søke i soppdatabasen på norsk eller latinsk navn</li>
                  <li>Bla gjennom artene i sesong via kalenderen</li>
                  <li>Sende bilde til{' '}
                    <a href="https://soppognyttevekster.no/soppkontroll/" target="_blank" rel="noreferrer" className="underline">
                      Soppkontrollen
                    </a>{' '}for ekspertvurdering</li>
                </ul>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button onClick={() => router.push('/species')} icon={<Search className="h-4 w-4" />}>
                    Søk i soppdatabasen
                  </Button>
                  <Button variant="outline" onClick={() => router.push('/calendar')}>
                    Sesongkalender
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

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

        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <strong>Husk:</strong> AI-identifikasjon er et hjelpemiddel — ikke en fasit. Sjekk alltid mot
          forvekslingsarter på artsiden, og send bilde til Soppkontrollen før du spiser usikre arter.
        </div>
      </section>
    </PageWrapper>
  );
}
