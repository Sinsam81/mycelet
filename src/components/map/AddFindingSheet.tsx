'use client';

import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Camera } from 'lucide-react';
import { buildUserUploadPath } from '@/lib/storage/upload-path';
import { lagreDelingsnivaStandard, lesDelingsnivaStandard } from '@/lib/findings/delingsniva';
import { createClient } from '@/lib/supabase/client';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';
import { Button } from '@/components/ui/Button';
import { TREFF_44 } from './trykkflate';
import { reencodeImageForUpload } from '@/lib/utils/image';
import { applyPositionOffset } from '@/lib/utils/position-offset';
import { isNativePlatform } from '@/lib/native/platform';
import { captureNativePhoto } from '@/lib/native/camera';
import { finnFerskPosisjon } from '@/lib/map/fersk-posisjon';
import {
  SAMME_STED_M,
  formaterAvstand,
  velgFunnposisjon,
  type GpsMaaling,
  type Posisjonskilde,
  type Punkt
} from '@/lib/map/funnposisjon';
import { formatUncertaintyMeters } from '@/lib/utils/occurrence-filters';

/** Så nøyaktig må den ferske målingen være før letingen gir seg tidlig. */
const POSISJON_MAAL_M = 30;
/**
 * Lenger enn dette holder vi ikke «Lagre» igjen for å finne posisjonen. Regnet
 * fra letingen starter: spør telefonen først om tillatelse, går ikke tiden
 * dialogen står oppe av disse sekundene (se vakthunden i fersk-posisjon.ts).
 */
const POSISJON_FRIST_MS = 8_000;

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
  /**
   * Kartsenteret da brukeren trykket pluss — den ene av de to posisjonene et
   * funn kan lagres på. Den andre måler skjemaet selv, på nytt, i det det
   * åpnes.
   *
   * Skjemaet tok tidligere imot kartets GPS-posisjon som egenskap. Den var målt
   * da kartet ble åpnet og vant alltid over kartsenteret: åpnet du kartet på
   * parkeringsplassen og gikk førti minutter, ble funnet lagret på
   * parkeringsplassen, og hjemmefra ble det lagret hjemme uansett hvor du
   * flyttet kartet. Derfor finnes det ingen GPS-egenskap lenger — en posisjon
   * som ikke er målt nå, skal ikke kunne komme inn her. Reglene for hvilken av
   * de to som lagres står i src/lib/map/funnposisjon.ts.
   */
  kartsenter: Punkt | null;
  /**
   * Har brukeren selv lagt kartet der det står (og ikke appens sentrering på
   * GPS eller plassholderen)? Avgjør om kartsenteret er et sted noen har pekt
   * ut. Se kartErFlyttet.
   */
  kartFlyttet: boolean;
  /** Den ferske målingen, så kartet kan oppdatere sin sist kjente posisjon. */
  onFerskPosisjon?: (posisjon: GpsMaaling) => void;
  onClose: () => void;
  /**
   * sharingMode følger med så kartet kan reagere på synligheten: et privat
   * funn er usynlig i standardlaget (public_findings ekskluderer private), og
   * uten dette leses «lagret!» + et kart uten funnet som at lagringen feilet.
   */
  onSaved: (speciesName?: string, sharingMode?: SharingMode) => void;
  /**
   * Arten brukeren alt har valgt i kartet («Lovende områder for kantarell»).
   * Skjemaet startet tomt uansett, så målarten måtte søkes opp på nytt med
   * våte fingre. Bare et forslag — feltet kan tømmes eller byttes som før.
   */
  initialSpeciesId?: number | null;
  initialSpeciesName?: string | null;
}

interface SpeciesOption {
  id: number;
  norwegian_name: string;
  latin_name: string;
}

