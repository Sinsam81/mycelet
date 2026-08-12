import { AlertTriangle } from 'lucide-react';

/**
 * Ærlighetsavsnittet og sikkerhetsrammen for /soppforhold-sidene.
 *
 * ⚠️ Delt komponent MED VILJE: teksten er posisjonen vår (tallet er vær og
 * sesong for et område — aldri «her står det sopp», aldri «trygt å spise»),
 * og den skal være ordrett lik på samlesiden og alle områdesidene. Ikke skriv
 * den om til noe som lover mer, og ikke lag lokale kopier.
 *
 * Språket følger LANDET siden gjelder, ikke den besøkende: en side om Göteborg
 * er svensk, med svensk giftnummer. Å vise Giftinformasjonen 22 59 13 00 til
 * en leser i Sverige var funnet som stoppet de svenske sidene i første runde —
 * samme feilklasse som H13 i lanseringsrevisjonen. Nødtekst og numre er
 * ordrett de samme som appens etablerte svenske sikkerhetstekst
 * (messages/sv.json → SafetyWarning/Sikkerhet).
 */

const COPY = {
  NO: {
    heading: 'Hva tallet betyr — og ikke betyr',
    p1a: 'Tallet er ',
    p1strong: 'vær og sesong for området',
    p1b:
      ': hvor mye det har regnet de siste to ukene, hvor fuktig marka er, temperaturen, luftfuktigheten, og hvor vi er i sesongen for artene som vokser der. Det er den delen av spørsmålet en modell faktisk kan svare på.',
    p2a: 'Det sier ',
    p2strong: 'ingenting om skogen der du står',
    p2b:
      '. Gammel granskog med mose og en sørvendt li slår et høyt tall i feil terreng hver gang. Og det sier ingenting om hvorvidt noe er trygt å spise.',
    p3: 'Vi lover heller ikke at du finner sopp. Vi sier når forholdene ligger til rette — resten er skogen, beina dine og litt flaks.',
    aldriSpis: 'Spis aldri en sopp du ikke har fått bestemt.'
  },
  SE: {
    heading: 'Vad talet betyder, och inte betyder',
    p1a: 'Talet är ',
    p1strong: 'väder och säsong för området',
    p1b:
      ': hur mycket det regnat de senaste två veckorna, hur fuktig marken är, temperaturen, luftfuktigheten, och var vi är i säsongen för arterna som växer där. Det är den del av frågan en modell faktiskt kan svara på.',
    p2a: 'Det säger ',
    p2strong: 'ingenting om skogen där du står',
    p2b:
      '. Gammal granskog med mossa och en sydvänd slänt slår ett högt tal i fel terräng varje gång. Och det säger ingenting om huruvida något är säkert att äta.',
    p3: 'Vi lovar inte heller att du hittar svamp. Vi säger när förhållandena ligger rätt, resten är skogen, dina ben och lite tur.',
    aldriSpis: 'Ät aldrig en svamp du inte fått bestämd.'
  }
} as const;

export function SoppforholdForbehold({ land = 'NO' }: { land?: 'NO' | 'SE' }) {
  const t = COPY[land];
  return (
    <>
      {/* Uten dette avsnittet er tallet over en påstand vi ikke kan holde. */}
      <section className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <h2 className="font-serif text-lg font-semibold text-forest-900">{t.heading}</h2>
        <p className="text-sm text-gray-700">
          {t.p1a}
          <strong>{t.p1strong}</strong>
          {t.p1b}
        </p>
        <p className="text-sm text-gray-700">
          {t.p2a}
          <strong>{t.p2strong}</strong>
          {t.p2b}
        </p>
        <p className="text-sm text-gray-700">{t.p3}</p>
      </section>

      <aside className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="space-y-1 text-sm text-amber-900">
          <p className="font-semibold">{t.aldriSpis}</p>
          {land === 'SE' ? (
            <p>
              Ingen app, och ingen webbplats, kan säga att en svamp är säker att äta. Är du osäker, låt den
              stå, eller få den bedömd av en svampkonsulent. Vid misstanke om förgiftning: ring
              Giftinformationscentralen, <a href="tel:112" className="font-semibold underline">112</a> (akut)
              eller <a href="tel:0104566700" className="font-semibold underline">010-456 67 00</a>.
            </p>
          ) : (
            <p>
              Ingen app, og ingen nettside, kan si at en sopp er trygg å spise. Er du i tvil, la den stå — eller
              få den kontrollert av en soppsakkyndig.{' '}
              <a href="https://soppkontroll.no" className="underline" rel="noopener noreferrer" target="_blank">
                soppkontroll.no
              </a>{' '}
              viser kontroller nær deg. Ved mistanke om forgiftning: ring Giftinformasjonen{' '}
              <a href="tel:22591300" className="font-semibold underline">22 59 13 00</a>.
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
