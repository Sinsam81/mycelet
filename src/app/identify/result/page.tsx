'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { IdentifyResult } from '@/components/identify/IdentifyResult';
import { LookAlikeCheck } from '@/components/identify/LookAlikeCheck';
import { ReferencePhotos } from '@/components/identify/ReferencePhotos';
import { SafetyWarning } from '@/components/identify/SafetyWarning';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import { foreslaaVurdering } from '@/lib/vurdering/foreslaa';
import { createClient } from '@/lib/supabase/client';
import { finnFerskPosisjon } from '@/lib/map/fersk-posisjon';
import {
  lagreDelingsnivaStandard,
  lesDelingsnivaStandard,
  somSynlighet
} from '@/lib/findings/delingsniva';
import { isDangerousEdibility } from '@/lib/utils/edibility';
import { buildUserUploadPath } from '@/lib/storage/upload-path';
import { dataUrlToBlob } from '@/lib/utils/image';
import { erLavBildelikhet } from '@/lib/identifications/config';
import { merkOktresultatSomLagret } from '@/lib/identifications/okt-resultat';
import { lesLagreSvar } from '@/lib/findings/funn-kall';
import {
  erOmtrentligMaaletid,
  maaltTidspunkt,
  posisjonsalder,
  velgResultatposisjon,
  type NaaMaaling,
  type Posisjonsvalg
} from '@/lib/findings/resultatposisjon';
import { IdentifyResultPayload } from '@/types/identify';

/**
 * Resultatet slik siden holder det. To felt utover det identifiseringen ga,
 * begge for å vite hvor gammel posisjonen er (se resultatposisjon.ts):
 * `posisjonSettMs` settes her første gang et ferskt resultat leses, og
 * `createdAt` kommer med når visningen er hydrert fra historikken.
 */
type Resultat = IdentifyResultPayload & { posisjonSettMs?: number; createdAt?: string };

/** Hvor ofte alderen på posisjonen regnes på nytt mens siden står åpen. */
const ALDER_TIKK_MS = 30_000;

