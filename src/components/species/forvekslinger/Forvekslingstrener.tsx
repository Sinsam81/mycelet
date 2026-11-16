'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { PhotoCredit } from '@/components/ui/PhotoCredit';
import { cn } from '@/lib/utils/cn';
import { readLocal, writeLocal } from '@/lib/utils/safe-storage';
import {
  FORVEKSLINGSTRENER_NOKKEL,
  RUNDE_STORRELSE,
  antallKlarte,
  byggRunde,
  harForvekslingsprosa,
  registrerSvar,
  serialiserTrenerfremdrift,
  tolkTrenerfremdrift,
  type Side,
  type Tilfeldig,
  type TrenerArt,
  type TrenerOppgave,
  type TrenerPar,
  type Trenerfremdrift
} from '@/lib/species/forvekslingstrener';
import { Artsnavn } from '@/components/species/Artsnavn';
import { Sikkerhetslinje } from './Sikkerhetslinje';

/**
 * «Kjenn forvekslingen» — selve øvelsen.
 *
 * Én runde: to arter som forveksles står side om side MED navn, brukeren
 * velger den giftige, og avsløringen viser merkene, hvorfor de forveksles og
 * hvordan de skilles. Reglene for hvilke par som kan vises ligger i
 * src/lib/species/forvekslingstrener.ts — denne fila rendrer bare det den får.
 *
 * Fire ting komponenten aldri gjør:
 *  · viser et bilde uten krediteringslinja (PhotoCredit står under hvert kort,
 *    før og etter svaret)
 *  · gjør øvelsen til bildegjenkjenning — navnene står på kortene fra start,
 *    og «riktig» og «feil» følges av de samme kjennetegnene og den samme
 *    faste sikkerhetslinja
 *  · vurderer en sopp brukeren har funnet, eller kaller noe trygt å spise
 *  · snakker med serveren: ingen bruksdag, ingen konto, ingen varsler.
 *    Fremdriften ligger i lokal lagring på enheten (safe-storage, som tåler at
 *    nettleseren har blokkert lagring) og ellers i minnet ut besøket.
 *
 * Svensk: paret kommer uten prosa (se PROSASPRAK i lib-fila), og komponenten
 * rendrer den uansett ikke for et språk som mangler den. Da vises navn, merker
 * og lenker, og en ærlig setning om at teksten står på artssiden — foreløpig
 * bare på norsk.
 */

interface Runde {
  oppgaver: TrenerOppgave[];
  indeks: number;
  /** Siden brukeren valgte i oppgaven som vises nå. null til det er svart. */
  valgt: Side | null;
  riktige: number;
  ferdig: boolean;
}

// Lagret fremdrift leses gjennom useSyncExternalStore med null som
// serverbilde: serveren har ingen lokal lagring, og en verdi lest i render
// ville gitt ulik HTML på server og klient.
const ingenAbonnering = () => () => {};
const lesLagret = () => readLocal(FORVEKSLINGSTRENER_NOKKEL);
const ingenLagret = () => null;

const SIDER: readonly Side[] = ['venstre', 'hoyre'];

function ArtKort({
  art,
  besvart,
  giftig,
  valgt,
  dittSvar,
  onVelg
}: {
  art: TrenerArt;
  besvart: boolean;
  giftig: boolean;
  valgt: boolean;
  dittSvar: string;
  onVelg: () => void;
}) {
  return (
    <figure
      className={cn(
        // Bare rammen blir rød. En rød flate under ville tatt krediteringslinja
        // (11 px, gray-500) ned til 4,4:1 — under AA.
        'flex flex-col overflow-hidden rounded-xl border-2 bg-white',
        besvart && giftig ? 'border-red-600' : 'border-gray-200'
      )}
    >
      {/* Hele kortet over streken er knappen. Navnet står i klartekst under
          bildet, så bildet selv har tom alt-tekst — knappen heter det arten
          heter, ikke «bilde av …». */}
      <button
        type="button"
        onClick={onVelg}
        disabled={besvart}
        className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-forest-800 enabled:hover:bg-forest-50 disabled:cursor-default"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art.bildeUrl} alt="" className="aspect-[4/3] w-full bg-gray-100 object-cover" />
        <span className="block space-y-0.5 px-2.5 pt-2.5">
          <Artsnavn
            navn={art.navn}
            className="block font-serif text-base font-bold leading-tight text-forest-900"
          />
          {art.latinskNavn ? (
            <span className="block break-words text-xs italic text-gray-600">{art.latinskNavn}</span>
          ) : null}
        </span>
      </button>
      <figcaption className="flex flex-1 flex-col gap-1.5 px-2.5 pb-2.5 pt-1.5">
        {besvart ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <EdibilityBadge edibility={art.spiselighet} />
            {valgt ? (
              <span className="rounded-full border border-gray-500 px-2 py-0.5 text-[11px] font-semibold text-gray-800">
                {dittSvar}
              </span>
            ) : null}
          </div>
        ) : null}
        {/* Utenfor knappen: linja er en lenke til filsiden på Commons, og en
            lenke kan ikke ligge inni en knapp. mt-auto holder den nederst, så
            de to kortene står likt selv når navnene bryter ulikt. */}
        <PhotoCredit
          photographer={art.bildeKreditering.photographer}
          license={art.bildeKreditering.license}
          sourceUrl={art.bildeKreditering.sourceUrl}
          className="mt-auto"
        />
      </figcaption>
    </figure>
  );
}

