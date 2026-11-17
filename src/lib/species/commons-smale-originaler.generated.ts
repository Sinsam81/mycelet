// AUTO-GENERERT av scripts/generate-commons-widths.mjs — IKKE REDIGER FOR HÅND.
// Artsbildene på Wikimedia Commons som er smalere enn 1280 piksler, med
// originalens bredde. Brukes som tak når artssiden velger bildebredde, så den
// aldri ber Commons om en oppskalert utgave (se commons-thumb.ts).
// Et bilde som IKKE står her er enten minst 1280 piksler bredt eller ukjent.
// Regenerer:  node --env-file=.env.local scripts/generate-commons-widths.mjs

export const COMMONS_BREDDER_META = {
  hentet: '2026-11-16',
  filer: 72,
  smale: 21,
  storsteTrinn: 1280
} as const;

/** Commons-filnavn (dekodet, mellomrom i stedet for understrek) → originalens bredde i piksler. */
export const COMMONS_SMALE_ORIGINALER: Readonly<Record<string, number>> = {
  '2006-09-14 Tylopilus felleus crop.jpg': 1000,
  '2009-11-19 Flammulina velutipes agg biolib.cz crop.jpg': 600,
  '2010-08-11 Russula claroflava Grove. ss. Melz, & Zv., J. Schff 98988.jpg': 1024,
  'Agaricus xanthodermus section.jpg': 1034,
  'Agasil0big.jpg': 800,
  'Amanita phalloides 1.JPG': 1200,
  'Amanita rubescens.JPG': 1200,
  'Birkenpilz01.jpg': 400,
  'Clitocybe dealbata 1.jpg': 689,
  'Corellanus.jpg': 650,
  'Cortinarius rubellus 01.jpg': 800,
  'Hedgehog fungi2.jpg': 800,
  'Lactarius deliciosus.jpg': 800,
  'Lactarius torminosus (cropped).jpg': 427,
  'Russ.ves.jpg': 1264,
  'Russula cyanoxantha.JPG': 480,
  'Russula decolorans.jpg': 600,
  'Russula emetica in Poland.jpg': 1227,
  'Scleroderma citrinum.jpg': 800,
  'Suill.var.jpg': 956,
  'Suillus bovinus 2011 10 07.jpg': 1014
};
