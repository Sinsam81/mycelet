'use client';

import { Camera, Info, Search, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { Button } from '@/components/ui/Button';
import { getCurrentPositionOnce } from '@/lib/hooks/useGeolocation';
import { IdentifyError, useIdentify } from '@/lib/hooks/useIdentify';
import { optimizeImageForIdentification } from '@/lib/utils/image';
import { isNativePlatform } from '@/lib/native/platform';
import { captureNativePhoto } from '@/lib/native/camera';

export default function IdentifyPage() {
  const t = useTranslations('Identify');
  const s = useTranslations('Safety');
  const locale = useLocale();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const identify = useIdentify();

  const [error, setError] = useState<string | null>(null);
  const [aiDisabled, setAiDisabled] = useState(false);
  // Kvoteveggen får sin egen tilstand fordi den er det motsatte av en feil:
  // brukeren har gjort alt riktig og skal videre et sted. Som rød tekstlinje
  // uten noe å trykke på endte appens sterkeste konverteringsøyeblikk i en
  // blindvei — teksten ba om oppgradering, men pekte ingen vei dit.
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null);

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
    setQuotaMessage(null);

    try {
      // One EXIF-free re-encode serves both the AI call and the saved find
      // photo — the raw file (with GPS metadata) never leaves the device.
      const optimizedBase64 = await optimizeImageForIdentification(file);

      // Posisjonen hentes FØRST her, ikke ved mount.
      //
      // Siden kalte useGeolocation() i toppen av komponenten, så iOS spurte om
      // stedstilgang i samme sekund som brukeren åpnet «Identifiser» — før de
      // hadde tatt et eneste bilde. Apple ber uttrykkelig om at slike dialoger
      // kommer når handlingen krever det (5.1.1), og en dialog uten kontekst er
      // også den sikreste måten å få et «Ikke tillat» på.
      //
      // Posisjonen er en hjelp, ikke et krav: den brukes til å vekte hvilke
      // arter som er sannsynlige. Feiler den, eller sier brukeren nei, går
      // identifiseringen videre uten koordinater.
      const coords = await getCurrentPositionOnce().catch(() => null);

      const result = await identify.mutateAsync({
        imageBase64: optimizedBase64,
        originalImageDataUrl: `data:image/jpeg;base64,${optimizedBase64}`,
        latitude: coords?.latitude,
        longitude: coords?.longitude
      });

      sessionStorage.setItem('identifyResult', JSON.stringify(result));
      router.push('/identify/result');
    } catch (err) {
      // fetch rejects with a TypeError whose message is browser-English
      // («Load failed» in WebKit) — translate instead of surfacing it raw.
      const message =
        err instanceof TypeError
          ? t('networkError')
          : err instanceof Error
            ? err.message
            : t('identifyFailed');
      // Forgrener på kode, ikke på tekst. Den forrige varianten leste
      // `message.toLowerCase().includes('ikke aktivert')` — den virket bare så
      // lenge serveren alltid svarte norsk, og ville stille sluttet å virke i
      // det feilmeldingene ble oversatt.
      if (err instanceof IdentifyError && err.code === 'ai_disabled') {
        setAiDisabled(true);
      } else if (err instanceof IdentifyError && err.code === 'daily_quota') {
        // Teksten er serverens — den er allerede på leserens språk og
        // inneholder det faktiske tallet fra FREE_DAILY_AI_LIMIT.
        setQuotaMessage(message);
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
    setQuotaMessage(null);
    try {
      const file = await captureNativePhoto(locale);
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

        {quotaMessage ? (
          <div className="rounded-xl border border-forest-300 bg-forest-50 p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 shrink-0 text-forest-700" />
              <div className="space-y-2">
                <p className="font-semibold text-forest-900">{t('quotaHeading')}</p>
                <p className="text-sm text-forest-900">{quotaMessage}</p>
                <ul className="list-disc pl-5 text-sm text-forest-900">
                  <li>{t('disabledSearchDb')}</li>
                  <li>{t('disabledBrowseSeason')}</li>
                  <li>{t('quotaComeBackTomorrow')}</li>
                </ul>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Link
                    href="/pricing"
                    className="inline-flex items-center justify-center rounded-lg bg-forest-700 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-800"
                  >
                    {t('quotaSeePlans')}
                  </Link>
                  <Button variant="outline" onClick={() => router.push('/species')}>
                    {t('searchDb')}
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
