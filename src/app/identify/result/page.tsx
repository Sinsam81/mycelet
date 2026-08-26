'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { IdentifyResult } from '@/components/identify/IdentifyResult';
import { LookAlikeCheck } from '@/components/identify/LookAlikeCheck';
import { ReferencePhotos } from '@/components/identify/ReferencePhotos';
import { SafetyWarning } from '@/components/identify/SafetyWarning';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import { foreslaaVurdering } from '@/lib/vurdering/foreslaa';
import { createClient } from '@/lib/supabase/client';
import { getCurrentPositionOnce } from '@/lib/hooks/useGeolocation';
import {
  lagreDelingsnivaStandard,
  lesDelingsnivaStandard,
  somSynlighet
} from '@/lib/findings/delingsniva';
import { isDangerousEdibility } from '@/lib/utils/edibility';
import { buildUserUploadPath } from '@/lib/storage/upload-path';
import { dataUrlToBlob } from '@/lib/utils/image';
import { IdentifyResultPayload } from '@/types/identify';

function IdentifyResultView() {
  const t = useTranslations('IdentifyResult');
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  // ?id= betyr «vis denne raden fra identifiseringshistorikken igjen».
  // Historikklista lenker HIT i stedet for å ha sin egen lagre-knapp: da er
  // det den samme siden, den samme porten og den samme forvekslingssjekken
  // som gjelder uansett hvor lagringen starter. En egen knapp i lista ville
  // gitt en bekreftelse uten advarselen som gir bekreftelsen mening.
  const searchParams = useSearchParams();
  const historyId = searchParams.get('id');

  const [payload, setPayload] = useState<IdentifyResultPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Synligheten var hardkodet til 'approximate' uten at brukeren ble spurt
  // eller fikk vite det. Et AI-funn tatt på det hemmelige stedet havnet altså
  // som en markør innenfor ±500 m, knyttet til brukernavnet og lesbar for
  // enhver besøkende — og funn kan ikke slettes i appen, så valget var
  // endelig. Standardverdien starter nå på brukerens forrige valg (kun lagret
  // lokalt på enheten — se delingsniva.ts for hvorfor aldri server-side), men
  // velgeren er fortsatt alltid synlig og mulig å endre. Sone-funn krever
  // navn + presisjon og bor derfor fortsatt bare i AddFindingSheet.
  const [visibility, setVisibility] = useState<'public' | 'approximate' | 'private'>(() =>
    somSynlighet(lesDelingsnivaStandard())
  );
  // GPS-redningen: posisjonen hentes i det stille når bildet tas, og et
  // avslag oppdages først her. Før var eneste råd «ta nytt bilde» — som
  // brenner en ny AI-kvoteenhet. Nå kan posisjonen hentes på nytt uten ny
  // identifisering. Ærlig ramme: det er posisjonen der du STÅR nå.
  const [fetchingPosition, setFetchingPosition] = useState(false);
  // The user must actively acknowledge that the AI result is not an edibility
  // guarantee before logging a find — strengthens the duty-of-care posture and
  // stops the result from reading as an authoritative "this is safe to eat".
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (historyId) {
      // Hydrering fra historikken. Ruta kjører sikkerhetsberikelsen PÅ NYTT —
      // den lagrede JSON-en brukes aldri som fasit for forvekslingsarter eller
      // artsnavn, slik at en rad fra i fjor får dagens data og dagens språk.
      let avbrutt = false;
      fetch(`/api/identifications/${encodeURIComponent(historyId)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('kunne ikke hente'))))
        .then((data: IdentifyResultPayload) => {
          if (!avbrutt) setPayload(data);
        })
        .catch(() => {
          if (!avbrutt) router.replace('/identifiseringer');
        });
      return () => {
        avbrutt = true;
      };
    }

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
  }, [router, historyId]);

  const topSuggestion = payload?.suggestions?.[0];
  // Treat unknown/unmapped edibility as dangerous too: a Kindwise suggestion
  // outside our catalog with no mapped edibility must still surface the red
  // warning + Giftinformasjonen, never a soft "inedible" badge. See edibility.ts.
  const isDanger = payload?.suggestions?.some((s) => isDangerousEdibility(s.edibility)) ?? false;

  const handleSave = async () => {
    if (!payload || !topSuggestion) return;
    // Forsvar i dybden: knappen er disabled uten bekreftelse, men porten skal
    // holde selv om noen senere legger til et nytt kallsted (auto-lagring,
    // snarvei). Vaktesten i __tests__/lagre-porten.test.ts låser denne linja.
    if (!acknowledged) return;

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
          // To kilder, avhengig av hvor visningen kom fra:
          //   • data:-URL (fersk identifisering) — dekodes LOKALT, fordi
          //     fetch('data:…') stoppes av connect-src i den håndhevede CSP-en.
          //   • signert https-URL (hydrert fra historikken) — der ligger bildet
          //     i den private bøtta, og må hentes ned før det kan legges i den
          //     offentlige funn-bøtta. supabase.co står i connect-src.
          const blob = payload.originalImageDataUrl.startsWith('data:')
            ? dataUrlToBlob(payload.originalImageDataUrl)
            : await (await fetch(payload.originalImageDataUrl)).blob();
          const fileName = buildUserUploadPath(user.id);
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

      const saveResponse = await fetch('/api/findings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: payload.location.latitude,
          longitude: payload.location.longitude,
          speciesId: chosen.speciesId ?? null,
          speciesNameOverride: chosen.name,
          aiUsed: true,
          aiTopSuggestion: topSuggestion.name,
          aiConfidence: topSuggestion.probability / 100,
          aiRawResponse: { suggestions: payload.suggestions, confirmedIndex: selectedIndex },
          visibility,
          userConfirmedSpecies: true,
          imageUrl,
          thumbnailUrl: imageUrl,
          isZoneFinding: false,
          isNegativeObservation: false
        })
      });

      if (!saveResponse.ok) {
        const body = await saveResponse.json().catch(() => null);
        throw new Error(body?.error || t('errorSaveFailed'));
      }
      // Koble historikkraden til funnet, slik at lista kan vise «lagret som
      // funn» i stedet for å invitere til en duplikat-lagring. Best effort:
      // funnet ER lagret, og en feilet kobling skal ikke se ut som at det ikke
      // gikk. Verste utfall er at raden kan lagres én gang til.
      if (payload.identificationId) {
        const lagretFunnId = (await saveResponse.json().catch(() => null))?.id;
        if (lagretFunnId) {
          await fetch(`/api/identifications/${encodeURIComponent(payload.identificationId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ findingId: lagretFunnId })
          }).catch(() => undefined);
        }
      }

      toast.success(t('saveSuccess'));
      // Gyllent øyeblikk: brukeren fotograferte, identifiserte og LAGRET et
      // funn. Spør (maks én gang noensinne, kun i appskallet) om en
      // App Store-vurdering — reglene bor i lib/vurdering.
      foreslaaVurdering();
      // ?mine=1: kartet åpner med «Kun mine funn» på, så funnet som nettopp
      // ble lagret faktisk SYNES — et privat funn er ellers usynlig i
      // standardlaget (public_findings ekskluderer private), og «lagret!»
      // etterfulgt av et kart uten funnet leses som at lagringen feilet.
      router.push('/map?mine=1');
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

        {/* Always-on framing: the result is a suggestion, never an edibility verdict. */}
        <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900">{t('notAGuarantee')}</p>

        <SafetyWarning level={isDanger ? 'danger' : 'caution'} edibility={topSuggestion?.edibility} />

        {/*
          Serveren fikk ikke lest spiselighet eller forvekslingsarter. Uten
          denne beskjeden ville skjermen sett ut som en art helt uten farlige
          forvekslinger — den mest villedende tilstanden appen kan vise.
        */}
        {payload.safetyDataIncomplete ? (
          <p
            role="alert"
            className="rounded-xl border-2 border-amber-500 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900"
          >
            ⚠️ {t('safetyDataIncomplete')}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-2xl bg-white shadow-card">
          {/* Bildet kan mangle når visningen er hydrert fra historikken (gammel
              rad, eller en opplasting som aldri kom fram). En plassholder som
              sier fra er bedre enn et knekt bilde. */}
          {payload.originalImageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={payload.originalImageDataUrl} alt={t('imageAlt')} className="h-56 w-full object-cover" />
          ) : (
            <div className="flex h-56 w-full flex-col items-center justify-center gap-1 bg-gray-100 text-sm text-gray-600">
              <span aria-hidden className="text-4xl">🍄</span>
              {t('historyImageMissing')}
            </div>
          )}
          {/* Alle innsendte bilder vises — brukeren skal SE hva som ble
              analysert (to ulike sopper i ett kall kan gi en selvsikker
              kimære-ID; stripen gjør blandingen synlig). Hero-bildet over ER
              bilde 1, så stripen begynner på bilde 2 — og alt-tekstene er
              nummererte, ikke tre like på rad for en skjermleser. Feltet
              mangler i payloads fra før flerbilde — da vises bare heroen. */}
          {payload.originalImageDataUrls && payload.originalImageDataUrls.length > 1 ? (
            <div className="flex gap-1 bg-white p-1">
              {payload.originalImageDataUrls.slice(1).map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={url}
                  alt={t('photoAltIndexed', { n: i + 2, total: payload.originalImageDataUrls!.length })}
                  className="h-14 w-14 rounded object-cover"
                />
              ))}
            </div>
          ) : null}
        </div>

        <p className="text-sm text-gray-700">{t('chooseSpeciesPrompt')}</p>
        <IdentifyResult
          suggestions={payload.suggestions.slice(0, 3)}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
        />

        {/* Sammenligningen FØR forvekslingssjekken: brukeren skal alltid møte
            den farlige tvillingen ETTER å ha latt seg overbevise av likheten —
            forvekslingssjekken får siste ord. */}
        <ReferencePhotos
          suggestion={payload.suggestions[selectedIndex] ?? topSuggestion}
          userPhotoUrl={payload.originalImageDataUrl}
        />

        <LookAlikeCheck suggestion={payload.suggestions[selectedIndex] ?? topSuggestion} />

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {/* GPS-redningen vises PROAKTIVT — før var manglende posisjon en
            blindvei som først ble oppdaget etter «Lagre», med «ta nytt bilde»
            (= ny AI-kvoteenhet) som eneste råd. Kopien er ærlig om at dette er
            posisjonen der brukeren STÅR, ikke nødvendigvis der bildet ble
            tatt (EXIF strippes bevisst før opplasting). */}
        {payload.location.latitude == null || payload.location.longitude == null ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p>{t('missingGpsNotice')}</p>
            <Button
              variant="outline"
              className="mt-2"
              loading={fetchingPosition}
              onClick={async () => {
                setError(null);
                setFetchingPosition(true);
                try {
                  const coords = await getCurrentPositionOnce();
                  const updated = {
                    ...payload,
                    location: { latitude: coords.latitude, longitude: coords.longitude }
                  };
                  setPayload(updated);
                  // Rydd en eventuell «GPS mangler»-feil fra et lagre-forsøk
                  // som rakk å skje mens hentingen pågikk.
                  setError(null);
                  // Overlever en reload — samme kilde resultatsiden leser fra.
                  try {
                    sessionStorage.setItem('identifyResult', JSON.stringify(updated));
                  } catch {
                    // Kun et bekvemmelighetslager; selve lagringen bruker state.
                  }
                  toast.success(t('locationSet'));
                } catch {
                  setError(t('locationFailed'));
                } finally {
                  setFetchingPosition(false);
                }
              }}
            >
              {t('fetchLocation')}
            </Button>
          </div>
        ) : null}

        <label className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-800">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>{t('acknowledgeLabel')}</span>
        </label>

        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <label className="block text-sm font-medium text-gray-800">
            {t('sharingLevel')}
            <select
              value={visibility}
              onChange={(event) => {
                const valgt = event.target.value as 'public' | 'approximate' | 'private';
                setVisibility(valgt);
                // Husk valget lokalt (aldri server-side — se delingsniva.ts),
                // så «alltid privat»-brukeren slipper å velge om igjen per funn.
                lagreDelingsnivaStandard(valgt);
              }}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="public">{t('sharingPublic')}</option>
              <option value="approximate">{t('sharingApproximate')}</option>
              <option value="private">{t('sharingPrivate')}</option>
            </select>
          </label>
          <p className="mt-2 text-xs text-gray-600">{t('sharingHelp')}</p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {payload.savedFindingId ? (
            // Allerede lagret. Lagre-knappen skjules i stedet for å deaktiveres:
            // en grå knapp forklarer ingenting, og to funn på samme sopp fra
            // samme bilde er støy i brukerens eget kart.
            <Button variant="outline" onClick={() => router.push('/map?mine=1')}>
              {t('alreadySaved')}
            </Button>
          ) : (
            <Button onClick={handleSave} loading={saving} disabled={!acknowledged || fetchingPosition}>
              {t('saveAsFinding')}
            </Button>
          )}
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

/**
 * useSearchParams() krever Suspense for at Next skal kunne prerendere sida —
 * samme mønster som /auth/login, /forum/new og /pricing. Uten wrapperen feiler
 * `npm run build`, ikke kjøretiden, så den er lett å glemme.
 */
export default function IdentifyResultPage() {
  return (
    <Suspense
      fallback={
        <PageWrapper>
          <p className="text-sm text-gray-700">…</p>
        </PageWrapper>
      }
    >
      <IdentifyResultView />
    </Suspense>
  );
}
