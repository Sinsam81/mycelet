'use client';

import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFormatter, useTranslations } from 'next-intl';
import { Loader2, X } from 'lucide-react';
import type { DelingsnivaValg } from '@/lib/findings/delingsniva';
import {
  DELING_KARANTENE_TIMER,
  SONE_OMGJORING_AAPEN,
  kanBliSone,
  kreverKarantene
} from '@/lib/findings/delingsendring';
import type { FunnIKort } from '@/lib/findings/mine-funn';
import { LUKKEKNAPP_KLASSER, useDialogFokus } from '@/components/ui/useDialogFokus';
import { endreFunn, utdatertGrunn, type FunnEndring, type UtdatertGrunn } from '@/lib/findings/funn-kall';

/**
 * «Endre deling» for ett funn på Mine steder.
 *
 * Valgene og tekstene er lagringsflatens egne (AddFindingSheet og
 * AI-resultatsiden): samme navn på nivåene, samme forklaring, samme felt for
 * sonenavnet. Et nivå skal ikke hete én ting når du lagrer og noe annet når du
 * angrer.
 *
 * ÉN ting er utelatt med vilje: «Eksakt punkt (offentlig)» kan ikke slås på
 * herfra. Arket finnes for å stramme inn, og å legge ut det eksakte stedet til
 * et funn i etterkant er den ene endringen som ikke kan tas tilbake — den som
 * så punktet, har det. Kallet har ikke engang typen for det (FunnEndring).
 * Et funn som alt er offentlig, vises som det, og kan strammes inn.
 *
 * SONE er heller ikke alltid et valg, og rutestørrelsen kan aldri endres her.
 * Begge deler er begrunnet under «SONERUTA» i delingsendring.ts:
 *  · Sone tilbys bare for et funn som alt ER sone, til migrasjon 075 er
 *    bekreftet kjørt (SONE_OMGJORING_AAPEN). Før den røper sone-stempelet
 *    funnets eksakte breddegrad — det ville vært å tilby «hemmeligsted-
 *    vennlig» som en innstramming, og legge ut mer enn prikken det erstatter.
 *  · Størrelsen vises, uten glidebryter. Hver ny størrelse er en ny rute for
 *    samme funn, og flere ruter snevrer inn hvor stedet er. Kallet sender den
 *    ikke engang: da beholder funnet størrelsen det er lagret med.
 *
 * Karantenen (delingsendring.ts) vises FØR brukeren trykker, begge veier:
 *  · et valg som må vente, er grået ut med tidspunktet det åpner;
 *  · den som er i ferd med å gjøre et funn privat eller til sone, får vite at
 *    omtrentlig deling da ikke kan velges igjen før om et døgn.
 * Det samme gjelder sone så lenge omgjøringen er stengt: den som gjør om et
 * sone-funn, får vite at det ikke kan bli sone igjen herfra.
 * Serveren håndhever reglene uansett — teksten her er for at ingen skal få et
 * nei de ikke kunne se komme.
 *
 * Rendres i en portal til <body>, som GpxKopierModal: arket åpnes fra en rad
 * dypt inne i et kort, og en position:fixed inni en forelder med transform
 * får forelderen som ramme. Kortene har ingen i dag — portalen gjør at arket
 * ikke går i stykker den dagen noen gir dem en.
 */

/** Rekkefølgen fra lagringsflaten, uten det offentlige punktet. */
const VALG: readonly Exclude<DelingsnivaValg, 'public'>[] = ['approximate', 'zone', 'private'];