export function AddFindingSheet({
  kartsenter,
  kartFlyttet,
  onFerskPosisjon,
  onClose,
  onSaved,
  initialSpeciesId = null,
  initialSpeciesName = null
}: AddFindingSheetProps) {
  const t = useTranslations('AddFindingSheet');
  const locale = useLocale();
  const supabase = useMemo(() => createClient(), []);

  // ── Posisjonen ──────────────────────────────────────────────────────────
  // Måles på nytt hver gang skjemaet åpnes. `gps` er den beste FERSKE målingen
  // så langt; den gamle posisjonen iOS deler ut først, kommer aldri hit.
  const [gps, setGps] = useState<GpsMaaling | null>(null);
  const [soker, setSoker] = useState(true);
  const [valg, setValg] = useState<Posisjonskilde | null>(null);
  // Økes av «Søk på nytt» — starter en ny leting uten å lukke skjemaet (og
  // miste det brukeren har skrevet).
  const [sokNr, setSokNr] = useState(0);
  // Kartet sender en ny funksjon hver gjengivelse; letingen skal ikke starte
  // på nytt av den grunn.
  const onFerskPosisjonRef = useRef(onFerskPosisjon);
  useEffect(() => {
    onFerskPosisjonRef.current = onFerskPosisjon;
  });

  useEffect(() => {
    const avbryter = new AbortController();
    const tilMaaling = (fix: { latitude: number; longitude: number; accuracy: number }): GpsMaaling => ({
      lat: fix.latitude,
      lng: fix.longitude,
      accuracy: fix.accuracy
    });
    finnFerskPosisjon({
      targetAccuracyM: POSISJON_MAAL_M,
      timeoutMs: POSISJON_FRIST_MS,
      signal: avbryter.signal,
      onUpdate: (fix) => {
        if (avbryter.signal.aborted) return;
        // En grov måling er bedre enn å vente: skjemaet kan brukes med en
        // gang, og tallet i etiketten strammes inn etter hvert.
        setGps((forrige) => (!forrige || fix.accuracy <= forrige.accuracy ? tilMaaling(fix) : forrige));
      }
    })
      .then((fix) => {
        if (avbryter.signal.aborted) return;
        setGps(tilMaaling(fix));
        onFerskPosisjonRef.current?.(tilMaaling(fix));
      })
      .catch(() => {
        // Ingen fersk posisjon (avslått, innendørs, tett skog). Ingen
        // feilmelding som varsel: skjemaet sier det selv, og kartsenteret står
        // klart som den andre muligheten.
      })
      .finally(() => {
        if (!avbryter.signal.aborted) setSoker(false);
      });
    // Lukkes skjemaet, stopper letingen — den skal ikke holde GPS-en varm
    // eller blande seg med kartets egen «Finn meg».
    return () => avbryter.abort();
  }, [sokNr]);

  const posisjon = velgFunnposisjon({ gps, soker, kartsenter, kartFlyttet, valg });
  const lagretLat = posisjon.status === 'klar' ? posisjon.lat : null;
  const lagretLng = posisjon.status === 'klar' ? posisjon.lng : null;
  const valgtKilde = posisjon.status === 'klar' ? posisjon.kilde : null;
  const gpsNoyaktighet = gps ? formatUncertaintyMeters(gps.accuracy) : null;

  const sokPaaNytt = () => {
    // Den forrige målingen var fra forrige leting. Den skal ikke bli stående
    // som «der jeg står nå» mens en ny pågår.
    setGps(null);
    setValg((forrige) => (forrige === 'gps' ? null : forrige));
    setSoker(true);
    setSokNr((n) => n + 1);
  };

  /**
   * Det brukeren må vite om posisjonen akkurat nå, eller null når alt er greit.
   * `advarsel` = lagring er mulig, men stedet bør sjekkes; ellers er lagring
   * holdt igjen til brukeren har valgt.
   */
  const posisjonsmelding: { tekst: string; advarsel: boolean } | null = (() => {
    if (posisjon.status === 'maa_velge') {
      if (posisjon.grunn === 'ulike_steder' && posisjon.avstandM != null) {
        return { tekst: t('positionChooseDifferent', { distance: formaterAvstand(posisjon.avstandM) }), advarsel: false };
      }
      if (posisjon.grunn === 'usikker_gps') {
        return { tekst: t('positionChooseUncertain', { accuracy: gpsNoyaktighet ?? '' }), advarsel: false };
      }
      if (posisjon.grunn === 'kart_ikke_flyttet') return { tekst: t('positionChooseMapUntouched'), advarsel: false };
      return { tekst: t('positionChooseGpsMissing'), advarsel: false };
    }
    if (posisjon.status === 'klar' && posisjon.kilde === 'kart' && posisjon.automatisk) {
      return { tekst: t('usingMapCentre'), advarsel: true };
    }
    if (posisjon.status === 'klar' && posisjon.kilde === 'gps' && gps && gps.accuracy > SAMME_STED_M) {
      return { tekst: t('positionUncertain', { accuracy: gpsNoyaktighet ?? '' }), advarsel: true };
    }
    return null;
  })();

  const lagresperreId = useId();
  /** Hvorfor «Lagre» er stengt, eller null når den er åpen. */
  const lagresperre =
    posisjon.status === 'klar'
      ? null
      : posisjon.status === 'venter'
        ? t('positionSearching')
        : posisjon.status === 'ingen'
          ? t('errorNoPosition')
          : t('positionChooseFirst');

  const [findingType, setFindingType] = useState<FindingType>('positive');
  // Forhåndsvalg bare når BÅDE id og navn finnes: en id uten synlig navn ville
  // lagret en art brukeren aldri så. Kartet gir filteret navnet sitt når
  // artslista er lastet (src/lib/map/artsfilter-navn.ts), så dette gjelder det
  // korte øyeblikket før — en dyplenke `?art=` uten `artnavn`, eller et husket
  // utsnitt fra da filterarket kunne velge art uten å sette navnet.
  const forhaandsvalgt = initialSpeciesId && initialSpeciesName ? { id: initialSpeciesId, name: initialSpeciesName } : null;
  const [speciesQuery, setSpeciesQuery] = useState(forhaandsvalgt?.name ?? '');
  const [speciesOptions, setSpeciesOptions] = useState<SpeciesOption[]>([]);
  const [speciesId, setSpeciesId] = useState<number | null>(forhaandsvalgt?.id ?? null);
  const [notes, setNotes] = useState('');
  // Starter på brukerens forrige valg (kun lagret lokalt — se delingsniva.ts);
  // velgeren er alltid synlig, og samme standard gjelder i AI-resultatflyten
  // så de to lagringsflatene aldri viser hver sin «standard».
  const [sharingMode, setSharingMode] = useState<SharingMode>(
    () => lesDelingsnivaStandard() ?? 'approximate'
  );
  const [zoneLabel, setZoneLabel] = useState('');
  const [zonePrecisionKm, setZonePrecisionKm] = useState(5);
  const [positionOffsetMeters, setPositionOffsetMeters] = useState(0);
  // Kursen forskyvningen går i. Den trekkes ÉN gang per slider-verdi, ikke per
  // kall: forhåndsvisningen under skal vise nøyaktig det punktet som lagres.
  // (Retningen må være tilfeldig — se applyPositionOffset. Den var låst til 45°,
  // så alle justerte funn fra samme bruker lå skjøvet samme vei.)
  const [offsetSeed, setOffsetSeed] = useState(() => Math.random());
  const offsetBearing = useCallback(() => offsetSeed, [offsetSeed]);
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
      const file = await captureNativePhoto(locale);
      if (file) setImageFromFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorFetchImage'));
    }
  };

  const uploadImage = async (file: File) => {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error(t('errorNotLoggedIn'));

    // Re-encode via canvas before upload: strips EXIF (incl. GPS), so the
    // photo can't leak the exact spot of an approximate/private find.
    const blob = await reencodeImageForUpload(file);
    const fileName = buildUserUploadPath(user.id);

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
    // Teksten er endret → det som var valgt gjelder ikke lenger. Uten dette
    // fulgte en gammel id med selv om feltet var tømt eller skrevet om.
    setSpeciesId(null);
    if (value.trim().length < 2) {
      setSpeciesOptions([]);
      return;
    }

    const { data } = await supabase
      .from('mushroom_species')
      // Uten swedish_name her får en svensk bruker som skriver «flugsvamp»
      // eller «kremla» null treff, og må gjette det norske navnet for å få
      // registrert arten i det hele tatt. Migrasjon 030 fylte svenske navn for
      // hele artslisten; dette var den siste artssøkingen som ikke brukte dem.
      .select('id,norwegian_name,swedish_name,latin_name')
      .or(
        `norwegian_name.ilike.%${value}%,swedish_name.ilike.%${value}%,latin_name.ilike.%${value}%,synonyms_text.ilike.%${value}%`
      )
      .order('norwegian_name', { ascending: true })
      .limit(8);

    setSpeciesOptions(data ?? []);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    // Knappen er stengt i disse tilstandene, men et skjema kan sendes på andre
    // måter (Enter i et felt). Uten en avklart posisjon lagres ingenting.
    if (lagretLat == null || lagretLng == null) {
      setError(lagresperre ?? t('errorNoPosition'));
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

      const adjusted = applyPositionOffset(lagretLat, lagretLng, positionOffsetMeters, offsetBearing);
      const isNegative = findingType === 'negative';
      const visibility: Visibility = sharingMode === 'zone' ? 'approximate' : (sharingMode as Visibility);
      const isZoneFinding = sharingMode === 'zone';

      // Valideringen FØR bildeopplastingen: et manglende sonenavn skal ikke
      // etterlate et foreldreløst bilde i finding-images-bøtta — og med husket
      // sone-standard åpner arket oftere i sonemodus, så feilen ble vanligere.
      if (isZoneFinding && !zoneLabel.trim()) {
        throw new Error(t('errorZoneLabelRequired'));
      }

      // No image for negative observations — there's nothing to photograph.
      const imageUrl = !isNegative && imageFile ? await uploadImage(imageFile) : null;

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
      onSaved(speciesQuery || undefined, sharingMode);
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
            className={`relative flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${TREFF_44} ${
              !isNegative ? 'bg-white text-forest-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            🍄 {t('finding')}
          </button>
          <button
            type="button"
            onClick={() => setFindingType('negative')}
            className={`relative flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${TREFF_44} ${
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
                  setSpeciesQuery(getSpeciesDisplayName(option, locale));
                  setSpeciesOptions([]);
                }}
                className="flex min-h-[44px] w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
              >
                <span className="text-sm">{getSpeciesDisplayName(option, locale)}</span>
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
                  <button
                    type="button"
                    onClick={() => setImageFromFile(null)}
                    className={`relative text-xs font-medium text-red-700 hover:underline ${TREFF_44}`}
                  >
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

        {/* Brukeren skal ALDRI være i tvil om hvilken posisjon som lagres — og
            skal alltid kunne velge den andre. Begge står her hele tiden: «der
            jeg står nå» med nøyaktigheten til den ferske målingen, og «der
            kartet står». Ekte radioknapper, så tastatur og skjermleser får
            gruppa gratis. Ingen er valgt når appen ikke kan avgjøre det selv;
            da står grunnen under, og «Lagre» venter på et trykk. */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-800">{t('positionLegend')}</legend>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
            <label
              className={`flex min-h-[2.75rem] flex-col justify-center rounded-md px-3 py-1.5 transition focus-within:ring-2 focus-within:ring-forest-800 ${
                valgtKilde === 'gps' ? 'bg-white text-forest-900 shadow-sm' : 'text-gray-700'
              } ${gps ? 'cursor-pointer hover:text-gray-900' : 'cursor-not-allowed opacity-70'}`}
            >
              <input
                type="radio"
                name="funnposisjon"
                className="sr-only"
                checked={valgtKilde === 'gps'}
                disabled={!gps}
                onChange={() => setValg('gps')}
              />
              <span className="text-sm font-medium">{t('positionHere')}</span>
              <span className="text-xs">
                {gpsNoyaktighet ?? (soker ? t('positionSearching') : t('positionUnavailable'))}
              </span>
            </label>
            <label
              className={`flex min-h-[2.75rem] flex-col justify-center rounded-md px-3 py-1.5 transition focus-within:ring-2 focus-within:ring-forest-800 ${
                valgtKilde === 'kart' ? 'bg-white text-forest-900 shadow-sm' : 'text-gray-700'
              } ${kartsenter ? 'cursor-pointer hover:text-gray-900' : 'cursor-not-allowed opacity-70'}`}
            >
              <input
                type="radio"
                name="funnposisjon"
                className="sr-only"
                checked={valgtKilde === 'kart'}
                disabled={!kartsenter}
                onChange={() => setValg('kart')}
              />
              <span className="text-sm font-medium">{t('positionMapCentre')}</span>
            </label>
          </div>

          {posisjonsmelding ? (
            <p
              role="status"
              className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                posisjonsmelding.advarsel ? 'bg-amber-50 text-amber-900' : 'bg-forest-50 text-forest-900'
              }`}
            >
              {posisjonsmelding.tekst}
            </p>
          ) : null}

          {/* Ny leting uten å lukke skjemaet: under tette trær kommer målingen
              ofte på andre forsøk, og «Avbryt» ville kastet det som er skrevet. */}
          {!soker && (!gps || gps.accuracy > SAMME_STED_M) ? (
            <button
              type="button"
              onClick={sokPaaNytt}
              className="relative text-xs font-semibold text-forest-800 underline after:absolute after:-bottom-5 after:-top-2 after:left-1/2 after:w-full after:min-w-[44px] after:-translate-x-1/2 after:content-['']"
            >
              {t('positionRetry')}
            </button>
          ) : null}
        </fieldset>

        <label className="block text-sm font-medium text-gray-800">
          {t('adjustPosition')}
          <input
            type="range"
            min={0}
            max={500}
            step={10}
            value={positionOffsetMeters}
            onChange={(event) => {
              setPositionOffsetMeters(Number(event.target.value));
              setOffsetSeed(Math.random());
            }}
            className="mt-2 w-full"
          />
          <span className="text-xs text-gray-600">{t('offset', { meters: positionOffsetMeters })}</span>
        </label>

        {lagretLat != null && lagretLng != null ? (
          <p className="text-xs text-gray-600">
            {t('coordinatePreview', {
              lat: applyPositionOffset(lagretLat, lagretLng, positionOffsetMeters, offsetBearing).lat.toFixed(5),
              lng: applyPositionOffset(lagretLat, lagretLng, positionOffsetMeters, offsetBearing).lng.toFixed(5)
            })}
          </p>
        ) : null}

        <label className="block text-sm font-medium text-gray-800">
          {t('sharingLevel')}
          <select
            value={sharingMode}
            onChange={(event) => {
              const valgt = event.target.value as SharingMode;
              setSharingMode(valgt);
              lagreDelingsnivaStandard(valgt);
            }}
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

        {/* En stengt knapp uten forklaring leses som at appen henger. Grunnen
            står rett over den — posisjonsvalget ligger lenger opp i et langt
            skjema, og er ofte rullet ut av syne når brukeren er her. */}
        {lagresperre ? (
          <p id={lagresperreId} role="status" className="text-xs text-gray-700">
            {lagresperre}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            className="flex-1"
            loading={loading}
            disabled={lagresperre != null}
            aria-describedby={lagresperre ? lagresperreId : undefined}
          >
            {isNegative ? t('logNoFinding') : t('saveFinding')}
          </Button>
        </div>
      </form>
    </div>
  );
}
