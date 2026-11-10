/**
 * Hvilke nummer ringelenkene til giftinformasjonen skal ha — delt av
 * serverkomponenten (PoisonHotlineLinks) og klienttvillingen
 * (PoisonHotlineLinksClient), slik at de to aldri kan komme i utakt.
 *
 * Sverige har TO nummer: 112 ved akutt fare, og 010-456 67 00 til
 * Giftinformationscentralen for alt som ikke er akutt. Norge har ett.
 * Regelen funksjonen håndhever: hver etikett hører til nøyaktig det nummeret
 * som ringes, og det samme nummeret kommer aldri to ganger — sammenligningen
 * på tel-målet gjør at Norge får én lenke.
 *
 * Numrene kommer fra `Safety`-namespacet i meldingskatalogen for leserens
 * språk (nb → Norge, sv → Sverige). De skal aldri hardkodes ved kallstedet.
 */
export interface Giftnummer {
  /** Det som står etter `tel:` — med landskode der nummeret har en. */
  tel: string;
  /** Teksten brukeren trykker på. */
  label: string;
}

type SafetyNokkel = 'poisonTel' | 'poisonAcuteLabel' | 'poisonTelDirect' | 'poisonDirectLabel';

export function byggGiftnummer(s: (key: SafetyNokkel) => string): Giftnummer[] {
  const akuttTel = s('poisonTel');
  const direkteTel = s('poisonTelDirect');
  const nummer: Giftnummer[] = [{ tel: akuttTel, label: s('poisonAcuteLabel') }];
  if (direkteTel !== akuttTel) {
    nummer.push({ tel: direkteTel, label: s('poisonDirectLabel') });
  }
  return nummer;
}
