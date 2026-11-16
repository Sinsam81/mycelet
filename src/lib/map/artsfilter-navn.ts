/**
 * Et artsfilter skal alltid ha et navn brukeren kan se.
 *
 * HVORFOR
 * Kartet filtrerer funn, fliser og registrerte funn på `speciesId`, og viser
 * HVA det filtrerer på med navnet: den grønne brikken «Lovende steder for …»,
 * linja i filterarket og forslaget i funnskjemaet. Id og navn er to
 * tilstander, og de kom ut av takt:
 *
 *  - Filterarket hadde et eget artssøk som satte bare id-en. Kartet viste da
 *    færre funn og andre farger uten at noe sa hvorfor.
 *  - Det navnløse filteret ble husket (mycelet:kart-utsnitt-v1, 24 timer), så
 *    neste besøk åpnet med det samme usynlige filteret. Det søket er fjernet,
 *    men utsnittene det lagret, ligger igjen på brukernes enheter.
 *  - En dyplenke `/map?art=<id>` uten `artnavn` gir samme tilstand.
 *
 * REGELEN
 * Når artslista er lastet, rettes tilstanden mot den:
 *
 *  - id uten navn, og arten finnes: navnet settes. Filteret beholdes — det var
 *    brukerens valg, det manglet bare et synlig navn.
 *  - id som ikke finnes i artslista (med eller uten navn): hele artsfilteret
 *    fjernes. En art vi ikke kjenner kan ikke filtrere noe, og en brikke som
 *    navngir den, viser et tomt kart uten forklaring.
 *  - Artslista er tom (ikke lastet ennå, eller oppslaget feilet): ingenting
 *    røres. Da vet vi ikke nok til å kalle en art ukjent.
 *  - Artslista kan være avkuttet (PostgREST gir aldri mer enn 1000 rader per
 *    svar, uten å si fra): en art som mangler i den, kan like gjerne ligge
 *    forbi kuttet. Da fjernes ingenting — navn settes fortsatt når arten er der.
 *
 * Ren funksjon: kartkomponenten lastes ikke av noen test.
 */

import { POSTGREST_MAX_ROWS } from '@/lib/supabase/paged-rpc';

export type Artsfilterretting =
  /** Tilstanden er i orden, eller vi vet ikke nok til å rette den. */
  | { type: 'ingen' }
  /** Arten finnes, men navnet mangler: vis dette. */
  | { type: 'sett_navn'; navn: string }
  /** Arten finnes ikke: fjern artsfilteret overalt. */
  | { type: 'fjern_art' };

export function rettArtsfilter({
  speciesId,
  speciesName,
  navn
}: {
  speciesId: number | null;
  /** Navnet som vises nå. Null eller tom streng = intet navn. */
  speciesName: string | null;
  /** Visningsnavn per arts-id, slik kartet har lastet dem. Tom til de er inne. */
  navn: ReadonlyMap<number, string>;
}): Artsfilterretting {
  if (speciesId == null) return { type: 'ingen' };
  if (navn.size === 0) return { type: 'ingen' };
  const kjent = navn.get(speciesId);
  if (kjent === undefined) return navn.size >= POSTGREST_MAX_ROWS ? { type: 'ingen' } : { type: 'fjern_art' };
  if (!speciesName || speciesName.trim() === '') return kjent ? { type: 'sett_navn', navn: kjent } : { type: 'ingen' };
  return { type: 'ingen' };
}
