import { TrendingUp } from 'lucide-react';
import type { RegionWeek } from '@/lib/prediction/region-week';

/**
 * «Uka framover»-stripen på områdesidene: sju søyler uten tall, med navngitt
 * toppdag. Serverkomponent — null JavaScript til klienten, som resten av
 * /soppforhold.
 *
 * Søylene har ingen absolutte farger og ingen score-tall MED VILJE: stripen
 * rangerer ukas dager mot hverandre, den kalibrerer ikke mot områdets
 * publiserte dagstall (to ulike modeller — se region-week.ts). Utheving skjer
 * med mørkere grønnfarge på toppdagen(e), ikke med en fargeskala.
 */
export function UkeStripe({ uke }: { uke: RegionWeek | null }) {
  if (!uke) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-forest-900">
        <TrendingUp className="h-4 w-4 text-forest-700" aria-hidden="true" />
        {uke.heading}
      </h2>
      <p className="mt-1 text-gray-700">{uke.line}</p>
      {/* Søylen har SIN EGEN boks med fast høyde, og etiketten står utenfor.
          Lå etiketten inne i samme boks, ville prosenthøyden regnet mot hele
          kolonnen mens etiketten spiste av den — og alt over ~81 % ble klemt
          ned til samme høyde. Da så ukas beste dag lik ut som en dag seks
          poeng svakere, altså nøyaktig den rangeringen stripen finnes for. */}
      <div className="mt-4 flex items-end gap-1.5" aria-hidden="true">
        {uke.days.map((d) => (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-24 w-full items-end">
              <div
                className={`w-full rounded-t-md ${d.erTopp ? 'bg-forest-700' : 'bg-forest-200'}`}
                style={{ height: `${d.heightPct}%` }}
              />
            </div>
            <span
              className={`text-[11px] leading-tight ${
                d.isToday || d.erTopp ? 'font-semibold text-forest-900' : 'text-gray-500'
              }`}
            >
              {d.label}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500">{uke.honesty}</p>
    </section>
  );
}
