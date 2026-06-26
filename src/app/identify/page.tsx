'use client';

import { Camera, Info, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { Button } from '@/components/ui/Button';
import { useGeolocation } from '@/lib/hooks/useGeolocation';
import { useIdentify } from '@/lib/hooks/useIdentify';
import { optimizeImageForIdentification } from '@/lib/utils/image';
import { isNativePlatform } from '@/lib/native/platform';
import { captureNativePhoto } from '@/lib/native/camera';

export default function IdentifyPage() {
  const t = useTranslations('Identify');
  const s = useTranslations('Safety');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const { latitude, longitude } = useGeolocation();
  const identify = useIdentify();

  const [error, setError] = useState<string | null>(null);
  const [aiDisabled, setAiDisabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/identify')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.enabled === false) setAiDisabled(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFile = async (file: File) => {
    setError(null);
    setAiDisabled(false);

    try {
      // One EXIF-free re-encode serves both the AI call and the saved find
      // photo — the raw file (with GPS metadata) never leaves the device.
      const optimizedBase64 = await optimizeImageForIdentification(file);

      const result = await identify.mutateAsync({
        imageBase64: optimizedBase64,
        originalImageDataUrl: `data:image/jpeg;base64,${optimizedBase64}`,
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined
      });

      sessionStorage.setItem('identifyResult', JSON.stringify(result));
      router.push('/identify/result');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('identifyFailed');
      if (message.toLowerCase().includes('ikke aktivert')) {
        setAiDisabled(true);
      } else {
        setError(message);
      }
    }
  };

  const handleCapture = async () => {
    if (!isNativePlatform()) {
      fileInputRef.current?.click();
      return;
    }
    setError(null);
    try {
      const file = await captureNativePhoto();
      if (file) await handleFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('couldNotGetImage'));
    }
  };

  return (
    <PageWrapper>
      <section className="space-y-4">
        <header>
          <p className="text-xs font-medium uppercase tracking-widest text-forest-700">{t('eyebrow')}</p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-forest-900">{t('title')}</h1>
        </header>

        {aiDisabled ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 shrink-0 text-amber-700" />
              <div className="space-y-2">
                <p className="font-semibold text-amber-900">{t('disabledHeading')}</p>
                <p className="text-sm text-amber-900">
                  {t('disabledIntro')}
                </p>
                <ul className="list-disc pl-5 text-sm text-amber-900">
                  <li>{t('disabledSearchDb')}</li>
                  <li>{t('disabledBrowseSeason')}</li>
                  <li>{t('disabledSendImagePrefix')}{' '}
                    <a href={s('controlUrl')} target="_blank" rel="noreferrer" className="underline">
                      {t('soppkontrollen')}
                    </a>{' '}{t('disabledSendImageSuffix')}</li>
                </ul>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button onClick={() => router.push('/species')} icon={<Search className="h-4 w-4" />}>
                    {t('searchDb')}
                  </Button>
                  <Button variant="outline" onClick={() => router.push('/calendar')}>
                    {t('seasonCalendar')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">⚠️ {t('safetyHeading')}</p>
          <p className="mt-1">
            {t('safetyIntro')}{' '}
            <a href={s('controlUrl')} target="_blank" rel="noreferrer" className="underline">
              {t('soppkontrollen')}
            </a>
            {t('safetyPhonePrefix')} <strong>{s('poisonNumber')}</strong>.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-card">
          <div className="mb-3 rounded-xl border-2 border-dashed border-gray-300 p-6 text-center">
            <p className="text-sm text-gray-700">{t('centerHint')}</p>
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
            <Button onClick={handleCapture} loading={identify.isPending} icon={<Camera className="h-4 w-4" />}>
              {t('takeOrChoosePhoto')}
            </Button>
            <Button variant="outline" icon={<Search className="h-4 w-4" />} onClick={() => router.push('/species')}>
              {t('searchDb')}
            </Button>
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {identify.isPending ? <p className="mt-3 text-sm text-gray-700">{t('analyzing')}</p> : null}
        </div>

      </section>
    </PageWrapper>
  );
}