/** Klokka, lest i hendelser og effekter — aldri under rendring. */
const klokke = () => Date.now();

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

  const [payload, setPayload] = useState<Resultat | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Synligheten var hardkodet til 'approximate' uten at brukeren ble spurt
  // eller fikk vite det. Et AI-funn tatt på det hemmelige stedet havnet altså
  // som en markør innenfor ±500 m, knyttet til brukernavnet og lesbar for
  // enhver besøkende — uten at noen hadde valgt det. (Delingen kan endres og
  // funnet slettes senere under Mine steder, men et punkt som først har vært
  // offentlig, kan andre alt ha sett.) Standardverdien starter nå på
  // brukerens forrige valg (kun lagret lokalt på enheten — se delingsniva.ts
  // for hvorfor aldri server-side), men velgeren er fortsatt alltid synlig og
  // mulig å endre. Sone-funn krever
  // navn + presisjon og bor derfor fortsatt bare i AddFindingSheet.
  const [visibility, setVisibility] = useState<'public' | 'approximate' | 'private'>(() =>
    somSynlighet(lesDelingsnivaStandard())
  );
  // Hvor funnet lagres. Posisjonen identifiseringssiden målte, brukes uten
  // spørsmål bare mens den er fersk; ellers velger brukeren mellom den og
  // «der jeg står nå» (målt på nytt). Reglene står i resultatposisjon.ts.
  //
  // GPS-redningen er det samme valget når posisjonen mangler helt: før var
  // eneste råd «ta nytt bilde» — som brenner en ny AI-kvoteenhet. Målingen er
  // FERSK (finnFerskPosisjon), ikke det vanlige engangsoppslaget i
  // useGeolocation.ts, som kan gi en posisjon opptil to minutter gammel — og
  // eldre i iOS-skallet.
  const [posisjonsvalg, setPosisjonsvalg] = useState<Posisjonsvalg | null>(null);
  const [naaMaaling, setNaaMaaling] = useState<NaaMaaling | null>(null);
  const [fetchingPosition, setFetchingPosition] = useState(false);
  const maalingRef = useRef<AbortController | null>(null);
  const [naaMs, setNaaMs] = useState(klokke);
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
      const lest = JSON.parse(raw) as Resultat;
      // Første gang resultatet leses, stemples tiden — siden åpnes rett etter
      // svaret, så det er omtrent da posisjonen ble målt. Skrives tilbake, så
      // en ny lasting senere ikke gjør en gammel posisjon fersk igjen.
      if (lest.posisjonSettMs === undefined && lest.location?.latitude != null) {
        lest.posisjonSettMs = klokke();
        try {
          sessionStorage.setItem('identifyResult', JSON.stringify(lest));
        } catch {
          // Full sessionStorage: alderen gjelder da bare denne visningen.
        }
      }
      setPayload(lest);
    } catch {
      router.replace('/identify');
    }
  }, [router, historyId]);

  // Alderen regnes på nytt mens siden står åpen: en posisjon som var fersk da
  // siden åpnet, skal ikke lagres i stillhet en time senere.
  useEffect(() => {
    const tikk = setInterval(() => setNaaMs(klokke()), ALDER_TIKK_MS);
    return () => clearInterval(tikk);
  }, []);

  // En måling som pågår når siden forlates, stoppes.
  useEffect(() => () => maalingRef.current?.abort(), []);

  const identifiseringsposisjon =
    payload && payload.location.latitude != null && payload.location.longitude != null
      ? { lat: payload.location.latitude, lng: payload.location.longitude, maaltMs: maaltTidspunkt(payload) }
      : null;
  const posisjon = velgResultatposisjon({
    identifisering: identifiseringsposisjon,
    naa: naaMaaling,
    maalerNaa: fetchingPosition,
    valg: posisjonsvalg,
    naaMs
  });

  const maalNaa = async () => {
    maalingRef.current?.abort();
    const kontroll = new AbortController();
    maalingRef.current = kontroll;
    setPosisjonsvalg('naa');
    setNaaMaaling(null);
    setError(null);
    setFetchingPosition(true);
    try {
      const fix = await finnFerskPosisjon({ signal: kontroll.signal });
      if (kontroll.signal.aborted) return;
      setNaaMaaling({ lat: fix.latitude, lng: fix.longitude, accuracy: fix.accuracy });
      if (!identifiseringsposisjon) toast.success(t('locationSet'));
      // Rydd en eventuell «velg posisjon»-feil fra et lagre-forsøk.
      setError(null);
    } catch {
      if (!kontroll.signal.aborted) setError(t('locationFailed'));
    } finally {
      if (maalingRef.current === kontroll) setFetchingPosition(false);
    }
  };

  const velgIdentifiseringsposisjon = () => {
    maalingRef.current?.abort();
    maalingRef.current = null;
    setFetchingPosition(false);
    setPosisjonsvalg('identifisering');
    setError(null);
  };

  const alderTekst = (maaltMs: number | null) => {
    const alder = posisjonsalder(maaltMs, naaMs);
    if (!alder) return t('positionAgeUnknown');
    if (alder.enhet === 'naa') return t('positionAgeNow');
    if (alder.enhet === 'minutter') return t('positionAgeMinutes', { count: alder.antall });
    if (alder.enhet === 'timer') return t('positionAgeHours', { count: alder.antall });
    return t('positionAgeDays', { count: alder.antall });
  };

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

      // Regnet på nytt med klokka NÅ, ikke den siste tikken: en posisjon som
      // ble gammel siden sist, skal ikke slippe gjennom i stillhet.
      const lagreNaa = klokke();
      const lagresHer = velgResultatposisjon({
        identifisering: identifiseringsposisjon,
        naa: naaMaaling,
        maalerNaa: fetchingPosition,
        valg: posisjonsvalg,
        naaMs: lagreNaa
      });
      if (lagresHer.status !== 'klar') {
        setNaaMs(lagreNaa);
        throw new Error(t(lagresHer.status === 'mangler' ? 'errorMissingGps' : 'positionChooseFirst'));
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
          latitude: lagresHer.punkt.lat,
          longitude: lagresHer.punkt.lng,
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
        // Katalogens tekst, ikke serverens. `body.error || t(...)` viste rutens
        // hardkodede norske tekst til svenske brukere, og den sa ikke mer enn
        // katalogen gjør. Statusen bærer det eneste skillet brukeren kan gjøre
        // noe med.
        throw new Error(saveResponse.status === 401 ? t('errorNotLoggedIn') : t('errorSaveFailed'));
      }
      // Koble historikkraden til funnet, slik at lista kan vise «lagret som
      // funn» i stedet for å invitere til en duplikat-lagring. Best effort:
      // funnet ER lagret, og en feilet kobling skal ikke se ut som at det ikke
      // gikk. Verste utfall er at raden kan lagres én gang til.
      const { id: lagretFunnId, notice } = lesLagreSvar(await saveResponse.json().catch(() => null));
      if (payload.identificationId && lagretFunnId) {
        await fetch(`/api/identifications/${encodeURIComponent(payload.identificationId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ findingId: lagretFunnId })
        }).catch(() => undefined);
      }
      // Resultatet i økta merkes som lagret. Før ble det liggende urørt, så
      // «tilbake» fra kartet ga samme side med en ny lagre-knapp — ett trykk
      // fra et duplikatfunn. Se okt-resultat.ts.
      merkOktresultatSomLagret(sessionStorage, {
        identificationId: payload.identificationId,
        findingId: lagretFunnId,
        fraOkta: !historyId
      });

      // Lagret, men ikke helt som bedt om (i dag: sonevakta gjorde et sone-funn
      // privat). Serverens tekst er på leserens språk, og den skal ikke
      // forsvinne bak en grønn «lagret!» — derfor lenger synlig.
      if (notice) toast(notice.message, { duration: 8000 });
      else toast.success(t('saveSuccess'));
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
      // En brutt forbindelse er en TypeError med nettleserens egen engelske
      // tekst («Load failed»). Feilene vi kaster selv over er alt oversatt.
      setError(err instanceof Error && !(err instanceof TypeError) ? err.message : t('errorSaveFailed'));
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

  // Kvotehintet vises fra og med nest siste gratis-kall — taket skal
  // være kjent FØR veggen treffes, ikke en overraskelse på forsøk seks.
  // /pricing er også native-paywallen (PR #91), så lenken gjelder
  // begge plattformer — samme mønster som kvoteveggen på identify.
  const kvotehint =
    typeof payload.freeQuotaRemaining === 'number' && payload.freeQuotaRemaining <= 1 ? (
      <p className="rounded-lg bg-forest-50 px-3 py-2 text-sm text-forest-900">
        {payload.freeQuotaRemaining === 0
          ? t('quotaHintNone')
          : t('quotaHintSome', { remaining: payload.freeQuotaRemaining })}{' '}
        <Link href="/pricing" className="font-semibold underline">
          {t('quotaHintCta')}
        </Link>
      </p>
    ) : null;

  const bildekort = (
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
  );

  // Tomt svar fra bildegjenkjenningen. Før rendret siden «Velg arten som
  // stemmer» over en tom liste, med avkrysningsboks og en lagre-knapp som ikke
  // gjorde noe — en blindvei brukeren hadde betalt en kvoteenhet for. Her er
  // det ingenting å velge og ingenting å lagre, så alt det skjules; igjen står
  // forklaringen og de to veiene videre. Teksten lover ikke at forsøket var
  // gratis: kreditten hos leverandøren er brukt.
  if (payload.suggestions.length === 0) {
    return (
      <PageWrapper>
        <section className="space-y-4">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-forest-900">{t('title')}</h1>
          <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900">{t('notAGuarantee')}</p>
          {kvotehint}
          {bildekort}
          <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <h2 className="font-serif text-lg font-bold">{t('noSuggestionsTitle')}</h2>
            <p className="mt-1 text-sm">{t('noSuggestionsBody')}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button onClick={() => router.push('/identify')}>{t('takeNewPhoto')}</Button>
            <Button variant="outline" className="w-full" onClick={() => router.push('/forum/new')}>
              {t('askInForum')}
            </Button>
          </div>
        </section>
      </PageWrapper>
    );
  }

  // To beskjeder om at bildegjenkjenningen selv tviler — høyst ÉN vises.
  //   • «Usikker på om dette er en sopp»: KUN ved et eksplisitt false fra
  //     Kindwise. null/udefinert (historikk, gammel sessionStorage, feltet
  //     manglet) er «ukjent» og viser ingenting.
  //   • «Lav bildelikhet»: alle de viste forslagene ligger under terskelen.
  // Ingen av dem sperrer lagring eller endrer forhåndsvalget — brukeren
  // bekrefter arten gjennom porten under uansett. Og ingen av dem sier noe om
  // spiselighet: høy bildelikhet er heller ikke en bekreftet art.
  const visteForslag = payload.suggestions.slice(0, 3);
  const usikkerPaaSopp = payload.isMushroom === false;
  const lavBildelikhet = !usikkerPaaSopp && erLavBildelikhet(visteForslag);

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

        {kvotehint}

        {bildekort}

        {usikkerPaaSopp || lavBildelikhet ? (
          <p
            role="status"
            className="rounded-xl border border-amber-400 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900"
          >
            {usikkerPaaSopp ? t('notMushroomNotice') : t('lowSimilarityNotice')}
          </p>
        ) : null}

        <p className="text-sm text-gray-700">{t('chooseSpeciesPrompt')}</p>
        <IdentifyResult
          suggestions={visteForslag}
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

        {/* Hvor funnet lagres — alltid synlig, så ingen posisjon brukes uten at
            brukeren har sett den og omtrent hvor gammel den er. Vanlig
            tilfelle (bildet tatt og identifisert på stedet) er én linje og
            ingen ekstra trykk. Er posisjonen gammel eller av ukjent alder, må
            brukeren velge. Mangler den, er GPS-redningen her — vist PROAKTIVT,
            ikke først etter «Lagre», og uten å koste en ny AI-kvoteenhet.
            Bildets egen posisjon finnes ikke: EXIF strippes bevisst før
            opplasting. Se src/lib/findings/resultatposisjon.ts. */}
        <div
          className={`rounded-lg border p-3 text-sm ${
            posisjon.status === 'klar'
              ? 'border-gray-200 bg-white text-gray-800'
              : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          <p className="font-medium">{t('positionHeading')}</p>
          {identifiseringsposisjon === null ? (
            <>
              <p className="mt-1">{t('missingGpsNotice')}</p>
              {naaMaaling ? (
                <p className="mt-2">
                  {t('positionHereAccuracy', { accuracy: Math.round(naaMaaling.accuracy) })}{' '}
                  <span className="text-gray-600">
                    {naaMaaling.lat.toFixed(5)}, {naaMaaling.lng.toFixed(5)}
                  </span>
                </p>
              ) : (
                <Button variant="outline" className="mt-2" loading={fetchingPosition} onClick={maalNaa}>
                  {t('fetchLocation')}
                </Button>
              )}
            </>
          ) : posisjonsvalg === null && posisjon.status === 'klar' ? (
            <p className="mt-1">
              {/* Uten fixets egen tid er alderen bare tiden siden siden så
                  resultatet: iOS kan ha gitt en lagret, eldre posisjon. Da
                  lover ikke teksten en presis alder. Se maaltTidspunkt. */}
              {t(payload && erOmtrentligMaaletid(payload) ? 'positionFromIdentifyApprox' : 'positionFromIdentify', {
                age: alderTekst(identifiseringsposisjon.maaltMs)
              })}{' '}
              <span className="text-gray-600">
                {identifiseringsposisjon.lat.toFixed(5)}, {identifiseringsposisjon.lng.toFixed(5)}
              </span>
            </p>
          ) : (
            <fieldset className="mt-1">
              <legend>{t('positionChooseQuestion')}</legend>
              <label className="mt-2 flex min-h-11 items-start gap-2">
                <input
                  type="radio"
                  name="funnposisjon"
                  className="mt-1 h-4 w-4 shrink-0"
                  checked={posisjonsvalg === 'identifisering'}
                  onChange={velgIdentifiseringsposisjon}
                />
                <span>
                  {t('positionChooseIdentify', { age: alderTekst(identifiseringsposisjon.maaltMs) })}{' '}
                  <span className="text-gray-600">
                    {identifiseringsposisjon.lat.toFixed(5)}, {identifiseringsposisjon.lng.toFixed(5)}
                  </span>
                </span>
              </label>
              <label className="flex min-h-11 items-start gap-2">
                <input
                  type="radio"
                  name="funnposisjon"
                  className="mt-1 h-4 w-4 shrink-0"
                  checked={posisjonsvalg === 'naa'}
                  onChange={() => void maalNaa()}
                />
                <span>
                  {t('positionChooseHere')}
                  {posisjonsvalg === 'naa' && fetchingPosition ? (
                    <span className="block text-gray-600" role="status">
                      {t('positionMeasuring')}
                    </span>
                  ) : null}
                  {posisjonsvalg === 'naa' && !fetchingPosition && !naaMaaling ? (
                    // Målingen feilet. Radioknappen står alt valgt, så et nytt
                    // trykk på den gjør ingenting — derfor en egen knapp.
                    <Button variant="outline" className="mt-1" onClick={maalNaa}>
                      {t('fetchLocation')}
                    </Button>
                  ) : null}
                  {posisjonsvalg === 'naa' && naaMaaling ? (
                    <span className="block text-gray-600">
                      {t('positionHereAccuracy', { accuracy: Math.round(naaMaaling.accuracy) })}{' '}
                      {naaMaaling.lat.toFixed(5)}, {naaMaaling.lng.toFixed(5)}
                    </span>
                  ) : null}
                </span>
              </label>
            </fieldset>
          )}
          <p className="mt-2 text-xs text-gray-700">
            {t('positionOtherPlace')}{' '}
            <Link href="/map" className="font-semibold underline">
              {t('positionOnMap')}
            </Link>
            . {t('positionOnMapNote')}
          </p>
        </div>

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
            <Button onClick={handleSave} loading={saving} disabled={!acknowledged || fetchingPosition || posisjon.status !== 'klar'}>
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
