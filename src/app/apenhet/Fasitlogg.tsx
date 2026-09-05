import { getTranslations } from 'next-intl/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { beregnFasit, type FasitTall } from '@/lib/alerts/fasit';

/**
 * Fasitloggen — verifikasjonskulturen fra meteorologien, anvendt på sopp.
 * Hvert sendte varsel er en falsifiserbar påstand; her står de siste med
 * fasit: funn registrert i regionen uken etter, mot uken før. Tallene regnes
 * LIVE og MODNES (Artsobservasjoner publiserer til GBIF med ukers etterslep),
 * derfor bærer umodne rader sitt eget forbehold i stedet for en frossen dom.
 *
 * Best-effort hele veien: uten migrasjon 060, uten rader eller uten GBIF
 * rendres seksjonen med tom-tilstanden — åpenhetssiden skal aldri knekke av
 * at loggen er ung.
 */
/** Hentes og regnes (2 GBIF-kall per rad, cachet en time) — vises færre. */
const HENT_RADER = 30;
const VIS_RADER = 12;

export async function Fasitlogg() {
  const t = await getTranslations('Apenhet');

  let rader: Array<{ hendelse: { region: string; dato: string; fra_score: number; til_score: number }; fasit: FasitTall | null }> = [];
  try {
    const db = createAdminClient();
    const { data } = await db
      .from('varsel_hendelser')
      .select('region,dato,fra_score,til_score')
      .order('dato', { ascending: false })
      .limit(HENT_RADER);
    const hendelser = data ?? [];
    rader = await Promise.all(
      hendelser.map(async (h) => ({
        hendelse: h as { region: string; dato: string; fra_score: number; til_score: number },
        fasit: await beregnFasit(db, h.region as string, h.dato as string)
      }))
    );
    // Modne fasiter øverst — de er selve poenget med loggen. Ferske varsler
    // (alle med «modnes» og nuller) kom først i tur og skjøv de eneste
    // rader med ekte tall under kuttet, så siden så ut som den ikke hadde
    // noen fasit i det hele tatt. Innenfor hver gruppe: nyeste først.
    rader.sort((a, b) => {
      const ma = a.fasit?.moden ? 1 : 0;
      const mb = b.fasit?.moden ? 1 : 0;
      return mb - ma || b.hendelse.dato.localeCompare(a.hendelse.dato);
    });
    rader = rader.slice(0, VIS_RADER);
  } catch {
    rader = [];
  }

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-forest-900">{t('fasitHeading')}</h2>
      <p className="mt-2 text-sm leading-relaxed text-gray-700">{t('fasitIntro')}</p>

      {rader.length === 0 ? (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-600">{t('fasitEmpty')}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-1.5 pr-3">{t('fasitColRegion')}</th>
                <th className="py-1.5 pr-3">{t('fasitColDato')}</th>
                <th className="py-1.5 pr-3">{t('fasitColLovet')}</th>
                <th className="py-1.5 pr-3">{t('fasitColEtter')}</th>
                <th className="py-1.5">{t('fasitColFor')}</th>
              </tr>
            </thead>
            <tbody>
              {rader.map(({ hendelse, fasit }) => (
                <tr key={`${hendelse.region}-${hendelse.dato}`} className="border-b border-gray-100 text-gray-800">
                  <td className="py-1.5 pr-3 font-medium">{hendelse.region}</td>
                  <td className="py-1.5 pr-3">{hendelse.dato}</td>
                  <td className="py-1.5 pr-3">
                    {hendelse.fra_score} → {hendelse.til_score}
                  </td>
                  <td className="py-1.5 pr-3">
                    {/* GBIF-tallet står alene; egne funn som «+N» — kildene har
                        ulikt etterslep og skal ikke smelte sammen. Feiler en
                        kilde: «–», aldri en falsk null. */}
                    {fasit?.gbifOk && fasit.egneOk ? fasit.gbifEtter : '–'}
                    {fasit?.gbifOk && fasit.egneOk && fasit.egneEtter > 0 ? (
                      <span className="ml-1 text-xs text-gray-500">+{fasit.egneEtter}</span>
                    ) : null}
                    {fasit?.gbifOk && fasit.egneOk && !fasit.moden ? (
                      <span className="ml-1 text-xs text-amber-700">{t('fasitUmoden')}</span>
                    ) : null}
                  </td>
                  <td className="py-1.5">
                    {fasit?.gbifOk && fasit.egneOk ? fasit.gbifFor : '–'}
                    {fasit?.gbifOk && fasit.egneOk && fasit.egneFor > 0 ? (
                      <span className="ml-1 text-xs text-gray-500">+{fasit.egneFor}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-600">{t('fasitCaveat')}</p>
    </article>
  );
}
