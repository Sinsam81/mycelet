'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { ChevronDown, Eye, Loader2, Lock, Pencil, Share2, Trash2 } from 'lucide-react';
import type { FunnIKort } from '@/lib/findings/mine-funn';
import { EndreDelingArk } from './EndreDelingArk';
import { endreFunn, gjenopprettFunn, slettFunn, utdatertGrunn } from '@/lib/findings/funn-kall';

/**
 * Funnene under ett sted på Mine steder — og det eieren kan gjøre med dem.
 *
 * Kortene viste bare summen: «3 funn · 2 arter». Det fantes ingen vei fra et
 * sted til funnene som utgjør det, og derfor ingen måte å rette et notat,
 * skjule et funn som var delt av gammel vane, eller slette en dobbeltføring
 * uten å lete det opp som en nål på kartet.
 *
 * Lista rendres først når kortet åpnes. Radene ligger i sidens data uansett
 * (de er hentet for å bygge kortene), men tusen funn skal ikke bli tusen
 * rader i HTML-en for den som bare ser over stedene sine.
 *
 * router.refresh() etter hver endring, ikke lokal state: lista er bygget på
 * serveren av radene eieren får lese, og «Nylig slettet» nederst på siden skal
 * oppdatere seg i samme slag. Samme valg som SlettIdentifisering.
 *
 * ARTEN kan ikke endres herfra ennå. Ruta tar imot det, men artsvelgeren
 * finnes bare innebygd i AddFindingSheet og kartfilteret — en tredje kopi her
 * ville vært en ny ting å holde i takt.
 */
