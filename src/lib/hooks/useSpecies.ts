'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { sesongtilstand } from '@/lib/sesong/sesongtilstand';
import { filtrerArtsliste, type ArtslisteFiltre } from '@/lib/species/artsliste';
import { hentArtskatalog, type SpeciesListItem } from '@/lib/species/artskatalog';

export type { SpeciesListItem };

/**
 * Hele katalogen under ÉN nøkkel — uten språk og uten filtre.
 *
 * Nøkkelen var ['species', locale, filters]. Hvert filtervalg og hver bokstav i
 * habitatfeltet var dermed en ny spørring uten data: rutenettet ble tømt,
 * antallet forsvant og «Laster arter...» blinket, for en tabell på 80 rader som
 * bare endrer seg med en migrasjon. Søket hadde i tillegg to ulike kilder
 * (RPC-en search_species på norsk, et ilike-filter på svensk) med hver sine
 * hull — se src/lib/species/species-search.ts.
 *
 * Nå hentes lista én gang, og søk, filtre og sortering skjer i minnet.
 */
export const ARTSLISTE_NOKKEL = ['species-all'] as const;

/** Katalogen er statisk mellom migrasjoner; ti minutter sparer gjenbesøk et kall. */
const ARTSLISTE_FERSK_MS = 10 * 60_000;

/**
 * Hvor lenge lista blir liggende etter at siden er forlatt. Standarden er fem
 * minutter — kortere enn ferskhetstiden over, så et gjenbesøk etter seks
 * minutter ville startet fra tomt likevel.
 */
const ARTSLISTE_BEHOLD_MS = 30 * 60_000;

function hentArtsliste(): Promise<SpeciesListItem[]> {
  return hentArtskatalog(createClient());
}

/**
 * Det serveren allerede har gitt siden (src/app/species/page.tsx).
 *
 * `startliste` er hele katalogen slik serveren hentet den — ufiltrert, som
 * alt annet under nøkkelen, så den kan gis til useQuery som initialData uten
 * å bli «svaret» på et filter. Den regnes som fersk i ARTSLISTE_FERSK_MS fra
 * siden ble åpnet, så nettleseren henter ikke lista én gang til ved lasting.
 * Mangler den (serveren fikk ikke svar), henter kroken selv, som før.
 *
 * `maaned` er Oslo-måneden serveren rendret med. Uten den leste nettleseren
 * klokka på nytt, og i minuttene rundt et månedsskifte kunne «kun i sesong nå»
 * gi ulik HTML på server og klient.
 */
export interface ArtslisteStart {
  startliste?: SpeciesListItem[];
  maaned?: number;
}

export function useSpecies(filters: ArtslisteFiltre, { startliste, maaned: serverMaaned }: ArtslisteStart = {}) {
  const locale = useLocale();
  const {
    data: alle,
    isPending,
    error
  } = useQuery({
    queryKey: ARTSLISTE_NOKKEL,
    queryFn: hentArtsliste,
    initialData: startliste,
    staleTime: ARTSLISTE_FERSK_MS,
    gcTime: ARTSLISTE_BEHOLD_MS
  });

  const { query, edibility, inSeasonNow, habitat } = filters;
  // Oslo-måneden fra den ene sesonghjelperen — samme måned som kalenderen
  // rendrer på serveren. Enhetens egen tidssone kan stå i en annen måned ved et
  // månedsskifte, og da svarte «kun i sesong nå» ulikt her og i kalenderen.
  // Serverens måned når siden fikk den, så første rendring blir lik.
  const maaned = serverMaaned ?? sesongtilstand().maaned;

  const data = useMemo(
    () =>
      alle ? filtrerArtsliste(alle, { query, edibility, inSeasonNow, habitat }, locale, maaned) : undefined,
    [alle, query, edibility, inSeasonNow, habitat, locale, maaned]
  );

  // «Laster» betyr at lista ikke har kommet ennå — bare den aller første
  // hentingen. Et filterbytte er ikke lenger en lasting, så siden blinker ikke.
  // isPending og ikke useQuerys isLoading: uten nett settes spørringen på vent,
  // isLoading er da usann, og siden svarte «Ingen arter matcher filtrene dine»
  // om en liste den aldri hadde fått.
  //
  // Feilen gis bare videre når det ikke finnes noen liste å vise. Etter ti
  // minutter hentes katalogen på nytt i bakgrunnen ved neste besøk; feiler DET
  // (dårlig dekning i skogen), har TanStack både den forrige lista og en feil,
  // og siden skrev «Kunne ikke hente arter» over et rutenett som sto der.
  return { data, isLoading: isPending, error: alle ? null : error };
}
