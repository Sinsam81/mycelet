/**
 * Fargene kartet bruker for spiselighet på de registrerte funnene.
 *
 * To sett, fordi de brukes til to forskjellige ting:
 *
 *  - MARKØREN er en fylt silhuett på kartet. Der skal fargen skille klassene
 *    fra hverandre på avstand, og den står aldri alene: formen sier hva som
 *    ble funnet, og popupen sier resten.
 *  - TEKSTEN i popupen («Arten regnes som: Betinget spiselig») er 12 px på
 *    hvit bunn. Den lånte markørfargen, og markørfargene er for lyse til å
 *    leses som tekst: gult (#f59e0b) ga 2,15:1 mot hvitt, oransje 2,80:1 og
 *    grønt 3,77:1. WCAG AA krever 4,5:1 — og linja om at en art er giftig rå
 *    er den som minst av alt bør være vanskelig å lese ute i dagslys.
 *
 * Tekstfargene er samme fargetone, to–tre trinn mørkere. Kontrasten er låst i
 * src/components/map/__tests__/kart-kontrast.test.ts.
 */
export const SPISELIGHET_MARKORFARGE: Readonly<Record<string, string>> = {
  edible: '#059669',
  conditionally_edible: '#f59e0b',
  inedible: '#f97316',
  toxic: '#dc2626',
  deadly: '#7f1d1d'
};

/** Markørfargen når arten mangler eller spiseligheten er ukjent. */
export const UKJENT_MARKORFARGE = '#8b5e34';

export const SPISELIGHET_TEKSTFARGE: Readonly<Record<string, string>> = {
  edible: '#047857',
  conditionally_edible: '#b45309',
  inedible: '#c2410c',
  toxic: '#b91c1c',
  deadly: '#7f1d1d'
};

/** Tekstfargen når spiseligheten er en verdi kartet ikke kjenner. */
export const UKJENT_TEKSTFARGE = '#374151';
