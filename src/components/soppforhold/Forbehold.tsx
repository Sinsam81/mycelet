import { AlertTriangle } from 'lucide-react';

/**
 * Ærlighetsavsnittet og sikkerhetsrammen for /soppforhold-sidene.
 *
 * ⚠️ Delt komponent MED VILJE: teksten er posisjonen vår (tallet er vær og
 * sesong for et område — aldri «her står det sopp», aldri «trygt å spise»),
 * og den skal være ordrett lik på samlesiden og alle områdesidene. Ikke skriv
 * den om til noe som lover mer, og ikke lag lokale kopier.
 */
export function SoppforholdForbehold() {
  return (
    <>
      {/* Uten dette avsnittet er tallet over en påstand vi ikke kan holde. */}
      <section className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <h2 className="font-serif text-lg font-semibold text-forest-900">Hva tallet betyr — og ikke betyr</h2>
        <p className="text-sm text-gray-700">
          Tallet er <strong>vær og sesong for området</strong>: hvor mye det har regnet de siste to ukene, hvor
          fuktig marka er, temperaturen, luftfuktigheten, og hvor vi er i sesongen for artene som vokser der.
          Det er den delen av spørsmålet en modell faktisk kan svare på.
        </p>
        <p className="text-sm text-gray-700">
          Det sier <strong>ingenting om skogen der du står</strong>. Gammel granskog med mose og en sørvendt li
          slår et høyt tall i feil terreng hver gang. Og det sier ingenting om hvorvidt noe er trygt å spise.
        </p>
        <p className="text-sm text-gray-700">
          Vi lover heller ikke at du finner sopp. Vi sier når forholdene ligger til rette — resten er skogen,
          beina dine og litt flaks.
        </p>
      </section>

      <aside className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="space-y-1 text-sm text-amber-900">
          <p className="font-semibold">Spis aldri en sopp du ikke har fått bestemt.</p>
          <p>
            Ingen app, og ingen nettside, kan si at en sopp er trygg å spise. Er du i tvil, la den stå — eller
            få den kontrollert av en soppsakkyndig.{' '}
            <a href="https://soppkontroll.no" className="underline" rel="noopener noreferrer" target="_blank">
              soppkontroll.no
            </a>{' '}
            viser kontroller nær deg. Ved mistanke om forgiftning: ring Giftinformasjonen{' '}
            <a href="tel:22591300" className="font-semibold underline">22 59 13 00</a>.
          </p>
        </div>
      </aside>
    </>
  );
}