export function Forvekslingstrener({
  par,
  tilfeldig = Math.random
}: {
  par: TrenerPar[];
  /** Bare for tester. Siden sender den aldri inn (en funksjon kan ikke krysse server/klient-grensen). */
  tilfeldig?: Tilfeldig;
}) {
  const t = useTranslations('Forvekslingstrener');
  // Siden fjerner allerede prosaen for språk som ikke har den. Sjekken her er
  // det andre låset: selv om et par skulle komme inn med norsk tekst, rendres
  // den aldri i en svensk flate.
  const medProsa = harForvekslingsprosa(useLocale());

  const lagret = useSyncExternalStore(ingenAbonnering, lesLagret, ingenLagret);
  // Det som er svart i dette besøket vinner over det lagrede — og er alt vi
  // har når nettleseren har blokkert lagring.
  const [iOkta, setIOkta] = useState<Trenerfremdrift | null>(null);
  const fremdrift = useMemo(() => iOkta ?? tolkTrenerfremdrift(lagret), [iOkta, lagret]);

  const [runde, setRunde] = useState<Runde | null>(null);

  // Hvert steg bytter ut innholdet under fingeren. Fokus flyttes til det nye,
  // så skjermlesere får lest det og tastaturet ikke blir stående på en knapp
  // som nettopp ble slått av.
  const sporsmalRef = useRef<HTMLHeadingElement>(null);
  const svarRef = useRef<HTMLParagraphElement>(null);
  const resultatRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!runde) return;
    if (runde.ferdig) resultatRef.current?.focus();
    else if (runde.valgt) svarRef.current?.focus();
    else sporsmalRef.current?.focus();
  }, [runde]);

  const start = () => {
    const oppgaver = byggRunde(par, { tilfeldig, klarte: fremdrift.klarte });
    if (oppgaver.length === 0) return;
    setRunde({ oppgaver, indeks: 0, valgt: null, riktige: 0, ferdig: false });
  };

  const svar = (side: Side) => {
    if (!runde || runde.ferdig || runde.valgt) return;
    const oppgave = runde.oppgaver[runde.indeks];
    const riktig = side === oppgave.giftigSide;
    // Lagres for hvert svar, ikke ved rundens slutt: en runde som avbrytes
    // halvveis skal ikke ha vært forgjeves.
    const ny = registrerSvar(fremdrift, oppgave.par.nokkel, riktig);
    setIOkta(ny);
    writeLocal(FORVEKSLINGSTRENER_NOKKEL, serialiserTrenerfremdrift(ny));
    setRunde({ ...runde, valgt: side, riktige: runde.riktige + (riktig ? 1 : 0) });
  };

  const neste = () => {
    if (!runde || !runde.valgt) return;
    const siste = runde.indeks >= runde.oppgaver.length - 1;
    setRunde(siste ? { ...runde, ferdig: true } : { ...runde, indeks: runde.indeks + 1, valgt: null });
  };

  const kort = 'rounded-2xl bg-white p-4 shadow-card md:p-6';
  const tekstlenke = 'font-semibold text-forest-800 underline underline-offset-2';
  // 44 px høye rader for lenkene som står for seg selv (ikke inne i en setning).
  const lenkerad = cn('inline-flex min-h-[44px] items-center', tekstlenke);
  // Fokus ruller det nye innholdet inn i bildet. Margene holder det unna den
  // klebrige toppen og den faste bunnmenyen, som ellers ville ligget oppå.
  const fokusmal = 'scroll-mb-32 scroll-mt-32 outline-none';

  // Ingen par oppfyller kravene (bilde med kreditering på begge sider, og
  // teksten om hvordan de skilles). Da sier siden det — den viser ikke en
  // øvelse uten innhold.
  if (par.length === 0) {
    return (
      <section className="space-y-2 rounded-2xl border border-gray-300 bg-gray-50 p-4 text-sm text-gray-800 md:p-6">
        <h2 className="font-serif text-lg font-bold text-forest-900">{t('tomTittel')}</h2>
        <p className="leading-relaxed">{t('tomTekst')}</p>
        <Link href="/species" className={lenkerad}>
          {t('tilBiblioteket')}
        </Link>
      </section>
    );
  }

  if (!runde) {
    const klarte = antallKlarte(par, fremdrift);
    return (
      <section className={cn('space-y-3', kort)}>
        <h2 className="font-serif text-xl font-bold text-forest-900">{t('startTittel')}</h2>
        <p className="text-sm leading-relaxed text-gray-800">
          {t('startTekst', { totalt: par.length, antall: Math.min(RUNDE_STORRELSE, par.length) })}
        </p>
        {klarte > 0 ? (
          <p className="text-sm font-medium text-forest-800">
            {t('fremdriftTotalt', { klarte, totalt: par.length })}
          </p>
        ) : null}
        <Button size="lg" onClick={start}>
          {t('start')}
        </Button>
      </section>
    );
  }

  if (runde.ferdig) {
    return (
      <section className={cn('space-y-3', kort)}>
        <h2
          ref={resultatRef}
          tabIndex={-1}
          className={cn('font-serif text-xl font-bold text-forest-900', fokusmal)}
        >
          {t('ferdigTittel')}
        </h2>
        <p className="text-base text-gray-900">
          {t('ferdigResultat', { riktige: runde.riktige, antall: runde.oppgaver.length })}
        </p>
        <p className="text-sm text-gray-700">
          {t('fremdriftTotalt', { klarte: antallKlarte(par, fremdrift), totalt: par.length })}
        </p>
        {/* Poengene sier hva du har øvd på. Linja under sier hva de IKKE sier noe om. */}
        <Sikkerhetslinje />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button size="lg" onClick={start}>
            {t('nyRunde')}
          </Button>
          <Link href="/species" className={cn('text-sm', lenkerad)}>
            {t('tilBiblioteket')}
          </Link>
        </div>
      </section>
    );
  }

  const oppgave = runde.oppgaver[runde.indeks];
  const paret = oppgave.par;
  const hvorforForveksles = medProsa ? paret.hvorforForveksles : null;
  const slikSkillerDu = medProsa ? paret.slikSkillerDu : null;
  const besvart = runde.valgt !== null;
  const riktig = runde.valgt === oppgave.giftigSide;
  const sistePar = runde.indeks >= runde.oppgaver.length - 1;

  return (
    <section className={cn('space-y-4', kort)}>
      <div className="space-y-1">
        <h2 ref={sporsmalRef} tabIndex={-1} className={fokusmal}>
          <span className="block text-xs font-semibold uppercase tracking-widest text-forest-700">
            {t('fremdrift', { nummer: runde.indeks + 1, antall: runde.oppgaver.length })}
          </span>
          <span className="mt-1 block font-serif text-xl font-bold text-forest-900">{t('sporsmal')}</span>
        </h2>
        <p className="text-sm text-gray-700">{t('sporsmalHjelp')}</p>
      </div>

      {/* key på paret: neste par får nye kort og nye <img>, så forrige bilde
          aldri blir stående mens det nye lastes. */}
      <div key={paret.nokkel} className="grid grid-cols-2 gap-3">
        {SIDER.map((side) => (
          <ArtKort
            key={side}
            art={oppgave[side]}
            besvart={besvart}
            giftig={side === oppgave.giftigSide}
            valgt={runde.valgt === side}
            dittSvar={t('dittSvar')}
            onVelg={() => svar(side)}
          />
        ))}
      </div>

      {besvart ? (
        <div className="space-y-3">
          <p
            ref={svarRef}
            tabIndex={-1}
            className={cn(
              'flex items-start gap-2 font-serif text-lg font-bold leading-snug',
              fokusmal,
              riktig ? 'text-forest-900' : 'text-red-900'
            )}
          >
            {riktig ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-forest-700" aria-hidden="true" />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
            )}
            <span>
              {riktig ? t('riktig', { giftig: paret.giftig.navn }) : t('feil', { giftig: paret.giftig.navn })}
            </span>
          </p>

          {hvorforForveksles ? (
            <p className="text-sm leading-relaxed text-gray-800">
              <span className="font-semibold text-gray-900">{t('hvorforForveksles')}</span>{' '}
              {hvorforForveksles}
            </p>
          ) : null}

          {slikSkillerDu ? (
            <p
              className={cn(
                'rounded-xl p-3 text-sm leading-relaxed',
                paret.faregrad === 'critical' ? 'bg-red-100 text-red-900' : 'bg-orange-100 text-orange-900'
              )}
            >
              <span className="font-bold">{t('slikSkillerDu')}</span> {slikSkillerDu}
            </p>
          ) : (
            // Språket har ingen utgave av teksten (svensk i dag). Da sier vi
            // hvor den står, i stedet for å vise norsk prosa som om den var svensk.
            <p className="rounded-xl bg-gray-100 p-3 text-sm leading-relaxed text-gray-800">
              {t.rich('kjennetegnPaArtssiden', {
                navn: paret.tekstside.navn,
                lenke: (innhold) => (
                  <Link href={`/species/${paret.tekstside.id}`} className="font-semibold underline underline-offset-2">
                    {innhold}
                  </Link>
                )
              })}
            </p>
          )}

          <Sikkerhetslinje />

          <ul className="flex flex-wrap gap-x-5 text-sm">
            {[paret.giftig, paret.annen].map((art) => (
              <li key={art.id}>
                <Link href={`/species/${art.id}`} className={lenkerad}>
                  {t('lesOm', { navn: art.navn })}
                </Link>
              </li>
            ))}
          </ul>

          <Button size="lg" onClick={neste}>
            {sistePar ? t('seResultatet') : t('nestePar')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
