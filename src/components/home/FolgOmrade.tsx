'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Check, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  FOLG_OMRADE_KILDE,
  FOLG_OMRADE_NOKKEL,
  avvisningsVerdi,
  skalViseFolgOmrade,
  velgVariant
} from '@/lib/alerts/folg-omrade';
import { TILBUDSARK_ENDRET_EVENT, erTilbudsarkApent } from '@/lib/billing/tilbudsark-apent';
import { readLocal, writeLocal } from '@/lib/utils/safe-storage';

/**
 * «Følg området ditt» — stripa inne i forsidekortet, under dommen.
 *
 * Aldri et sprettoppvindu og aldri et ark: den ligger i kortet brukeren
 * allerede leser, rett under tallet som nettopp ga henne en grunn til å bry
 * seg. Reglene for NÅR den vises ligger i src/lib/alerts/folg-omrade.ts, med
 * tester; her er bare skjermbildet og trykket.
 *
 * ── LØFTET MÅ STÅ FØR TRYKKET ───────────────────────────────────────────────
 *
 * Hyppigheten og veien ut sies FØR knappen, ikke etterpå: én e-post når
 * forholdene snur, aldri mer enn én i uka, avmelding i hver e-post. Det er det
 * samme varselet faktisk gjør (src/lib/alerts/decision.ts) — ikke skriv det om
 * uten å endre beslutningen bak.
 *
 * ── TO VARIANTER ────────────────────────────────────────────────────────────
 *
 * Kjenner kortet brukerens egen posisjon, navngir vi området. Står kortet på
 * standardområdet for språket, navngir vi INGENTING og spør «Hvor plukker du?»
 * — Oslo og Stockholm er fallback for prognosen, ikke en påstand om hvor noen
 * plukker (docs/strategi-2026-2027.md § 1).
 *
 * Abonnementet opprettes bare av trykket. Ingen forhåndsvalgt boks, ingenting
 * som følger med registreringen eller gratisuka.
 */

interface Region {
  navn: string;
  land: 'NO' | 'SE';
}

