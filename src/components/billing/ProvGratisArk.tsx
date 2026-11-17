'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import type { TILBUD_UTLOSERE } from '@/lib/bruk/bruksdag';
import { fornyelsesTekst, forsteBelastningsTekst } from '@/lib/billing/fornyelse';
import { planLofte } from '@/lib/billing/prove-lofte';
import { passDekning, provearkTekst } from '@/lib/billing/sesongtekst';
import { meldTilbudsarkApent } from '@/lib/billing/tilbudsark-apent';
import { useProveLofte } from '@/lib/hooks/useProveLofte';
import { isNativePlatform } from '@/lib/native/platform';
import { LUKKEKNAPP_KLASSER, useDialogFokus } from '@/components/ui/useDialogFokus';

/** Hva som fikk arket til å vises — samme verdier som bruksdag-raden «tilbud» lagrer. */
export type TilbudUtloser = (typeof TILBUD_UTLOSERE)[number];

/**
 * Arket som vises én gang (to, med et døgns mellomrom) til en gratisbruker
 * som nettopp har fått verdi i kartet, og én gang på forsiden ved første
 * innlogging. Reglene ligger i src/lib/billing/provetilbud.ts. Knappene går
 * til prissiden, som selger via App Store i appen og Stripe på nett — samme
 * sted for begge, med planen valgt (?plan=…).
 *
 * Arket leder med SESONGPASSET. Sju av åtte prøver siden 12. september 2026
 * valgte måned (99 kr, 67 kr netto etter Apple), fordi arket bare leste
 * Premium-tilbudet og passet var det tredje kortet under bretten på
 * prissiden. Et pass gir 169 kr netto med én gang og fornyes i september
 * neste år — det passer et produkt folk bruker ti uker i året. Ærlig ramme:
 * 99 kr dekker resten av denne høsten; argumentet for passet er NESTE sesong,
 * så datoen passet gjelder til står i teksten. «Heller måned for måned?» er
 * synlig og like tydelig — ingenting er forhåndsvalgt, ingen nedtelling.
 *
 * Rekkefølgen i teksten er bevisst: først alle områdene med begrunnelsen bak
 * tallet (det NÅR-per-område-signalet som faktisk er validert), så offline-
 * kartet, og AI-soppkjenneren SIST — ingen hadde brukt den på sju dager da
 * arket ledet med «ubegrenset AI» (docs/konvertering-og-gjenbruk-2026-09.md).
 * «Gratis viser 3 av 12» sies bare når det er det brukeren ser (utløser
 * «begrenset»).
 *
 * Brødteksten følger sesongen, som vilkårsleddet {dekning}: «Alle 12 lovende
 * områder nær deg» står bare juli–oktober. Fra november til juni finner
 * ⭐ Lovende ofte ingenting å vise, også for betalende, så der sier arket det
 * rett ut i stedet for å selge en prøveuke på en knapp som svarer «for svake»
 * (sesongtekst.ts → lovendeLofte). «Begrenset» beholder sin tekst: den vises
 * bare etter at kartet har vist lovende områder.
 *
 * Løftet om en gratis uke står bare når det er sant FOR DEN PLANEN: på nett
 * gir Stripe den til nye abonnenter på begge; i appen bare når App Store gir
 * den på akkurat det produktet (useProveLofte, per plan). Har passet ingen
 * gratisuke i butikken, selges det til pris — «Kjøp Sesongpass» — mens
 * månedslinja kan ha sin egen gratisuke.
 *
 * Med gratisuke sier vilkårene BEGGE datoene: når det betalte året begynner
 * (kjøpsdag + prøvedager — der begynner det både hos Stripe og Apple), og at
 * passet gjelder ett år fra DEN dagen. Første utgave regnet passet fra
 * kjøpsdagen og nevnte aldri første belastning; «gjelder til september 2027,
 * deretter 249 kr» leste som et gratis år, og Apple krever datoen for første
 * belastning ved introduksjonstilbud (3.1.2). Er prøvens lengde ukjent, sies
 * ingen dato — heller ingen enn en gal.
 *
 * Fristen for å avslutte er IKKE den samme. Stripe fakturerer ved trial_end,
 * så på nett er prøveslutt fristen («om du ikke avslutter før {dato}»). Apple
 * forsøker trekket i løpet av det siste døgnet FØR prøven slutter (kanal.ts /
 * avslutningsfrist). Sto nettutgaven i appen, kunne en som avsluttet kvelden
 * før prøveslutt alt være belastet årsprisen. I appen (isNativePlatform)
 * sier vilkårene derfor «senest 24 timer før prøveperioden er over», samme
 * frist som statuskortet og påminnelsen gir etter kjøpet. Ikke et klokkeslett:
 * prøvens lengde kommer fra RevenueCat som «P1M» = 30 dager, og en måned som
 * begynner i februar er kortere, så et utregnet tidspunkt kunne ligget etter
 * Apples.
 *
 * Portal til <body>: kartets verktøyrad har en CSS-transform, og position:fixed
 * inni en transformert forelder får forelderen som ramme.
 */