export function EndreDelingArk({
  funn,
  onLukk,
  onLagret,
  onUtdatert,
  soneOmgjoringAapen = SONE_OMGJORING_AAPEN
}: {
  funn: FunnIKort;
  onLukk: () => void;
  onLagret: () => void;
  /** Bare tester sender denne. Ellers gjelder bryteren i delingsendring.ts. */
  soneOmgjoringAapen?: boolean;
  /**
   * Serveren avviste noe arket trodde var lov — funnet er endret eller slettet
   * et annet sted. Kallstedet henter lista på nytt. `melding` er serverens
   * tekst: arket viser den selv, men er funnet borte, forsvinner arket med
   * raden, og da er det kallstedet som må si det.
   */
  onUtdatert?: (grunn: UtdatertGrunn, melding: string) => void;
}) {
  const t = useTranslations('MineSteder');
  const tLagring = useTranslations('AddFindingSheet');
  const tResultat = useTranslations('IdentifyResult');
  const format = useFormatter();
  const tittelId = useId();
  const gruppeNavn = useId();
  const sperreId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  const [valg, setValg] = useState<DelingsnivaValg>(funn.deling);
  const [soneNavn, setSoneNavn] = useState(funn.soneNavn ?? '');
  const [lagrer, setLagrer] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);
  // Klokka leses én gang, da arket åpnet. Arket monteres per åpning, så den
  // er aldri eldre enn brukerens blikk på valgene.
  const [aapnetMs] = useState(() => Date.now());

  useDialogFokus(panelRef, { aapen: true, onLukk, kanLukkes: !lagrer });

  const etikett: Record<DelingsnivaValg, string> = {
    public: tLagring('sharingPublic'),
    approximate: tLagring('sharingApproximate'),
    zone: tLagring('sharingZone'),
    private: tLagring('sharingPrivate')
  };

  const sperretTil = funn.aapnesTidligst ? Date.parse(funn.aapnesTidligst) : null;
  const iKarantene = sperretTil !== null && sperretTil > aapnetMs;
  const erSperret = (nivaa: DelingsnivaValg) => iKarantene && kreverKarantene(funn.deling, nivaa);
  // Sone er ikke et valg for et funn som ikke kan bli det (se filhodet).
  const valgene = VALG.filter((nivaa) => nivaa !== 'zone' || kanBliSone(funn.deling, soneOmgjoringAapen));

  // Et sone-funn kan også endres uten å bytte nivå: nytt navn. Ruta står.
  const soneEndret = valg === 'zone' && funn.deling === 'zone' && soneNavn.trim() !== (funn.soneNavn ?? '');
  const endret = valg !== funn.deling || soneEndret;
  // Hver lagring starter karantenen på nytt. Den som lagrer et funn som
  // privat eller sone, kan derfor ikke velge omtrentlig det neste døgnet —
  // heller ikke for å angre. Si det før trykket, ikke etter.
  const mistetAngrevei = endret && (valg === 'private' || valg === 'zone');
  // En dør som bare går én vei: et sone-funn som gjøres om mens omgjøring til
  // sone er stengt, har ikke sone som valg neste gang arket åpnes.
  const mistetSone = funn.deling === 'zone' && valg !== 'zone' && !kanBliSone(valg, soneOmgjoringAapen);

  const lukk = () => {
    if (!lagrer) onLukk();
  };

  const lagre = async () => {
    if (valg === 'public' || !endret || erSperret(valg)) return;
    if (valg === 'zone' && !soneNavn.trim()) {
      setFeil(tLagring('errorZoneLabelRequired'));
      return;
    }

    // Ingen rutestørrelse: utelatt betyr «den funnet står med».
    const endring: FunnEndring =
      valg === 'zone'
        ? { visibility: 'approximate', isZoneFinding: true, zoneLabel: soneNavn.trim() }
        : { visibility: valg, isZoneFinding: false };

    setLagrer(true);
    setFeil(null);
    try {
      await endreFunn(funn.id, endring, t('saveFailed'));
      onLagret();
    } catch (error) {
      const melding = error instanceof Error ? error.message : t('saveFailed');
      setFeil(melding);
      setLagrer(false);
      const grunn = utdatertGrunn(error);
      if (grunn) onUtdatert?.(grunn, melding);
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={tittelId}
      onClick={lukk}
      className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/50 p-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] sm:items-center"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl bg-white p-4 shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id={tittelId} className="font-serif text-lg font-semibold text-forest-900">
              {t('changeSharing')}
            </h2>
            <p className="truncate text-xs text-gray-600">
              {funn.artsnavn} · {funn.datoTekst}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('gpxModalClose')}
            onClick={lukk}
            disabled={lagrer}
            className={LUKKEKNAPP_KLASSER}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <p className="mt-3 text-sm text-gray-800">{t('sharingCurrent', { level: etikett[funn.deling] })}</p>
        {funn.deling === 'public' ? (
          <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            {t('sharingPublicNow')}
          </p>
        ) : null}

        <fieldset className="mt-3 space-y-2" disabled={lagrer}>
          <legend className="text-sm font-medium text-gray-800">{tLagring('sharingLevel')}</legend>
          {valgene.map((nivaa) => {
            const sperret = erSperret(nivaa);
            return (
              <div key={nivaa}>
                <label
                  className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                    valg === nivaa ? 'border-forest-700 bg-forest-50' : 'border-gray-300'
                  } ${sperret ? 'text-gray-500' : 'text-gray-900'}`}
                >
                  <input
                    type="radio"
                    name={gruppeNavn}
                    value={nivaa}
                    checked={valg === nivaa}
                    disabled={sperret}
                    // Skjermleseren skal få grunnen sammen med det grå valget.
                    aria-describedby={sperret ? `${sperreId}-${nivaa}` : undefined}
                    onChange={() => {
                      setValg(nivaa);
                      setFeil(null);
                    }}
                    className="h-4 w-4 shrink-0"
                  />
                  <span>{etikett[nivaa]}</span>
                </label>
                {sperret && sperretTil !== null ? (
                  <p id={`${sperreId}-${nivaa}`} className="mt-1 px-1 text-xs leading-relaxed text-gray-600">
                    {t('sharingUnavailableUntil', {
                      time: format.dateTime(new Date(sperretTil), {
                        day: 'numeric',
                        month: 'long',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    })}
                  </p>
                ) : null}
              </div>
            );
          })}
        </fieldset>

        {valg === 'zone' ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-800">{tLagring('zoneInfo')}</p>
            <label className="mt-2 block text-sm font-medium text-gray-800">
              {tLagring('zoneName')}
              <input
                value={soneNavn}
                maxLength={120}
                disabled={lagrer}
                onChange={(event) => {
                  setSoneNavn(event.target.value);
                  setFeil(null);
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder={tLagring('zoneNamePlaceholder')}
              />
            </label>
            {/* Størrelsen vises, men kan ikke endres — se filhodet. */}
            <p className="mt-2 text-sm font-medium text-gray-800">
              {tLagring('zoneGranularity')}:{' '}
              <span className="font-normal">{tLagring('zonePrecisionKm', { km: funn.soneKm })}</span>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">{t('zoneSizeFixed')}</p>
          </div>
        ) : null}

        <p className="mt-3 text-xs leading-relaxed text-gray-600">{tResultat('sharingHelp')}</p>
        {mistetAngrevei ? (
          <p className="mt-2 rounded-lg bg-forest-50 px-3 py-2 text-xs leading-relaxed text-forest-900">
            {t('sharingCooldownHint', { hours: DELING_KARANTENE_TIMER })}
          </p>
        ) : null}
        {mistetSone ? (
          <p className="mt-2 rounded-lg bg-forest-50 px-3 py-2 text-xs leading-relaxed text-forest-900">
            {t('zoneNoWayBack')}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-gray-600">{t('sharingExactNote')}</p>

        {feil ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {feil}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={lukk}
            disabled={lagrer}
            className="min-h-11 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={() => void lagre()}
            // Et valg kan bli sperret MENS arket står åpent: serveren sa nei, og
            // lista er hentet på nytt med karantenen den ikke visste om.
            disabled={lagrer || !endret || erSperret(valg)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-forest-800 px-3 py-2 text-sm font-semibold text-white hover:bg-forest-700 disabled:opacity-60"
          >
            {lagrer ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {lagrer ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
