/**
 * Skjelettene loading.tsx-filene viser mens en serverside henter data.
 *
 * Uten dem ble forrige skjerm stående urørt til hele svaret var kommet — i
 * appen, på én strek dekning, så et trykk på «Kart» ut som om ingenting
 * skjedde. loading.tsx rendrer PageWrapper rundt skjelettet, så toppen og
 * bunnmenyen står der med en gang, med riktig fane markert.
 *
 * Bare innloggede sider uten søkeverdi har en loading.tsx (kart, profil, mine
 * steder, identifiseringer). ALDRI i roten av src/app, og aldri under
 * species/ eller soppforhold/: når strømmingen først har startet, kan
 * notFound() og redirect() ikke lenger sette HTTP-status — en ukjent art ville
 * svart 200 i stedet for 404.
 *
 * Bevisst uten tekst (ingen strenger å oversette) og uten bruksmåling:
 * <RegistrerBruksdag> hører til den EKTE siden, ellers ville en side som aldri
 * ble vist blitt telt som en bruksdag.
 *
 * Pulsen står bak `motion-safe:` — med «Reduser bevegelse» er blokkene stille.
 */

const BLOKK = 'rounded-xl bg-gray-200/70 motion-safe:animate-pulse';

/** Overskrift og noen kort — passer sidene som er en liste under en tittel. */
export function SideSkjelett({ kort = 3 }: { kort?: number }) {
  return (
    <div className="space-y-4" aria-busy="true">
      <div aria-hidden="true" className="space-y-2">
        <div className={`h-3 w-28 ${BLOKK}`} />
        <div className={`h-8 w-48 ${BLOKK}`} />
        <div className={`h-4 w-full max-w-sm ${BLOKK}`} />
      </div>
      <div aria-hidden="true" className="space-y-3">
        {Array.from({ length: kort }, (_, i) => (
          <div key={i} className={`h-24 ${BLOKK}`} />
        ))}
      </div>
    </div>
  );
}

/**
 * Kartsiden: tittellinje og en flate med NØYAKTIG kartets høyde (samme
 * klasser som beholderen i MushroomMap), så siden ikke hopper når kartet
 * kommer. Endres høyden der, må den endres her.
 */
export function KartSkjelett() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div aria-hidden="true" className={`h-8 w-24 ${BLOKK}`} />
      <div
        aria-hidden="true"
        className={`h-[calc(100vh_-_13.25rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] min-h-[20rem] border border-gray-200 supports-[height:100dvh]:h-[calc(100dvh_-_13.25rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] ${BLOKK}`}
      />
    </div>
  );
}