export function FolgOmrade({
  innlogget,
  /** Serveren så alt en aktiv kontorad — da spør vi ikke i det hele tatt. */
  folgerAlt,
  /** Nærmeste område når kortet regner på brukerens egen posisjon, ellers null. */
  omrade,
  /** «egen» = kortets posisjon er brukerens egen/huskede, «standard» = fallback. */
  posisjonsKilde
}: {
  innlogget: boolean;
  folgerAlt: boolean;
  omrade: string | null;
  posisjonsKilde: 'egen' | 'standard';
}) {
  const t = useTranslations('FolgOmrade');
  const variant = velgVariant({ kilde: posisjonsKilde, omrade });

  const [klar, setKlar] = useState(false);
  const [regioner, setRegioner] = useState<Region[]>([]);
  const [valgt, setValgt] = useState(variant.type === 'kjent' ? variant.omrade : '');
  const [viserVelger, setViserVelger] = useState(variant.type === 'sporre');
  const [lagrer, setLagrer] = useState(false);
  const [feilet, setFeilet] = useState(false);
  const [bekreftet, setBekreftet] = useState<string | null>(null);
  const [avvistNaa, setAvvistNaa] = useState(false);
  const [arkApent, setArkApent] = useState(false);
  const spurt = useRef(false);
  /**
   * Lever komponenten fortsatt? En lokal `avbrutt`-variabel i hentingen under
   * ville ikke duge: React 19 kjører hver effekt to ganger i utvikling
   * (mount → opprydning → mount), og med `spurt`-vakten hentet ANDRE kjøring
   * ingenting mens FØRSTE kjørings svar ble kastet av opprydningen. Resultatet
   * var en stripe som aldri viste seg lokalt. En ref settes tilbake til true av
   * den andre monteringen; ved en ekte avmontering blir den stående false.
   */
  const levende = useRef(true);

  useEffect(() => {
    levende.current = true;
    return () => {
      levende.current = false;
    };
  }, []);

  // Arket kan komme ETTER at stripa er tegnet (det venter 600 ms på kortet), så
  // dette må være en lytter og ikke bare en avlesning ved mount.
  useEffect(() => {
    const oppdater = () => setArkApent(erTilbudsarkApent());
    oppdater();
    window.addEventListener(TILBUDSARK_ENDRET_EVENT, oppdater);
    return () => window.removeEventListener(TILBUDSARK_ENDRET_EVENT, oppdater);
  }, []);

  // Har brukeren alt et abonnement? Serveren ser bare kontoradene; kallet her
  // adopterer i tillegg en kontoløs påmelding på samme adresse (adopsjon.ts),
  // så vi ikke ber noen slå på noe de har hatt i ukevis. Kallet gjøres bare når
  // stripa faktisk kan vises — ellers ville hver forsidevisning kostet en
  // rundtur for ingenting.
  useEffect(() => {
    if (spurt.current) return;
    const kanSpore = skalViseFolgOmrade({
      innlogget,
      // Komponenten monteres først når kortet har data (se MushroomDayCard).
      harData: true,
      folgerAlt,
      // Ikke en del av avgjørelsen om å HENTE: arket kan lukkes igjen, og da
      // skal stripa være klar. Åpent ark skjuler den i tegningen under.
      arkApent: false,
      avvist: readLocal(FOLG_OMRADE_NOKKEL),
      naa: Date.now()
    });
    if (!kanSpore) return;
    spurt.current = true;
    fetch('/api/me/soppvarsel')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { abonnement: { region: string } | null; regioner: Region[] } | null) => {
        if (!levende.current || !d) return;
        // Følger alt et område (også en nettopp adoptert rad): ikke spør.
        if (d.abonnement) return;
        setRegioner(d.regioner ?? []);
        setKlar(true);
      })
      .catch(() => {
        // Nettfeil: vis ingenting. Et tilbud vi ikke kan innfri er verre enn
        // ingen stripe.
      });
  }, [innlogget, folgerAlt]);

  const avvis = () => {
    writeLocal(FOLG_OMRADE_NOKKEL, avvisningsVerdi(Date.now()));
    setAvvistNaa(true);
  };

  const folg = async (region: string) => {
    if (!region) return;
    setLagrer(true);
    setFeilet(false);
    try {
      const res = await fetch('/api/me/soppvarsel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region, active: true, kilde: FOLG_OMRADE_KILDE })
      });
      if (!res.ok) throw new Error('lagring feilet');
      setBekreftet(region);
    } catch {
      // Aldri en stille suksess: stripa blir stående, og brukeren kan prøve på nytt.
      setFeilet(true);
    } finally {
      setLagrer(false);
    }
  };

  if (!klar || avvistNaa) return null;
  // Arket ligger over hele flata; stripa venter til det er borte.
  if (arkApent && !bekreftet) return null;

  if (bekreftet) {
    return (
      <div
        aria-live="polite"
        className="mt-3 flex items-start gap-2 rounded-xl border border-forest-200 bg-forest-50 px-3 py-2.5"
      >
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-forest-900">
          {t.rich('bekreftelse', {
            omrade: bekreftet,
            lenke: (chunks) => (
              <Link href="/profile?vis=soppvarsel" className="font-semibold underline">
                {chunks}
              </Link>
            )
          })}
        </p>
      </div>
    );
  }

  const spor = viserVelger;
  const tittel = spor ? t('hvorPlukker') : t('folg', { omrade: valgt });

  return (
    <section
      aria-labelledby="folg-omrade-tittel"
      className="mt-3 rounded-xl border border-forest-200 bg-forest-50/60 px-3 py-2.5"
    >
      <h3 id="folg-omrade-tittel" className="flex items-center gap-1.5 text-sm font-semibold text-forest-900">
        <Bell className="h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
        {tittel}
      </h3>

      {spor ? (
        <select
          value={valgt}
          onChange={(e) => setValgt(e.target.value)}
          disabled={lagrer}
          aria-label={t('velgOmrade')}
          className="mt-2 w-full rounded-lg border border-forest-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-forest-700 focus:outline-none"
        >
          <option value="">{t('velgOmrade')}</option>
          <optgroup label={t('norge')}>
            {regioner
              .filter((r) => r.land === 'NO')
              .map((r) => (
                <option key={r.navn} value={r.navn}>
                  {r.navn}
                </option>
              ))}
          </optgroup>
          <optgroup label={t('sverige')}>
            {regioner
              .filter((r) => r.land === 'SE')
              .map((r) => (
                <option key={r.navn} value={r.navn}>
                  {r.navn}
                </option>
              ))}
          </optgroup>
        </select>
      ) : null}

      {/* Løftet står alltid før knappen — også i spørrevarianten, der det
          kommer så snart et område er valgt. */}
      {valgt ? <p className="mt-2 text-xs leading-relaxed text-forest-900/90">{t('lofte', { omrade: valgt })}</p> : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        {valgt ? (
          <button
            type="button"
            onClick={() => void folg(valgt)}
            disabled={lagrer}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-forest-700 disabled:opacity-60"
          >
            {lagrer ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            {t('folg', { omrade: valgt })}
          </button>
        ) : null}

        {!spor ? (
          <button
            type="button"
            onClick={() => {
              setViserVelger(true);
              setValgt('');
            }}
            className="text-xs font-medium text-forest-800 underline-offset-2 hover:underline"
          >
            {t('annetOmrade')}
          </button>
        ) : null}

        <button
          type="button"
          onClick={avvis}
          className="text-xs font-medium text-gray-500 underline-offset-2 hover:underline"
        >
          {t('ikkeNaa')}
        </button>
      </div>

      {feilet ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {t('feil')}
        </p>
      ) : null}
    </section>
  );
}