export function ProvGratisArk({
  onIkkeNaa,
  onStart,
  utloser
}: {
  onIkkeNaa: () => void;
  onStart: () => void;
  utloser: TilbudUtloser;
}) {
  const t = useTranslations('ProvGratisArk');
  const locale = useLocale();
  const lofte = useProveLofte();
  // Escape = «Ikke nå», samme som et trykk på bakteppet — aldri «start».
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFokus(panelRef, { aapen: true, onLukk: onIkkeNaa });
  // Mens arket ligger her, skal ingen annen flate stille sitt eget spørsmål
  // under det (tilbudsark-apent.ts). Ett spørsmål om gangen.
  useEffect(() => meldTilbudsarkApent(), []);

  // Måling: at tilbudet ble vist, og hva som utløste det (bruksflate «tilbud»,
  // migrasjon 068; utløseren i omrade-kolonnen). Uten dette vet vi ikke om
  // null prøveperioder betyr «nei takk» eller «aldri sett» — og ikke hvilken
  // utløser som faktisk fører til prissiden.
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.webdriver) return;
    fetch('/api/me/bruksdag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flate: 'tilbud', omrade: utloser }),
      keepalive: true
    }).catch(() => {});
  }, [utloser]);
  if (typeof document === 'undefined') return null;

  const begrenset = utloser === 'begrenset';
  const pass = planLofte(lofte, 'season_pass');
  const maaned = planLofte(lofte, 'premium');
  // Prøvedagene passet faktisk får (0 uten gratisuke) skyver både første
  // belastning og året passet gjelder. Én kilde for datoene (fornyelse.ts),
  // så arket og prissiden aldri sier to ulike.
  const passProveDager = pass?.harProve ? pass.proveDager : 0;
  const passDato = fornyelsesTekst('season_pass', locale, passProveDager ?? 0);

  const tittel = begrenset
    ? t('tittel')
    : !pass
      ? t('tittelUkjent')
      : !pass.harProve
        ? t('tittelPassUtenProve', { pris: pass.pris })
        : pass.proveDager === null
          ? t('tittelPassProveUkjentLengde')
          : t('tittelPassProve', { dager: pass.proveDager });
  // Hva passet dekker følger sesongen: «resten av høsten nå» sto ubetinget og
  // ble vist også i januar. Bare dette leddet varierer — første belastning,
  // pris, fornyelse og avslutning står likt i alle varianter (sesongtekst.ts).
  // Brødteksten følger også sesongen (provearkTekst), med samme «nå».
  // Trygt å regne i render: komponenten returnerer null uten document (over)
  // og tegnes gjennom en portal, så ingenting av dette er servertegnet.
  const naa = new Date();
  const dekning = t(passDekning(naa));
  const brodtekst = t(begrenset ? 'tekst' : provearkTekst(naa));
  // I appen selger App Store, og Apples frist for å avslutte en prøve ligger
  // ett døgn før prøveslutt (se doc-kommentaren over). Synkront og trygt i
  // render av samme grunn som datoen: arket tegnes bare i nettleseren.
  const app = isNativePlatform();
  const vilkaar = !pass
    ? t('vilkaarUtenProve')
    : !pass.harProve
      ? t('passVilkaar', { dato: passDato, dekning })
      : passProveDager === null
        ? t(app ? 'passVilkaarProveUkjentLengdeApp' : 'passVilkaarProveUkjentLengde', { pris: pass.pris, dekning })
        : t(app ? 'passVilkaarProveApp' : 'passVilkaarProve', {
            dager: passProveDager,
            forsteBelastning: forsteBelastningsTekst(passProveDager, locale),
            pris: pass.pris,
            dato: passDato,
            dekning
          });
  const start = !pass ? t('sePass') : pass.harProve ? t('provPass') : t('kjopPass');
  // «Heller måned for måned?» — bare med butikkens pris, og med gratisuke bare når Premium har en.
  const maanedTekst = !maaned
    ? null
    : !maaned.harProve
      ? t('maanedValg', { pris: maaned.pris })
      : maaned.proveDager === null
        ? t('maanedValgProveUkjentLengde', { pris: maaned.pris })
        : t('maanedValgProve', { pris: maaned.pris, dager: maaned.proveDager });

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="provetilbud-tittel"
      onClick={onIkkeNaa}
      className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/40 p-3 sm:items-center"
    >
      {/* Passvilkårene gjør arket høyere enn før; på en liten telefon (iPhone SE, 667 px)
          skal «Ikke nå» fortsatt nås — arket ruller heller enn å skyve knappen ut. */}
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="provetilbud-tittel" className="font-serif text-xl font-semibold text-forest-900">
            {tittel}
          </h2>
          <button type="button" aria-label={t('lukk')} onClick={onIkkeNaa} className={LUKKEKNAPP_KLASSER}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">{brodtekst}</p>
        <p className={pass ? 'mt-2 text-sm leading-relaxed text-gray-700' : 'mt-1 text-xs text-gray-500'}>{vilkaar}</p>
        <div className="mt-4 flex flex-col gap-2">
          <Link
            href="/pricing?plan=season_pass"
            onClick={onStart}
            className="rounded-xl bg-forest-800 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-forest-900"
          >
            {start}
          </Link>
          {maanedTekst ? (
            <Link
              href="/pricing?plan=premium"
              onClick={onStart}
              className="rounded-xl border border-gray-300 px-4 py-2.5 text-center text-sm font-medium text-forest-900 hover:bg-gray-50"
            >
              {maanedTekst}
            </Link>
          ) : null}
          <button type="button" onClick={onIkkeNaa} className="rounded-xl px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
            {t(utloser === 'start' ? 'fortsettGratis' : 'ikkeNaa')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
