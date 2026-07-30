# Fra ENK til AS — sjekkliste

Planen er å flytte Mycelet fra enkeltpersonforetaket ØVERÅS APPS (org.nr 937 880 871) til et aksjeselskap så snart appen har tjent inn nok til å betale for prosessen. Dette dokumentet finnes for at skiftet ikke skal bli en arkeologisk utgraving.

Kort oppsummert: **kode-delen er ett minutt. Betalings- og Apple-delen er der jobben ligger** — og den ene beslutningen som bør tas *før* App Store-innsending står nederst.

---

## 1. Koden — én redigering

Åpne [`src/lib/legal/entity.ts`](../src/lib/legal/entity.ts) og endre:

```ts
export const LEGAL_ENTITY: LegalEntity = {
  form: 'as',                    // ← var 'enk'
  legalName: 'MYCELET AS',       // ← nytt registrert navn
  orgNr: '999 999 999',          // ← nytt org.nr
  postalAddress: 'Postboks …',
  phone: '+47 …',
  ...
};
```

Det er alt. Navnet og organisasjonsnummeret er parameterisert i alle tre juridiske dokumenter på begge språk, og `form: 'as'` bytter automatisk til AS-varianten av de to klausulene som må formuleres annerledes:

- `Kjopsvilkar.sellerFormNoteAs` erstatter ENK-avsnittet om at innehaveren er personlig ansvarlig
- `Personvern.controllerNameAs` gjør selskapet behandlingsansvarlig istedenfor Sindre personlig

Testene i `src/lib/legal/__tests__/entity.test.ts` slår ut hvis noen senere skriver navnet eller org.nummeret rett inn i teksten igjen.

Husk også å oppdatere `docs/app-store-metadata.md` (copyright-feltet) — den er dokumentasjon, ikke kode, så den følger ikke automatisk.

## 2. Varsle kundene — før skiftet

Overdragelsesklausulen (Vilkår punkt 11, Kjøpsvilkår punkt 9) gir oss rett til å overdra avtalen, men **bare mot varsel i god tid**, og kunden kan si opp med forholdsmessig refusjon hvis hen ikke vil fortsette. Det er den betingelsen som gjør klausulen holdbar mot en forbruker — ikke drop den.

Varselet må inneholde navn og organisasjonsnummer på den nye parten, at pris og periode er uendret, og at rettighetene følger med.

## 3. Stripe — den vanskeligste delen

Et nytt rettssubjekt kan ikke bare bytte navn på Stripe-kontoen. Regn med at abonnementene må etableres på nytt.

- [ ] Avklar med Stripe support om kontoen kan endre juridisk eier, eller om det må opprettes ny konto (spør *før* du stifter AS-et, svaret styrer rekkefølgen)
- [ ] Hvis ny konto: nye produkter og priser, nye webhook-hemmeligheter, nye miljøvariabler (`STRIPE_SECRET_KEY_LIVE`, `STRIPE_WEBHOOK_SECRET_LIVE`, `STRIPE_PRICE_*`)
- [ ] Kartlegg aktive abonnementer først. Betalingsmandatet er gitt til ENK-et — det følger ikke automatisk med til AS-et
- [ ] Kjøpsvilkår punkt 9 sier allerede at kunden må bekrefte en ny betalingsavtale hvis det blir nødvendig, og at ingen belastes uten å ha godkjent det. Hold det løftet
- [ ] `billing_subscriptions` i Supabase peker på Stripe-id-er. Ved ny konto må radene migreres eller merkes som avsluttet

## 4. Apple — les dette FØR App Store-innsending

Dette er beslutningen som er lettest å angre på hvis den tas ubevisst.

Apple-kontoen er i dag **Individual**-innmelding (aktiv, utløper 2027-06-17). Et AS krever **Organization**-innmelding, som krever D-U-N-S-nummer. Det er ikke en navneendring — det er en ny innmelding pluss en apptransport mellom kontoer.

To veier:

**A. Send inn nå som Individual, flytt senere.** Raskest til lansering. Men apptransport i App Store Connect har forutsetninger: ingen ventende avtaler, appen kan ikke bruke visse capabilities, og abonnement-IAP-er er en kjent komplikasjon — kjøpshistorikk og aktive abonnenter følger appen, men prosessen må gjøres riktig. Verifiser Apples gjeldende krav for apper med auto-fornyende abonnement før du regner med at det går glatt.

**B. Vent med innsending til AS-et er stiftet, meld inn som Organization.** Tregere til lansering, men du slipper flyttingen helt.

- [ ] Ta denne beslutningen bevisst. Ikke la den avgjøres av at innsendingen tilfeldigvis skjedde først
- [ ] Skaff D-U-N-S-nummer tidlig hvis du velger B — det tar tid
- [ ] DSA trader-status må erklæres på nytt for det nye rettssubjektet, med ny adresse og telefon

## 5. RevenueCat, Google, øvrige kontoer

- [ ] RevenueCat er koblet til Apple- og Google-kontoene. Skifter de, må RevenueCat konfigureres om
- [ ] Google Play-konto: samme problemstilling som Apple hvis appen kommer dit
- [ ] Vercel, Supabase, Domeneshop, Kindwise: kontoene kan bestå, men fakturamottaker og **databehandleravtalene** er inngått med ENK-et. Avtalene må signeres på nytt i AS-ets navn — det er AS-et som blir behandlingsansvarlig
- [ ] `post@mycelet.com` og domenet bør eies av AS-et

