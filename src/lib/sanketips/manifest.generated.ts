// GENERERT av scripts/build-articles.mjs — ikke rediger for hånd.
// Kilde: content/sanketips/*.md

export interface SanketipsArtikkel {
  slug: string;
  lang: 'nb' | 'sv';
  title: string;
  summary: string;
  kicker: string | null;
  published: string | null;
  updated: string | null;
  /** Slug til samme artikkel på det andre språket (hreflang-par). */
  alternate: string | null;
  /** Antall spørsmål i «Spørsmål og svar»-seksjonen (FAQPage-schema). */
  faq: number;
}

export const SANKETIPS: readonly SanketipsArtikkel[] = [
  {
    "slug": "fem-forvekslinger",
    "lang": "nb",
    "title": "De fem forvekslingene nybegynnere gjør",
    "summary": "Hva du må se på under hatten, og hvilke arter du bør lære å kjenne igjen før du plukker dem du vil spise.",
    "kicker": "Trygg sanking · 8 min",
    "published": "2026-07-29",
    "updated": "2026-09-03",
    "alternate": null,
    "faq": 4
  },
  {
    "slug": "hva-viser-soppkartene",
    "lang": "nb",
    "title": "Hva viser soppkartene egentlig?",
    "summary": "Prikkene på et soppkart viser hvor folk har registrert funn — ikke hvor sopp vokser. Her er forskjellen, målt på våre egne data.",
    "kicker": "Data og kart · 9 min",
    "published": "2026-08-13",
    "updated": "2026-09-03",
    "alternate": null,
    "faq": 4
  },
  {
    "slug": "hvorfor-finner-du-ikke-sopp",
    "lang": "nb",
    "title": "Hvorfor finner du ikke sopp? Seks grunner, lest ut av været",
    "summary": "Tom kurv? Seks årsaker du kan sjekke selv — tørke, timing, temperatur, sesong, skogtype og hvem som gikk der før deg.",
    "kicker": "Vær og timing · 8 min",
    "published": "2026-08-14",
    "updated": "2026-09-03",
    "alternate": null,
    "faq": 4
  },
  {
    "slug": "les-terrenget",
    "lang": "nb",
    "title": "Slik leser du terrenget før du går",
    "summary": "Alder på skogen, mose, skyggesider og gamle skogsveier — tegnene som skiller en tom tur fra en full kurv.",
    "kicker": "Sanketips · 6 min",
    "published": "2026-07-29",
    "updated": "2026-09-03",
    "alternate": null,
    "faq": 4
  },
  {
    "slug": "naar-kommer-kantarellen",
    "lang": "nb",
    "title": "Når kommer kantarellen?",
    "summary": "19 592 daterte funn avliver julimyten — kantarellsesongen topper i september. Kurvene viser uke for uke når det løsner der du bor, i Norge og Sverige.",
    "kicker": "Vær og timing · 6 min",
    "published": "2026-09-01",
    "updated": "2026-09-03",
    "alternate": "nar-kommer-kantarellen",
    "faq": 3
  },
  {
    "slug": "naar-kommer-steinsoppen",
    "lang": "nb",
    "title": "Når kommer steinsoppen?",
    "summary": "15 423 daterte funn viser at steinsoppen topper i uke 35–36 — nesten samtidig over hele landet. Kurven, unntaket i nord, og hvorfor akkurat denne arten er den vanskeligste å varsle.",
    "kicker": "Vær og timing · 5 min",
    "published": "2026-09-02",
    "updated": "2026-09-03",
    "alternate": "nar-kommer-karljohan",
    "faq": 3
  },
  {
    "slug": "naar-kommer-traktkantarellen",
    "lang": "nb",
    "title": "Når kommer traktkantarellen?",
    "summary": "8 383 daterte funn tegner traktkantarellens sesong uke for uke — når den skyter fart, når den topper der du bor, og hvorfor første skikkelige regnvær er datoen å følge med på.",
    "kicker": "Vær og timing · 6 min",
    "published": "2026-08-26",
    "updated": "2026-09-03",
    "alternate": null,
    "faq": 3
  },
  {
    "slug": "nar-kommer-kantarellen",
    "lang": "sv",
    "title": "När kommer kantarellen?",
    "summary": "19 592 daterade fynd punkterar julimyten — kantarellsäsongen toppar i september. Kurvorna visar vecka för vecka när det lossnar där du bor, i Sverige och Norge.",
    "kicker": "Väder och timing · 6 min",
    "published": "2026-09-01",
    "updated": "2026-09-03",
    "alternate": "naar-kommer-kantarellen",
    "faq": 3
  },
  {
    "slug": "nar-kommer-karljohan",
    "lang": "sv",
    "title": "När kommer karl johan?",
    "summary": "15 423 daterade fynd visar att karljohan toppar vecka 35–36 — nästan samtidigt i hela Norden. Kurvan, det korta fönstret, och varför just den här arten är svårast att förutsäga.",
    "kicker": "Väder och timing · 5 min",
    "published": "2026-09-02",
    "updated": "2026-09-03",
    "alternate": "naar-kommer-steinsoppen",
    "faq": 3
  },
  {
    "slug": "sopp-etter-regn",
    "lang": "nb",
    "title": "Hvor lenge etter regnet kommer soppen?",
    "summary": "Om fukt, temperatur og de få dagene som skiller «for tidlig» fra «for seint» — grunnlaget for varselet i appen.",
    "kicker": "Vær og timing · 5 min",
    "published": "2026-07-29",
    "updated": "2026-09-03",
    "alternate": "svamp-efter-regn",
    "faq": 4
  },
  {
    "slug": "soppkart-over-norge",
    "lang": "nb",
    "title": "Soppkart over Norge: 428 829 funn — og hva de egentlig forteller",
    "summary": "428 829 registrerte sopfunn på ett kart — hva prikkene faktisk betyr, hvorfor 72 prosent av dem er historie, og hvordan du bruker et soppkart uten å bli lurt av det.",
    "kicker": "Kart og funn · 5 min",
    "published": "2026-09-02",
    "updated": "2026-09-03",
    "alternate": "svampkarta-over-sverige",
    "faq": 3
  },
  {
    "slug": "soppsesongen-2026",
    "lang": "nb",
    "title": "Soppsesongen 2026: slik ligger den an",
    "summary": "Slik ligger soppsesongen 2026 an, landsdel for landsdel — med dagens forholdstall for ni norske områder, artene som er i sesong nå, og ukene som kommer. Oppdateres gjennom høsten.",
    "kicker": "Sesongstatus · 4 min",
    "published": "2026-09-02",
    "updated": "2026-09-03",
    "alternate": "svampsasongen-2026",
    "faq": 3
  },
  {
    "slug": "soppvarsel-slik-virker-det",
    "lang": "nb",
    "title": "Soppvarsel: slik vet du når det snur",
    "summary": "Ett gratis e-postvarsel når soppforholdene snur i ditt område — bygget på vær-, skogs- og funndata for 22 områder i Norge og Sverige. Slik regnes det ut, og derfor sender vi maks én e-post i uka.",
    "kicker": "Soppvarsel · 5 min",
    "published": "2026-09-01",
    "updated": "2026-09-03",
    "alternate": "svampvarning-sa-fungerar-det",
    "faq": 4
  },
  {
    "slug": "svamp-efter-regn",
    "lang": "sv",
    "title": "Hur länge efter regnet kommer svampen?",
    "summary": "Om fukt, temperatur och de få dagar som skiljer «för tidigt» från «för sent» — grunden för varningen i appen.",
    "kicker": "Väder och timing · 5 min",
    "published": "2026-09-02",
    "updated": "2026-09-03",
    "alternate": "sopp-etter-regn",
    "faq": 4
  },
  {
    "slug": "svampkarta-over-sverige",
    "lang": "sv",
    "title": "Svampkarta över Sverige: 428 829 fynd — och vad de egentligen berättar",
    "summary": "428 829 registrerade svampfynd på en karta — vad prickarna faktiskt betyder, varför 72 procent av dem är historia, och hur du använder en svampkarta utan att bli lurad av den.",
    "kicker": "Karta och fynd · 5 min",
    "published": "2026-09-02",
    "updated": "2026-09-03",
    "alternate": "soppkart-over-norge",
    "faq": 3
  },
  {
    "slug": "svampsasongen-2026",
    "lang": "sv",
    "title": "Svampsäsongen 2026: så ligger den till",
    "summary": "Så ligger svampsäsongen 2026 till, landsdel för landsdel — med dagens förhållandetal för tretton svenska områden, arterna i säsong just nu, och veckorna som kommer. Uppdateras under hösten.",
    "kicker": "Säsongsstatus · 4 min",
    "published": "2026-09-02",
    "updated": "2026-09-03",
    "alternate": "soppsesongen-2026",
    "faq": 3
  },
  {
    "slug": "svampvarning-sa-fungerar-det",
    "lang": "sv",
    "title": "Svampvarning: så vet du när det vänder",
    "summary": "Ett gratis mejl när svampförhållandena vänder i ditt område — byggt på väder-, skogs- och fynddata för 22 områden i Sverige och Norge. Så räknas det ut, och därför skickar vi max ett mejl i veckan.",
    "kicker": "Svampvarning · 5 min",
    "published": "2026-09-01",
    "updated": "2026-09-03",
    "alternate": "soppvarsel-slik-virker-det",
    "faq": 4
  },
  {
    "slug": "svartbrun-rorsopp-og-gallsopp",
    "lang": "nb",
    "title": "Svartbrun rørsopp — og gallerørsoppen som lurer alle",
    "summary": "Svartbrun rørsopp er en av høstens mest oversette matsopper — og gallerørsoppen er dobbeltgjengeren som ødelegger gryta. 14 569 daterte funn viser når de kommer, og kjennetegnene skiller dem trygt.",
    "kicker": "Arter og forveksling · 6 min",
    "published": "2026-09-02",
    "updated": "2026-09-03",
    "alternate": null,
    "faq": 3
  }
];
