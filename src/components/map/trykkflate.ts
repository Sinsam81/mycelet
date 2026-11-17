/**
 * Treffflater på kartet.
 *
 * Kontrollene på kartet er små med vilje: de ligger oppå kartet, og hver
 * piksel de dekker er kart brukeren ikke ser. Men de betjenes ute, med
 * tommelen, ofte med våte fingre eller hansker — og flere av dem var 20–28 px
 * høye og sto tett: «Nullstill» på artsbrikken 20 px, kryssene i panelene
 * 22–24 px, knappene i verktøyraden 28 px. Retningslinjen er 44 × 44 px.
 *
 * TREFF_44 gir et element en usynlig flate på minst 44 × 44 px uten at det ser
 * større ut eller flytter noe rundt seg: et ::after som er like stort som
 * elementet, men aldri mindre enn 44 px i hver retning, sentrert på det. Et
 * trykk på flaten er et trykk på elementet.
 *
 * Elementet må selv være posisjonert (`relative`, `absolute` …). Klassen står
 * ikke her, fordi flere av kontrollene alt er `absolute`, og to
 * posisjonsklasser på samme element slår hverandre ut.
 *
 * Tre ting å passe på der den brukes:
 *  - Flaten kan nå inn over naboen. Verktøyraden er derfor lagt ut med 36 px
 *    høye rader og 8 px mellom dem: flatene møtes, men overlapper ikke. Der
 *    en flate likevel må dekke en nabo, vinner det som står sist i koden.
 *  - En forelder med `overflow` klipper flaten, og nederst i en rulleflate
 *    gjør den flaten rullbar hvis den stikker utenfor polstringen. Der brukes
 *    ekte polstring med negativ marg i stedet (se HotspotPanel).
 *  - Et <input> kan ikke ha ::after. Søkefeltet får flaten sin fra en etikett
 *    rundt seg — et trykk på en etikett setter fokus i feltet.
 *
 * Lukkekryssene bruker LUKKEKNAPP_KLASSER fra useDialogFokus, som er en ekte
 * 44 × 44 px knapp med negativ marg.
 */
export const TREFF_44 =
  "after:absolute after:left-1/2 after:top-1/2 after:h-full after:w-full after:min-h-[44px] after:min-w-[44px] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']";
