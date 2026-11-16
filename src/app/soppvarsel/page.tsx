import type { Metadata } from 'next';
import Link from 'next/link';
import { getUserLocale } from '@/i18n/locale';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { PREDICTION_TILE_REGIONS } from '@/lib/prediction/tile-regions';
import { sesongtilstand } from '@/lib/sesong/sesongtilstand';
import { COPY, soppvarselMetadata, statuslinje } from './tekst';

/**
 * Offentlig påmeldingsside for soppvarselet — UTEN konto og UTEN klient-JS.
 *
 * Dette er varselets utstillingsvindu: landingssiden, sanketips-artiklene og
 * /soppforhold lenker hit. Skjemaet POST-er nativt til
 * /api/soppvarsel/pamelding, som svarer med redirect tilbake hit med
 * ?status=… — hele flyten virker med JavaScript avslått, og siden kan
 * servertegnes og caches.
 *
 * Teksten holder samme ærlighetslinje som selve varselet (se alerts/email.ts):
 * vi lover flanken («vi sier fra når det snur»), aldri funn. Tekstene og
 * statuslinja bor i ./tekst.ts (COPY-tabell i stedet for next-intl fordi siden
 * er en ren serverkomponent — samme dokumenterte mønster som
 * prediksjonstekstene).
 *
 * FORVENTNINGEN UTENOM SESONGEN. Varselet fyrer bare når et område krysser
 * terskelen, og det skjer i praksis ikke om vinteren. Den som melder seg på i
 * januar fikk likevel bare «neste gang forholdene snur, hører du fra oss» — og
 * så stillhet i månedsvis. Nå står det én alltid-sann setning i «Slik virker
 * det» (ingen datologikk), og kvitteringen etter bekreftelse får i tillegg en
 * setning når kalenderen sier desember–mai (sesongtilstand). Ingen ny e-post
 * sendes, og ingenting loves om NÅR det snur.
 */

/**
 * Tittel, beskrivelse, canonical og delingskort på leserens språk — se
 * soppvarselMetadata i ./tekst.ts. Leser ikke searchParams: metadataene er de
 * samme for /soppvarsel?status=sendt som for siden selv.
 */
export async function generateMetadata(): Promise<Metadata> {
  return soppvarselMetadata(await getUserLocale());
}

export default async function SoppvarselSide({
  searchParams
}: {
  searchParams: Promise<{ status?: string; region?: string }>;
}) {
  const locale = await getUserLocale();
  const t = COPY[locale === 'sv' ? 'sv' : 'nb'];
  const { status, region } = await searchParams;
  // Områdesidene lenker hit med ?region=… så leseren slipper å velge på nytt.
  // Ukjent verdi → tomt valg, som før.
  const forhandsvalgt = region && PREDICTION_TILE_REGIONS.some((r) => r.name === region) ? region : '';

  // Siden er dynamisk (leser searchParams), så datoen er alltid dagens.
  const linje = statuslinje(status, locale, sesongtilstand(new Date()).iHovedsesong);

  const norske = PREDICTION_TILE_REGIONS.filter((r) => r.country === 'NO');
  const svenske = PREDICTION_TILE_REGIONS.filter((r) => r.country === 'SE');

  return (
    <PageWrapper>
      <section className="mx-auto max-w-xl space-y-5">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-forest-900">🍄 {t.tittel}</h1>
        <p className="text-sm leading-relaxed text-gray-700">{t.ingress}</p>

        {/* id="status" + #status-fragmentet i redirectene: eieren sendte inn
            skjemaet, ble redirectet til toppen av siden — og sto igjen nede
            ved et tomt skjema som «ikke virket». Meldingen må lande der øyet
            er, og fragmentet lar nettleseren scrolle dit selv, uten JS. */}
        {linje ? (
          <p
            id="status"
            role="status"
            className={`scroll-mt-24 rounded-xl border px-4 py-3 text-sm font-medium ${linje.farge}`}
          >
            {linje.tekst}
          </p>
        ) : null}

        <div className="rounded-2xl bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t.slikVirker}</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-gray-700">
            <li>{t.punkt1}</li>
            <li>{t.punkt2}</li>
            <li>{t.punkt3}</li>
          </ul>
          <p className="mt-3 text-xs text-gray-500">{t.forbehold}</p>
        </div>

        <form method="post" action="/api/soppvarsel/pamelding" className="rounded-2xl bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-forest-900">{t.skjemaTittel}</h2>
          <input type="hidden" name="locale" value={locale === 'sv' ? 'sv' : 'nb'} />
          <label className="mt-3 block text-sm font-medium text-gray-700">
            {t.epost}
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="deg@example.com"
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-gray-700">
            {t.omrade}
            <select
              name="region"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              defaultValue={forhandsvalgt}
            >
              <option value="" disabled />
              <optgroup label={t.norge}>
                {norske.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t.sverige}>
                {svenske.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <button
            type="submit"
            className="mt-4 w-full rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-forest-700"
          >
            {t.knapp}
          </button>
          <p className="mt-3 text-xs text-gray-500">
            {t.samtykke}{' '}
            <Link href="/personvern" className="underline">
              {t.personvern}
            </Link>
          </p>
        </form>

        <p className="text-xs text-gray-500">
          {t.harKonto} <Link href="/profile" className="underline">{t.profilen}</Link>.
        </p>

        <p className="text-xs text-gray-500">
          {t.folgX}{' '}
          <a href="https://x.com/mycelet" className="underline" rel="noopener">
            {t.folgXLenke}
          </a>
          .
        </p>
      </section>
    </PageWrapper>
  );
}