## 6. Regnskap og avgift

Din regnskapsførers bord, men konsekvenser for koden og tekstene:

- [ ] MVA-nummer endres. Kjøpsvilkårene sier priser inkluderer mva — sjekk at satsen og formuleringen fortsatt stemmer
- [ ] Åpent spørsmål fra vilkårsgjennomgangen: er det registreringsplikt for MVA i EU for salg av digitale abonnement til svenske forbrukere? Det finnes ingen bunngrense. Avklar dette uansett selskapsform — svaret endrer seg ikke av skiftet, men det bør ikke gå i glemmeboka i prosessen
- [ ] Overføring av eiendeler (kode, domene, varemerke) fra ENK til AS er en transaksjon med skattemessige konsekvenser

## 7. Etterpå

- [ ] Kjør `npm run test` — testene i `src/lib/legal/` fanger opp gjenglemte hardkodinger
- [ ] Sjekk `/vilkar`, `/kjopsvilkar` og `/personvern` på både norsk og svensk
- [ ] Oppdater `docs/reports/deploys.md` med skiftet
- [ ] Sett ny «Sist oppdatert»-dato og versjonsnummer i `Vilkar.lastUpdatedBody` (begge språk)

---

## Fortsatt uløst, uavhengig av selskapsform

Oppdatert 30. juli 2026. Sindre har besluttet å lansere uten juridisk gjennomgang, så der loven er uklar er vilkårene lagt om til den konservative siden — vi gir forbrukeren rettigheten framfor å hevde et unntak som kanskje ikke holder.

**Gjenstår:**

1. **Postadresse og telefonnummer mangler.** Obligatorisk etter angrerettloven § 8 og ehandelsloven § 8. Feltene finnes i `entity.ts` og er bevisst tomme framfor oppdiktede. Bruk postboks — App Store publiserer adressen offentlig. En test sier hvilke felter som står tomme
2. **Blokker-bruker mangler.** Apples retningslinje 1.2 krever det for apper med brukerinnhold, og det er en sannsynlig avvisningsgrunn ved første innsending
3. **Ingen tilgjengelighetserklæring.** EUs tilgjengelighetsdirektiv treffer oss ikke (mikrobedriftsunntak for tjenester), men den norske forskriften krever WCAG 2.0 AA uten størrelsesunntak
4. **Offentlig meldeskjema.** Vilkårene peker nå på e-post, som er tilstrekkelig. Et skjema uten innlogging ville vært bedre, men krever en e-postleverandør koblet til Next-appen
5. **MVA i EU.** Åpent: er en norsk ENK som selger digitale abonnement til svenske forbrukere registreringspliktig? Det finnes ingen bunngrense. Spørsmålet endres ikke av selskapsskiftet, men bør ikke glemmes i prosessen
6. **DSA artikkel 13** — juridisk representant i et EU-land. Den ene plikten som koster penger årlig. Vurder bevisst, ikke la den ligge

**Gjort 30. juli 2026:**

- Angreretten: vi bygger ikke lenger på unntaket for digitalt innhold. Kjøpsvilkår punkt 4 gir 14 dager også ved umiddelbar levering, med det forholdsmessige fradraget angrerettloven tillater. Avkrysningsteksten i kassen sier nå det samme
- Samtykket til umiddelbar levering sendes til serveren, kjøp uten det avvises, og tidspunkt + tekstversjon lagres i Stripe-sesjonens metadata
- Kjøpsvilkårene dekker to kanaler: Stripe på nett og Apple IAP i appen, med riktig part for oppsigelse og refusjon, og en advarsel mot å kjøpe i begge
- Forbudsliste tilpasset norsk og svensk rett: narkotiske sopper (med lovgrunnlag), farlige identifikasjonsråd, andres personopplysninger i bilder, salg av plukket sopp, og plukkerett formulert som allemannsrett — ikke som amerikansk «private property»
- Sikkerhetspunktet dekker nå råd fra andre brukere, forumets største skadekanal, inkludert at merker ved brukernavn ikke betyr kvalifisert
- Ansvarspunktet: fjernet den uhåndhevbare setningen om å handle på informasjon i tjenesten, lagt inn produktansvarsforbehold, og sagt eksplisitt at vi ikke opererer med noe kronetak
- «Som den er» navngir digitalytelsesloven, så den ikke leses som en fraskrivelse av lovens krav
- Moderasjonspunkt etter mønster av DSA: meldekanal åpen for alle uten konto, menneskelig vurdering innen 7 dager, begrunnelse til den som mister innhold, klagerett i seks måneder, kontaktpunkt med språk
- Rapportkategorier utvidet med ulovlig innhold, narkotika, personopplysninger, vernet art og salg (migrasjon 031) — de fantes ikke, så meldekanalen kunne ikke fange opp det vilkårene forbyr
- Aldersgrensen er gjort sammenhengende: 18 for kjøp, 13 for konto, 13–18 med samtykke fra foresatt
- Nytt punkt 6b: tilbakemeldinger, hva som skjer med data når kontoen avsluttes, og hvordan vi kontakter deg
- ODR-henvisningene fjernet, utkast-stemplet fjernet, RevenueCat og Apple inn i personvernerklæringen
