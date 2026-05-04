import Link from 'next/link';
import { AlertTriangle, Cookie, Database, FileDown, Lock, Mail, Trash2, Users } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';

export const metadata = {
  title: 'Personvern — SoppJakt',
  description:
    'Hvordan SoppJakt samler inn, bruker og beskytter personopplysningene dine. GDPR-rettighetene dine og hvem du kan kontakte.'
};

// === MAL — IKKE PUBLISER FØR ===
// 1) Tekst i [HAKEPARENTESER] er fylles inn av deg
// 2) Send hele dokumentet til advokat for gjennomgang
// 3) DPA-er må signeres med Supabase, Stripe, OpenWeather, Plant.id (se "Hvem vi deler data med")
// 4) Sett opp privacy@soppjakt.no før lansering

const LAST_UPDATED = '4. mai 2026';

export default function PersonvernPage() {
  return (
    <PageWrapper>
      <section className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Personvernerklæring</h1>
          <p className="text-sm text-gray-700">
            Sist oppdatert: {LAST_UPDATED}. Denne erklæringen forklarer hvordan SoppJakt behandler personopplysningene dine.
          </p>
        </div>

        <article className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 shrink-0 text-amber-700" />
            <div className="space-y-1">
              <p className="text-base font-bold text-amber-900">Mal under utvikling</p>
              <p className="text-sm text-amber-900">
                Denne siden er en arbeidsmal og må gjennomgås av advokat før lansering. Felter i [hakeparenteser] må fylles inn.
              </p>
            </div>
          </div>
        </article>

        {/* === 1. Behandlingsansvarlig === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="h-5 w-5 text-forest-700" /> 1. Behandlingsansvarlig
          </h2>
          <p className="text-sm text-gray-700">
            Behandlingsansvarlig for personopplysningene dine er:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>[FYLL INN: Selskapets juridiske navn / enkeltpersonforetak]</li>
            <li>Organisasjonsnummer: [FYLL INN]</li>
            <li>Adresse: [FYLL INN]</li>
            <li>
              Kontakt for personvern:{' '}
              <a href="mailto:privacy@soppjakt.no" className="font-medium text-forest-700 underline">
                privacy@soppjakt.no
              </a>
            </li>
          </ul>
        </article>

        {/* === 2. Hva vi samler inn === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Database className="h-5 w-5 text-forest-700" /> 2. Hvilke opplysninger vi samler inn
          </h2>
          <p className="text-sm text-gray-700">Når du bruker SoppJakt behandler vi:</p>
          <dl className="space-y-2 text-sm text-gray-700">
            <div>
              <dt className="font-medium text-gray-900">Konto-opplysninger</dt>
              <dd>E-post, brukernavn, valgfritt visningsnavn, profilbilde, biografi, hjemstedsregion.</dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">Bruksdata</dt>
              <dd>
                Soppfunn du registrerer (koordinater, art, dato, bilder, notater), forum-innlegg, kommentarer, likes, lagrede innlegg.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">Posisjonsdata</dt>
              <dd>
                GPS-koordinater fra mobilen din når du registrerer funn, og valgfri hjemstedsregion. Vi viser kun
                grov-randomiserte eller gridd-snappede koordinater til andre brukere — aldri eksakt funn-sted.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">Teknisk data</dt>
              <dd>
                IP-adresse, nettleser, innloggings-tidspunkt (samlet av Supabase Auth for sikkerhet og misbruks-deteksjon).
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">Betalingsdata</dt>
              <dd>
                Hvis du kjøper et abonnement: Stripe håndterer kort-data direkte. Vi mottar kun abonnements-status, prisplan og
                periodes-datoer — aldri kortnummer.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">Bilder du laster opp</dt>
              <dd>
                Når du bruker AI-identifikasjon, sendes bildet til vår tredjepartsleverandør for soppgjenkjenning. Bilder lagres
                også på din profil for funn-historikken din.
              </dd>
            </div>
          </dl>
        </article>

        {/* === 3. Lovlig grunnlag === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold">3. Lovlig grunnlag for behandling (GDPR Art. 6)</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>
              <span className="font-medium">Avtale (Art. 6(1)(b))</span> — for å gi deg tjenesten du har registrert deg for: konto,
              funn-oppbevaring, prediksjon, forum.
            </li>
            <li>
              <span className="font-medium">Berettiget interesse (Art. 6(1)(f))</span> — for sikkerhet, misbruks-deteksjon, og
              forbedring av prediksjons-modellen.
            </li>
            <li>
              <span className="font-medium">Juridisk forpliktelse (Art. 6(1)(c))</span> — for regnskapsplikt på betalingsdata
              [FYLL INN: hvor mange år, vanligvis 5 år for bokføringsloven].
            </li>
            <li>
              <span className="font-medium">Samtykke (Art. 6(1)(a))</span> — kun for valgfri kommunikasjon (f.eks. nyhetsbrev hvis
              du takker ja). Du kan trekke tilbake samtykke når som helst.
            </li>
          </ul>
        </article>

        {/* === 4. Tredjeparter === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold">4. Hvem vi deler data med (databehandlere)</h2>
          <p className="text-sm text-gray-700">
            Vi har inngått databehandleravtaler (DPA) med følgende leverandører:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>
              <span className="font-medium">Supabase</span> (database, autentisering, fillagring) — region:{' '}
              [FYLL INN: EU/Frankfurt eller US?]. DPA: [LENKE/STATUS].
            </li>
            <li>
              <span className="font-medium">Vercel</span> (hosting). DPA: [LENKE/STATUS].
            </li>
            <li>
              <span className="font-medium">Stripe</span> (betaling). DPA: [LENKE/STATUS]. Stripe overfører data til USA under SCC.
            </li>
            <li>
              <span className="font-medium">OpenWeather</span> (vær for områder utenfor Norden) — kun koordinater, ingen
              brukerinformasjon.
            </li>
            <li>
              <span className="font-medium">MET Norge (Frost)</span> og <span className="font-medium">SMHI (Sverige)</span> — kun
              koordinater, ingen brukerinformasjon.
            </li>
            <li>
              <span className="font-medium">Plant.id / Kindwise</span> (AI-identifikasjon, hvis aktivert) — bilde + koordinater
              sendes for analyse. DPA: [LENKE/STATUS].
            </li>
            <li>
              <span className="font-medium">Wikimedia Commons</span> — vi bruker bare offentlige bilde-URL-er, ingen brukerdata
              sendes.
            </li>
          </ul>
        </article>

        {/* === 5. Retensjon === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold">5. Hvor lenge vi lagrer data</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>
              <span className="font-medium">Aktiv konto:</span> så lenge du har konto.
            </li>
            <li>
              <span className="font-medium">Etter sletting:</span> data fjernes umiddelbart fra primær-database. Backup-rotasjon
              kan beholde data i opptil [FYLL INN: 30 dager] før permanent fjerning.
            </li>
            <li>
              <span className="font-medium">Inaktive kontoer:</span> [FYLL INN: f.eks. konti som ikke har vært aktive på 24
              måneder slettes automatisk etter varsling].
            </li>
            <li>
              <span className="font-medium">Betalingsdata:</span> beholdes i [FYLL INN: 5 år for å oppfylle bokføringsloven].
            </li>
          </ul>
        </article>

        {/* === 6. Internasjonale overføringer === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold">6. Overføring utenfor EØS</h2>
          <p className="text-sm text-gray-700">
            Noen av leverandørene våre er basert utenfor EØS (særlig USA). Disse overføringene skjer under EUs Standard
            Contractual Clauses (SCC) eller annet gyldig overførings-grunnlag. Vi vurderer leverandørene før vi tar dem i bruk og
            sikrer at de gir tilstrekkelig beskyttelse av personopplysninger.
          </p>
        </article>

        {/* === 7. Dine rettigheter === */}
        <article className="space-y-3 rounded-xl border-2 border-forest-300 bg-forest-50 p-4">
          <h2 className="text-lg font-semibold text-forest-900">7. Dine rettigheter</h2>
          <p className="text-sm text-forest-900">Som bruker har du følgende rettigheter etter GDPR:</p>

          <div className="space-y-2 text-sm text-forest-900">
            <div className="flex items-start gap-2">
              <FileDown className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Innsyn (Art. 15) og dataportabilitet (Art. 20)</p>
                <p>
                  Last ned alle dine data som JSON-fil ved å kalle{' '}
                  <code className="rounded bg-forest-100 px-1 py-0.5 text-xs">GET /api/me/export</code> mens du er logget inn.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Trash2 className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Sletting (Art. 17)</p>
                <p>
                  Slett kontoen og alle dine data fra Profil-siden, eller kall{' '}
                  <code className="rounded bg-forest-100 px-1 py-0.5 text-xs">POST /api/me/delete</code>. Sletting er
                  umiddelbar; backup-rotasjon kan beholde data i opptil [FYLL INN: 30 dager].
                </p>
              </div>
            </div>

            <div>
              <p className="font-medium">Korreksjon (Art. 16)</p>
              <p>Endre profilen din direkte i appen, eller kontakt oss.</p>
            </div>

            <div>
              <p className="font-medium">Begrensning og innsigelse (Art. 18, 21)</p>
              <p>
                Kontakt{' '}
                <a href="mailto:privacy@soppjakt.no" className="font-medium underline">
                  privacy@soppjakt.no
                </a>{' '}
                hvis du vil begrense hvordan vi behandler dataene dine, eller motsette deg behandlingen.
              </p>
            </div>

            <div>
              <p className="font-medium">Klage til Datatilsynet</p>
              <p>
                Du kan klage til Datatilsynet ved{' '}
                <a
                  href="https://www.datatilsynet.no"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline"
                >
                  datatilsynet.no
                </a>{' '}
                hvis du mener vi behandler dataene dine i strid med personvernreglene.
              </p>
            </div>
          </div>
        </article>

        {/* === 8. Cookies === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Cookie className="h-5 w-5 text-forest-700" /> 8. Informasjonskapsler (cookies)
          </h2>
          <p className="text-sm text-gray-700">SoppJakt bruker kun strengt nødvendige cookies:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>
              <span className="font-medium">Innloggings-sesjon (Supabase):</span> husker at du er logget inn slik at du ikke
              trenger å logge inn på hver side.
            </li>
            <li>
              <span className="font-medium">Stripe (kun ved betaling):</span> sikrer betalings-flyten og forhindrer svindel.
            </li>
          </ul>
          <p className="text-sm text-gray-700">
            Vi bruker <span className="font-medium">ingen</span> analyse-cookies, sporings-cookies eller markedsførings-cookies.
            Ingen tredjeparts-annonsering.
          </p>
        </article>

        {/* === 9. Sikkerhet === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Lock className="h-5 w-5 text-forest-700" /> 9. Sikkerhet
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>All trafikk er kryptert med HTTPS.</li>
            <li>Passord lagres aldri i klartekst — Supabase Auth bruker industri-standard hashing.</li>
            <li>Database har Row-Level Security som sikrer at du bare ser dine egne data.</li>
            <li>Sikkerhets-headers (HSTS, X-Frame-Options, Referrer-Policy m.fl.) beskytter mot vanlige angrep.</li>
            <li>Admin-tilgang er begrenset og kreves moderator-rolle for sensitive operasjoner.</li>
          </ul>
        </article>

        {/* === 10. Brudd === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold">10. Brudd på personopplysnings-sikkerhet</h2>
          <p className="text-sm text-gray-700">
            Hvis vi oppdager et alvorlig brudd som kan true rettighetene dine, varsler vi Datatilsynet innen 72 timer (GDPR Art.
            33) og varsler deg direkte hvis bruddet har høy risiko for deg (Art. 34).
          </p>
        </article>

        {/* === 11. Endringer === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold">11. Endringer i personvernerklæringen</h2>
          <p className="text-sm text-gray-700">
            Vi oppdaterer denne erklæringen når praksisen vår endres. Vesentlige endringer varsles på e-post eller via en
            tydelig melding i appen før de trer i kraft.
          </p>
        </article>

        {/* === 12. Kontakt === */}
        <article className="space-y-2 rounded-xl border-2 border-forest-300 bg-forest-50 p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-forest-900">
            <Mail className="h-5 w-5" /> 12. Kontakt
          </h2>
          <p className="text-sm text-forest-900">
            Spørsmål om personvern? Send e-post til{' '}
            <a href="mailto:privacy@soppjakt.no" className="font-medium underline">
              privacy@soppjakt.no
            </a>
            .
          </p>
          <p className="text-sm text-forest-900">
            For akutte sikkerhetshendelser, ring{' '}
            <a href="tel:+4722591300" className="font-medium underline">
              Giftinformasjonen 22 59 13 00
            </a>{' '}
            (døgnåpent).
          </p>
        </article>

        <p className="pt-2 text-center text-xs text-gray-500">
          <Link href="/" className="underline">
            Tilbake til forsiden
          </Link>
        </p>
      </section>
    </PageWrapper>
  );
}
