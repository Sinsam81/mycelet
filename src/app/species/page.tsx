import { getLocale, getTranslations } from 'next-intl/server';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { SpeciesLibrary } from '@/components/species/SpeciesLibrary';
import { createClient } from '@/lib/supabase/server';
import { hentArtskatalog, type SpeciesListItem } from '@/lib/species/artskatalog';
import { jsonLdTilScript } from '@/lib/species/artsmetadata';
import { sesongtilstand } from '@/lib/sesong/sesongtilstand';
import { byggArtsbibliotekJsonLd } from './artsbibliotek-jsonld';

/**
 * Artsbiblioteket (/species).
 *
 * Siden ble rendret helt i nettleseren: HTML-en en søkemotor eller en
 * AI-svartjeneste fikk, inneholdt «Laster arter…» og ingen av de 80 artene,
 * og ingen lenker til artssidene. Nå hentes katalogen her, med samme spørring
 * som useSpecies, og gis til klientdelen (SpeciesLibrary) som startdata: den
 * første HTML-en har kortene og lenkene, siden virker før JavaScript er lastet,
 * og nettleseren henter ikke lista én gang til ved lasting.
 *
 * Feiler hentingen her, får klientdelen ingen startliste og henter selv, som
 * før — en dårlig dag for serveren blir aldri en feilside eller «0 arter».
 *
 * Metadata (tittel, beskrivelse, canonical) står i layout.tsx.
 */
export default async function SpeciesPage() {
  const locale = await getLocale();
  const t = await getTranslations('Species');
  // Samme Oslo-måned i serverens og nettleserens første rendring av «kun i
  // sesong nå» — se sesongtilstand.ts.
  const { maaned } = sesongtilstand();

  let startliste: SpeciesListItem[] | undefined;
  try {
    startliste = await hentArtskatalog(createClient());
  } catch {
    startliste = undefined;
  }

  return (
    <PageWrapper wide>
      {startliste && startliste.length > 0 ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdTilScript(byggArtsbibliotekJsonLd(startliste, locale, t('title')))
          }}
        />
      ) : null}
      <SpeciesLibrary startliste={startliste} maaned={maaned} />
    </PageWrapper>
  );
}
