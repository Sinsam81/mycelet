import Link from 'next/link';
import { getUserLocale } from '@/i18n/locale';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { PREDICTION_TILE_REGIONS } from '@/lib/prediction/tile-regions';

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
 * vi lover flanken («vi sier fra når det snur»), aldri funn. COPY-tabell i
 * stedet for next-intl fordi siden er en ren serverkomponent — samme
 * dokumenterte mønster som prediksjonstekstene.
 */

const COPY = {
  nb: {
    tittel: 'Soppvarselet',
    ingress:
      'Én e-post når forholdene snur i ditt område — aldri mer enn én i uka, og ingen støy imellom. Vi følger vær, sesong og skogtype hver natt, og sier fra den dagen det faktisk er nytt.',
    slikVirker: 'Slik virker det',
    punkt1: 'Hver natt regner vi ut soppforholdene (0–100) for 22 områder i Norge og Sverige.',
    punkt2: 'Du får e-post når området ditt krysser fra dårlige til gode forhold — selve omslaget, ikke en daglig rapport.',
    punkt3: 'Maks én e-post i uka. Avmeldingslenke i hver eneste e-post.',
    forbehold:
      'Tallet gjelder et område, ikke skogen der du står — og vi lover aldri funn, bare at forholdene ligger til rette.',
    skjemaTittel: 'Meld deg på',
    epost: 'E-postadressen din',
    omrade: 'Område',
    norge: 'Norge',
    sverige: 'Sverige',
    knapp: 'Få soppvarsel',
    samtykke:
      'Du bekrefter påmeldingen med en lenke vi sender deg på e-post, og kan melde deg av når som helst. Adressen brukes kun til soppvarselet.',
    statusSendt: '📬 Sjekk innboksen! Vi har sendt deg en bekreftelseslenke — trykk på den, så er du påmeldt.',
    statusBekreftet: '✅ Da er du påmeldt! Neste gang forholdene snur i området ditt, hører du fra oss.',
    statusUgyldig: 'Noe manglet — sjekk at e-postadressen er riktig og at du har valgt et område.',
    statusUgyldigLenke: 'Lenken er ugyldig eller allerede brukt. Meld deg på på nytt, så sender vi en fersk.',
    statusFeil: 'Noe gikk galt hos oss. Prøv igjen om et øyeblikk.',
    harKonto: 'Har du konto i appen? Da kan du også skru på varselet under',
    profilen: 'profilen din',
    personvern: 'personvernerklæringen',
    folgX: 'Omslagene og fasiten publiseres også åpent på X —',
    folgXLenke: 'følg @mycelet'
  },
  sv: {
    tittel: 'Svampvarningen',
    ingress:
      'Ett mejl när förhållandena vänder i ditt område — aldrig mer än ett i veckan, och inget brus däremellan. Vi följer väder, säsong och skogstyp varje natt, och säger till den dag det faktiskt är nytt.',
    slikVirker: 'Så fungerar det',
    punkt1: 'Varje natt räknar vi ut svampförhållandena (0–100) för 22 områden i Norge och Sverige.',
    punkt2: 'Du får mejl när ditt område korsar från dåliga till goda förhållanden — själva omslaget, inte en daglig rapport.',
    punkt3: 'Max ett mejl i veckan. Avregistreringslänk i varje mejl.',
    forbehold:
      'Talet gäller ett område, inte skogen där du står — och vi lovar aldrig fynd, bara att förhållandena ligger rätt.',
    skjemaTittel: 'Anmäl dig',
    epost: 'Din e-postadress',
    omrade: 'Område',
    norge: 'Norge',
    sverige: 'Sverige',
    knapp: 'Få svampvarning',
    samtykke:
      'Du bekräftar anmälan med en länk vi mejlar dig, och kan avregistrera dig när som helst. Adressen används bara till svampvarningen.',
    statusSendt: '📬 Kolla inkorgen! Vi har mejlat dig en bekräftelselänk — tryck på den, så är du anmäld.',
    statusBekreftet: '✅ Då är du anmäld! Nästa gång förhållandena vänder i ditt område hör du från oss.',
    statusUgyldig: 'Något saknades — kolla att e-postadressen stämmer och att du valt ett område.',
    statusUgyldigLenke: 'Länken är ogiltig eller redan använd. Anmäl dig igen så skickar vi en färsk.',
    statusFeil: 'Något gick fel hos oss. Försök igen om en stund.',
    harKonto: 'Har du konto i appen? Då kan du också slå på varningen under',
    profilen: 'din profil',
    personvern: 'integritetspolicyn',
    folgX: 'Omslagen och facit publiceras också öppet på X —',
    folgXLenke: 'följ @mycelet'
  }
} as const;

const STATUSFARGE: Record<string, string> = {
  sendt: 'border-forest-300 bg-forest-50 text-forest-900',
  bekreftet: 'border-forest-300 bg-forest-50 text-forest-900',
  ugyldig: 'border-amber-300 bg-amber-50 text-amber-900',
  'ugyldig-lenke': 'border-amber-300 bg-amber-50 text-amber-900',
  feil: 'border-red-300 bg-red-50 text-red-900'
};

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

  const statusTekst =
    status === 'sendt'
      ? t.statusSendt
      : status === 'bekreftet'
        ? t.statusBekreftet
        : status === 'ugyldig'
          ? t.statusUgyldig
          : status === 'ugyldig-lenke'
            ? t.statusUgyldigLenke
            : status === 'feil'
              ? t.statusFeil
              : null;

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
        {statusTekst ? (
          <p
            id="status"
            className={`scroll-mt-24 rounded-xl border px-4 py-3 text-sm font-medium ${STATUSFARGE[status ?? ''] ?? ''}`}
          >
            {statusTekst}
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
