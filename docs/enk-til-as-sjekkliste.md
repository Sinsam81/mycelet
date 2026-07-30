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

Overdragelsesklausulen (Vilkår punkt 10, Kjøpsvilkår punkt 9) gir oss rett til å overdra avtalen, men **bare mot varsel i god tid**, og kunden kan si opp med forholdsmessig refusjon hvis hen ikke vil fortsette. Det er den betingelsen som gjør klausulen holdbar mot en forbruker — ikke drop den.

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

Fra vilkårsgjennomgangen 30. juli 2026, i prioritert rekkefølge:

1. **Postadresse og telefonnummer mangler.** Obligatorisk etter angrerettloven § 8 og ehandelsloven § 8. Feltene finnes i `entity.ts` og er bevisst tomme framfor oppdiktede. Bruk postboks — App Store publiserer adressen offentlig
2. **Angreretten.** Kjøpsvilkår punkt 4 bygger på unntaket for digitalt *innhold*. Mycelet er antakelig en digital *tjeneste*, og da gjelder § 22 bokstav c, som først slår inn når tjenesten er «levert fullt ut» — noe et løpende abonnement aldri er innen 14 dager. Til jurist
3. **Samtykket til umiddelbar levering lagres ikke.** `agreedToPurchaseTerms` er kun nettleser-state; kroppen til `/api/billing/checkout` inneholder bare `{ plan }`. Ingen dokumentasjon på at kunden samtykket
4. **App Store-delen av kjøpsvilkårene.** Punkt 2 sier fortsatt at iOS-kjøp ikke er tilgjengelig, mens RevenueCat-IAP er implementert. Oppsigelse og refusjon går via Apple, ikke via oss
5. **Blokker-bruker mangler.** Apples retningslinje 1.2 krever det for apper med brukerinnhold
6. **Domenespesifikk forbudsliste.** Særlig narkotiske sopper — fleinsopp står på den norske narkotikalisten, og Sverige navngir Psilocybe semilanceata og cubensis
7. **DSA-pliktene** gjelder via de svenske brukerne (ikke via Norge — DSA er ikke innlemmet i EØS ennå): moderasjonsåpenhet, meldekanal som ikke krever innlogging, og begrunnelse til den som mister innhold
8. **Ingen tilgjengelighetserklæring.** EUs tilgjengelighetsdirektiv treffer oss ikke (mikrobedrift), men den norske forskriften krever WCAG 2.0 AA uten størrelsesunntak