export function StedetsFunn({
  funn,
  angrefristDager,
  stedId,
  apneFunnId = null
}: {
  funn: FunnIKort[];
  angrefristDager: number;
  /**
   * Id-en til kortets overskrift (stedsnavnet). Alle kortene har en knapp som
   * heter «Vis funnene»; med denne leser en skjermleser hvilket sted den hører til.
   */
  stedId?: string;
  /**
   * Funnet kartets popup lenket til (`?funn=<id>`). Står det under dette
   * stedet, er lista åpen fra start og funnet markert — ellers måtte eieren
   * lete det opp blant stedene igjen.
   */
  apneFunnId?: string | null;
}) {
  const t = useTranslations('MineSteder');
  const [aapen, setAapen] = useState(() => apneFunnId != null && funn.some((f) => f.id === apneFunnId));
  const listeId = useId();

  if (funn.length === 0) return null;

  return (
    <div className="border-t border-gray-100">
      <button
        type="button"
        aria-expanded={aapen}
        aria-controls={aapen ? listeId : undefined}
        aria-describedby={stedId}
        onClick={() => setAapen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-left text-xs font-semibold text-forest-800 hover:bg-forest-50"
      >
        <span>{aapen ? t('hideFinds') : t('showFinds', { count: funn.length })}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${aapen ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {aapen ? (
        <ul id={listeId} className="divide-y divide-gray-100 border-t border-gray-100">
          {funn.map((f) => (
            <FunnRad key={f.id} funn={f} angrefristDager={angrefristDager} fremhevet={f.id === apneFunnId} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const HANDLING_KLASSER =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold hover:bg-gray-100 disabled:opacity-50';

function FunnRad({
  funn,
  angrefristDager,
  fremhevet = false
}: {
  funn: FunnIKort;
  angrefristDager: number;
  fremhevet?: boolean;
}) {
  const t = useTranslations('MineSteder');
  const tLagring = useTranslations('AddFindingSheet');
  // Samme ord som kartets popup og slettevarsel: «Slett funn» skal ikke hete
  // noe annet her.
  const tPopup = useTranslations('FindingPopup');
  const tKart = useTranslations('MushroomMap');
  const router = useRouter();
  const notatId = useId();
  // Knappene heter det samme på hver rad. Med denne leser en skjermleser
  // hvilket funn «Endre deling», «Endre notat» og «Slett funn» gjelder.
  const funnId = useId();

  const [modus, setModus] = useState<'vis' | 'notat' | 'slett'>('vis');
  const [delingAapen, setDelingAapen] = useState(false);
  const [notat, setNotat] = useState('');
  const [arbeider, setArbeider] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);
  // Satt når serveren har BEKREFTET slettingen, til router.refresh() har
  // hentet lista uten funnet. Ikke en optimistisk gjetning — og angreknappen
  // tar den av igjen: rekker den fram før oppfriskingen, er dette fortsatt
  // samme rad, og den skal ikke bli stående skjult eller i «Sletter …».
  const [slettet, setSlettet] = useState(false);

  // Kom eieren hit fra kartet, rulles funnet fram og får fokus, så tastatur
  // og skjermleser står på det og ikke øverst på siden. Bare ved første
  // visning: senere oppfriskinger skal ikke rykke siden tilbake hit.
  const radRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!fremhevet) return;
    radRef.current?.scrollIntoView?.({ block: 'center' });
    radRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bare ved montering
  }, []);

  const delingEtikett = {
    public: tLagring('sharingPublic'),
    approximate: tLagring('sharingApproximate'),
    zone: tLagring('sharingZone'),
    private: tLagring('sharingPrivate')
  }[funn.deling];

  /**
   * Viser en feil fra et kall. Sier serveren at funnet ikke finnes lenger
   * (slettet i en annen fane eller i appen), hentes lista på nytt — og da
   * forsvinner raden, og feilteksten i den med. Derfor går den beskjeden ut som
   * varsel i stedet.
   */
  const visFeil = (error: unknown, reserve: string) => {
    const tekst = error instanceof Error ? error.message : reserve;
    if (utdatertGrunn(error)) {
      toast.error(tekst);
      router.refresh();
    } else {
      setFeil(tekst);
    }
  };

  const lagreNotat = async () => {
    setArbeider(true);
    setFeil(null);
    try {
      await endreFunn(funn.id, { notes: notat.trim() || null }, t('saveFailed'));
      toast.success(t('noteSaved'));
      setModus('vis');
      router.refresh();
    } catch (error) {
      visFeil(error, t('saveFailed'));
    } finally {
      setArbeider(false);
    }
  };

  const slett = async () => {
    setArbeider(true);
    setFeil(null);
    try {
      await slettFunn(funn.id, tPopup('deleteFailed'));
    } catch (error) {
      visFeil(error, tPopup('deleteFailed'));
      setArbeider(false);
      setModus('vis');
      return;
    }
    setSlettet(true);
    setArbeider(false);
    setModus('vis');

    // Strengene hentes HER, i et tre som har next-intl-provideren. Varselet
    // rendres av <Toaster> et annet sted i treet og må få ferdig tekst. Raden
    // er dessuten borte når angreknappen trykkes — router er appens egen og
    // lever videre, resten er lukket over som verdier.
    const slettetTekst = tKart('findingDeleted');
    const angreTekst = tKart('findingDeleteUndo');
    const tilbakeTekst = tKart('findingRestored');
    const angreFeiletTekst = tKart('findingRestoreFailed');
    const id = funn.id;
    const angre = async () => {
      try {
        await gjenopprettFunn(id, angreFeiletTekst);
        setSlettet(false);
        toast.success(tilbakeTekst);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : angreFeiletTekst);
      }
    };
    toast(
      (item) => (
        <span className="flex items-center gap-3">
          <span>{slettetTekst}</span>
          <button
            type="button"
            onClick={() => {
              toast.dismiss(item.id);
              void angre();
            }}
            className="shrink-0 rounded-full bg-forest-800 px-3 py-1 text-xs font-semibold text-white hover:bg-forest-700"
          >
            {angreTekst}
          </button>
        </span>
      ),
      // Like lenge som på kartet. Går varselet, står funnet under «Nylig
      // slettet» nederst på siden hele angrefristen.
      { duration: 10_000, icon: '🗑️' }
    );
    router.refresh();
  };

  if (slettet) return null;

  return (
    <li
      ref={radRef}
      tabIndex={fremhevet ? -1 : undefined}
      aria-current={fremhevet ? 'true' : undefined}
      className={`px-4 py-3 outline-none ${fremhevet ? 'bg-forest-50 ring-2 ring-inset ring-forest-600' : ''}`}
    >
      <div className="flex items-start gap-3">
        {funn.bilde ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={funn.bilde} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div id={funnId}>
            <p className="text-sm font-semibold text-gray-900">{funn.artsnavn}</p>
            <p className="text-xs text-gray-600">{funn.datoTekst}</p>
          </div>
          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-forest-50 px-2 py-0.5 text-[11px] font-medium text-forest-900">
            {funn.deling === 'private' ? (
              <Lock className="h-3 w-3" aria-hidden />
            ) : (
              <Eye className="h-3 w-3" aria-hidden />
            )}
            {delingEtikett}
          </p>
          {funn.deling === 'zone' && funn.soneNavn ? (
            <p className="mt-1 text-xs text-gray-600">{t('findZone', { label: funn.soneNavn, km: funn.soneKm })}</p>
          ) : null}
          {funn.notat && modus !== 'notat' ? (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">{funn.notat}</p>
          ) : null}
        </div>
      </div>

      {feil ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {feil}
        </p>
      ) : null}

      {modus === 'notat' ? (
        <div className="mt-2 space-y-2">
          <label htmlFor={notatId} className="block text-sm font-medium text-gray-800">
            {t('noteLabel')}
          </label>
          <textarea
            id={notatId}
            value={notat}
            onChange={(event) => setNotat(event.target.value)}
            rows={3}
            maxLength={2000}
            disabled={arbeider}
            placeholder={tLagring('notesPlaceholder')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          {/* Et notat på et funn med eksakt punkt er synlig for alle
              (public_findings). Det skal stå der notatet skrives — og
              «bare for deg» sies med forbeholdet: ruta tar imot en endring
              til eksakt punkt, og da følger notatet med ut. */}
          <p className="text-xs text-gray-600">
            {funn.deling === 'public' ? t('noteVisibleToOthers') : t('noteOnlyYou')}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void lagreNotat()}
              disabled={arbeider}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-forest-800 px-4 text-xs font-semibold text-white hover:bg-forest-700 disabled:opacity-60"
            >
              {arbeider ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {arbeider ? t('saving') : t('save')}
            </button>
            <button
              type="button"
              onClick={() => {
                setModus('vis');
                setFeil(null);
              }}
              disabled={arbeider}
              className="min-h-11 rounded-full border border-gray-300 px-4 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : modus === 'slett' ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm font-medium text-gray-900">{tPopup('deleteConfirmQuestion')}</p>
          {/* Angremuligheten står HER, før klikket — og den peker dit funnet
              faktisk blir liggende, ikke bare på et varsel som går over. */}
          <p className="text-xs text-gray-600">{t('deleteHint', { days: angrefristDager })}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void slett()}
              disabled={arbeider}
              className="min-h-11 rounded-full bg-red-600 px-4 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {arbeider ? tPopup('deleting') : tPopup('deleteConfirm')}
            </button>
            <button
              type="button"
              onClick={() => setModus('vis')}
              disabled={arbeider}
              className="min-h-11 rounded-full border border-gray-300 px-4 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {tPopup('deleteCancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="-mx-1 mt-1 flex flex-wrap gap-x-1">
          <button
            type="button"
            aria-describedby={funnId}
            onClick={() => {
              setFeil(null);
              setDelingAapen(true);
            }}
            className={`${HANDLING_KLASSER} text-forest-800`}
          >
            <Share2 className="h-3.5 w-3.5" aria-hidden /> {t('changeSharing')}
          </button>
          <button
            type="button"
            aria-describedby={funnId}
            onClick={() => {
              setFeil(null);
              setNotat(funn.notat ?? '');
              setModus('notat');
            }}
            className={`${HANDLING_KLASSER} text-forest-800`}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden /> {funn.notat ? t('editNote') : t('addNote')}
          </button>
          <button
            type="button"
            aria-describedby={funnId}
            onClick={() => {
              setFeil(null);
              setModus('slett');
            }}
            className={`${HANDLING_KLASSER} text-red-700`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> {tPopup('delete')}
          </button>
        </div>
      )}

      {delingAapen ? (
        <EndreDelingArk
          funn={funn}
          onLukk={() => setDelingAapen(false)}
          onLagret={() => {
            setDelingAapen(false);
            toast.success(t('sharingSaved'));
            router.refresh();
          }}
          // Serveren sa nei til noe arket trodde var lov: siden er utdatert.
          // Ved en karantene blir arket stående med beskjeden, og valgene
          // følger den nye lista. Er funnet BORTE, forsvinner raden — og arket
          // med den — når lista kommer, så da må beskjeden ut som varsel.
          onUtdatert={(grunn, melding) => {
            if (grunn === 'borte') toast.error(melding);
            router.refresh();
          }}
        />
      ) : null}
    </li>
  );
}
