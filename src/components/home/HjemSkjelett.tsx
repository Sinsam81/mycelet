/**
 * Skjelettet forsiden viser mens innholdet hentes.
 *
 * Forsiden kan ikke ha en loading.tsx: den måtte ligget i roten av src/app, og
 * der ville den også pakket inn landingssiden og alle offentlige sider uten
 * egen loading-fil — notFound() og redirect() mister da HTTP-statusen sin (se
 * src/components/ui/SideSkjelett.tsx). Derfor står dette skjelettet som
 * fallback i en <Suspense> INNE i forsiden, etter at innloggingen er avgjort.
 *
 * Formen følger den ekte siden, så den ikke hopper når innholdet kommer:
 * midtstilt måned og overskrift, så prognosekortet i sin egen høyde
 * (min-h-[15rem], som i MushroomDayCard), så to kort.
 *
 * Samme regler som de andre skjelettene: ingen tekst (ingenting å oversette),
 * pulsen bak `motion-safe:`, og ALDRI bruksmåling her — <RegistrerBruksdag>
 * hører til kortet som faktisk viser en prognose.
 */

// Samme blokk som i SideSkjelett.tsx — endres utseendet der, endres det her.
const BLOKK = 'rounded-xl bg-gray-200/70 motion-safe:animate-pulse';

export function HjemSkjelett() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div aria-hidden="true" className="flex flex-col items-center gap-2 pt-2">
        <div className={`h-3 w-28 ${BLOKK}`} />
        <div className={`h-10 w-64 max-w-full ${BLOKK}`} />
        <div className={`h-4 w-44 ${BLOKK}`} />
      </div>
      <div aria-hidden="true" className={`min-h-[15rem] ${BLOKK}`} />
      <div aria-hidden="true" className="space-y-4">
        <div className={`h-40 ${BLOKK}`} />
        <div className={`h-36 ${BLOKK}`} />
      </div>
    </div>
  );
}
