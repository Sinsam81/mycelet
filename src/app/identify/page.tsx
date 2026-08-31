'use client';

import { Camera, Info, Search, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { Button } from '@/components/ui/Button';
import { getCurrentPositionOnce } from '@/lib/hooks/useGeolocation';
import { IdentifyError, useIdentify } from '@/lib/hooks/useIdentify';
import { base64ToBlob, optimizeImageForIdentification, reencodeBase64ForHistory } from '@/lib/utils/image';
import { createClient } from '@/lib/supabase/client';
import {
  HISTORY_IMAGE_MAX_DIM,
  HISTORY_IMAGE_QUALITY,
  IDENTIFY_HISTORY_BUCKET
} from '@/lib/identifications/config';
import { MAX_TOTAL_BASE64_CHARS } from '@/lib/utils/identify-images';
import { isNativePlatform } from '@/lib/native/platform';
import { captureNativePhoto } from '@/lib/native/camera';

/**
 * Legger historikk-kopien av bilde 1 i den private bøtta.
 *
 * Kjøres UTEN await fra lagringsflyten: opplastingen skal ikke stå mellom
 * brukeren og resultatet de nettopp betalte en kvoteenhet for. Klientnavigasjon
 * laster ikke dokumentet på nytt, så forespørselen lever videre på
 * resultatsiden.
 *
 * Stille ved feil, med vilje. Mislykkes den, peker image_path på et objekt som
 * ikke finnes, og historikklista viser en plassholder i stedet for et bilde —
 * selve identifiseringen er bevart uansett. Å vise en feil her ville vært å
 * avbryte brukeren for noe de ikke ba om og ikke kan gjøre noe med.
 */
async function lastOppHistorikkbilde(base64: string, path: string): Promise<void> {
  try {
    const blob = await reencodeBase64ForHistory(base64, HISTORY_IMAGE_MAX_DIM, HISTORY_IMAGE_QUALITY);
    await createClient()
      .storage.from(IDENTIFY_HISTORY_BUCKET)
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  } catch {
    // se over
  }
}

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

  // Inntil tre bilder av SAMME sopp i tre FASTE felt: oversikt/hatt,
  // undersiden, stilken. Kindwise tar dem i ÉN identifisering (én kreditt, én
  // kvoteenhet), og deres egen FAQ sier at tre bilder holder. Undersiden er
  // uthevet med vilje: skiver mot årer er selve skillet mellom traktkantarell
  // og dødelig spiss giftslørsopp.
  //
  // Staten er FELT-indeksert (null = tomt felt), ikke en kompakt liste: med
  // en liste ville fjerning av bilde 1 skjøvet undersiden-bildet opp under
  // «Hatt»-etiketten — etikettene skal aldri kunne lyve om innholdet. Hvert
  // felt kan fylles og tas om igjen uavhengig, i valgfri rekkefølge.
  //
  // Forhåndsvisningen er en blob-URL, ikke en data-URL: en data-URL ville
  // vært en full kopi av base64-strengen til (opptil megabyte store) bilder,
  // altså dobbelt minne per bilde på telefoner med lite å gå på.
  type Foto = { base64: string; previewUrl: string };
  const [photos, setPhotos] = useState<(Foto | null)[]>([null, null, null]);
  const [optimizing, setOptimizing] = useState(false);
  // Hvilket felt neste valgte fil skal inn i.
  const targetSlotRef = useRef(0);
  const filled = photos.filter((p): p is Foto => p !== null);

  // Blob-URL-ene må frigis, ellers lekker hvert omtatte bilde til fanen dør.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => {
    return () => {
      for (const p of photosRef.current) if (p) URL.revokeObjectURL(p.previewUrl);
    };
  }, []);

  const handleFile = async (file: File) => {
    setError(null);
    setAiDisabled(false);
    setQuotaMessage(null);
    setOptimizing(true);

    try {
      // One EXIF-free re-encode serves both the AI call and the saved find
      // photo — the raw file (with GPS metadata) never leaves the device.
      const optimizedBase64 = await optimizeImageForIdentification(file);

      // Samme totaltak som serveren (identify-images.ts). Uten denne vakta
      // ville en payload over Vercels 4,5 MB-tak dødd som HTML-413 FØR ruta —
      // brukeren hadde fått rå browser-engelsk i stedet for en forklaring.
      const sumEtter =
        photosRef.current.reduce((s, p, idx) => (p && idx !== targetSlotRef.current ? s + p.base64.length : s), 0) +
        optimizedBase64.length;
      if (sumEtter > MAX_TOTAL_BASE64_CHARS) {
        setError(t('photosTooLarge'));
        return;
      }

      const slot = targetSlotRef.current;
      setPhotos((prev) => {
        const neste = [...prev];
        const gammel = neste[slot];
        if (gammel) URL.revokeObjectURL(gammel.previewUrl);
        neste[slot] = {
          base64: optimizedBase64,
          previewUrl: URL.createObjectURL(base64ToBlob(optimizedBase64, 'image/jpeg'))
        };
        return neste;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('couldNotGetImage'));
    } finally {
      setOptimizing(false);
    }
  };

  const handleIdentify = async () => {
    if (filled.length === 0) return;
    setError(null);
    setAiDisabled(false);
    setQuotaMessage(null);

    try {
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

      // Data-URL-ene bygges først HER: resultat- og lagringsflyten leser dem
      // fra sessionStorage (blob-URL-er overlever ikke serialisering).
      const result = await identify.mutateAsync({
        imagesBase64: filled.map((p) => p.base64),
        originalImageDataUrls: filled.map((p) => `data:image/jpeg;base64,${p.base64}`),
        latitude: coords?.latitude,
        longitude: coords?.longitude
      });

      // Historikkbildet legges opp i bakgrunnen. Ingen await — se
      // lastOppHistorikkbilde. Hopper over hvis serveren ikke fikk skrevet
      // raden: da ville bildet ligget uten noe som peker på det, og
      // retensjonsjobben (som skanner rader) ville aldri funnet det igjen.
      if (result.identificationId && result.historyImagePath) {
        void lastOppHistorikkbilde(filled[0].base64, result.historyImagePath);
      }

      // Kvotefeil HER ville vært grusomt: Kindwise-kallet er alt betalt og
      // kvoteenheten brukt. Tre bilder kan presse sessionStorage-kvoten, så
      // faller full payload, prøver vi igjen med bare første bilde (resultatet
      // og lagringsflyten overlever; stripen med ekstra bilder ofres).
      try {
        sessionStorage.setItem('identifyResult', JSON.stringify(result));
      } catch {
        const slank = { ...result, originalImageDataUrls: [result.originalImageDataUrl] };
        sessionStorage.setItem('identifyResult', JSON.stringify(slank));
      }
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

  const handleCapture = async (slot: number) => {
    targetSlotRef.current = slot;
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
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-forest-700">{t('eyebrow')}</p>
            <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-forest-900">{t('title')}</h1>
          </div>
          <Link
            href="/identifiseringer"
            className="mt-1 shrink-0 text-xs font-semibold text-forest-800 underline"
          >
            {t('historyLink')} →
          </Link>
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
                {/* Rekkefølgen er snudd med vilje: brukeren står med en sopp
                    de vil ha svar på NÅ — det er appens varmeste
                    kjøpsøyeblikk. Selg svaret først, ventingen sist. */}
                <p className="text-sm text-forest-900">{t('quotaUpgradeLead')}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link
                    href="/pricing"
                    className="inline-flex items-center justify-center rounded-lg bg-forest-700 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-800"
                  >
                    {t('quotaUpgradeCta')}
                  </Link>
                  <Button variant="outline" onClick={() => router.push('/species')}>
                    {t('searchDb')}
                  </Button>
                </div>
                <p className="pt-1 text-sm text-forest-900">{quotaMessage}</p>
                <ul className="list-disc pl-5 text-sm text-forest-900">
                  <li>{t('disabledSearchDb')}</li>
                  <li>{t('disabledBrowseSeason')}</li>
                  <li>{t('quotaComeBackTomorrow')}</li>
                </ul>
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
          <div className="mb-3 rounded-xl border-2 border-dashed border-gray-300 p-4 text-center">
            <p className="text-sm text-gray-700">{t('centerHint')}</p>
            {/* «Samme sopp» står eksplisitt: to ULIKE sopper i ett kall kan gi
                en selvsikker kimære-ID der hver del ser riktig ut hver for seg. */}
            <p className="mt-1 text-xs font-medium text-amber-800">{t('sameMushroomHint')}</p>
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
              // Samme fil skal kunne velges på nytt etter fjerning.
              event.target.value = '';
            }}
          />

          {/* Tre merkede felt i stedet for en anonym filliste: feltnavnene ER
              veiledningen, og bilder ligger fast i feltet sitt — fjerning kan
              aldri skyve et undersidebilde inn under «Hatt»-etiketten.
              Undersiden er uthevet — skiver mot årer er skillet som redder
              liv i traktkantarell-sesongen. */}
          <div className="mb-3 grid grid-cols-3 gap-2">
            {(
              [
                [t('slotOverview'), false],
                [t('slotUnderside'), true],
                [t('slotStem'), false]
              ] as const
            ).map(([label, emphasized], i) => {
              const photo = photos[i];
              const venterHer = optimizing && targetSlotRef.current === i;
              return photo ? (
                <div key={label} className="relative overflow-hidden rounded-xl border border-gray-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.previewUrl} alt={label} className="h-24 w-full object-cover" />
                  <button
                    type="button"
                    aria-label={t('removePhoto', { label })}
                    onClick={() =>
                      setPhotos((prev) => {
                        const neste = [...prev];
                        const gammel = neste[i];
                        if (gammel) URL.revokeObjectURL(gammel.previewUrl);
                        neste[i] = null;
                        return neste;
                      })
                    }
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <p className="truncate bg-white px-1.5 py-1 text-[10px] font-medium text-gray-600">{label}</p>
                </div>
              ) : (
                <button
                  key={label}
                  type="button"
                  onClick={() => void handleCapture(i)}
                  disabled={optimizing}
                  className={`flex h-[6.5rem] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-1 text-center text-[11px] font-medium disabled:opacity-40 ${
                    emphasized
                      ? 'border-amber-400 bg-amber-50 text-amber-900'
                      : 'border-gray-300 text-gray-600 hover:border-forest-300'
                  }`}
                >
                  {venterHer ? (
                    <span
                      aria-hidden
                      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                    />
                  ) : (
                    <Camera className="h-4 w-4" aria-hidden />
                  )}
                  {label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filled.length === 0 ? (
              <Button
                onClick={() => void handleCapture(0)}
                loading={optimizing}
                icon={<Camera className="h-4 w-4" />}
              >
                {t('takeOrChoosePhoto')}
              </Button>
            ) : (
              <Button
                onClick={handleIdentify}
                loading={identify.isPending}
                disabled={optimizing}
                icon={<Sparkles className="h-4 w-4" />}
              >
                {t('identifyNow', { count: filled.length })}
              </Button>
            )}
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
