# Apple Search Ads — kampanjeoppsett for Mycelet

> **Apple-provisjon (oppdaget 2026-08-30):** kontoen var IKKE påmeldt Small
> Business Program — salgene til nå har hatt **30 %** provisjon (~139 kr netto
> per Sesongpass, ikke ~169). Påmelding sendt inn 2026-08-30 («Thank you for
> your submission»); 15 % gjelder normalt fra måneden etter godkjenning, dvs.
> trolig fra ~1. september — perfekt mot annonsestarten. Sjekk bekreftelses-
> e-posten fra Apple. CAC-regnestykket dag 14 bruker riktig sats for perioden.

Laget 2026-08-30. Beslutningsgrunnlaget: med ~169 kr igjen per Sesongpass
(249 kr − mva − Apples 15 %) er App Store-søk den ene betalte kanalen der
kunde­kostnaden realistisk havner UNDER det en kunde er verdt (estimert
CAC 45–120 kr i normalscenarioene, mot 250 kr+ på Meta i beste fall).
Grunnen er intensjon: den som søker «svampapp» har allerede bestemt seg for å
laste ned noe — vi betaler for å være førstevalget, ikke for å skape behovet.

Timing: sesongtoppen for «sopp»/«svamp»-søk er ca. 1. september–medio oktober.
Kampanjen bør stå på gjennom hele vinduet og skrus AV i november (sett
sluttdato — ikke la den stå og dryppe gjennom vinteren).

## Kontooppsett (Sindre gjør dette — engangsjobb, ~15 min)

1. Gå til **searchads.apple.com** → logg inn med Apple-ID-en som eier
   utviklerkontoen (sindre.alstad@gmail.com).
2. Velg **Search Ads Advanced** (IKKE Basic — Basic gir ingen kontroll på
   søkeord, og hele strategien under avhenger av den kontrollen).
3. Koble kontoen til App Store Connect-appen (Mycelet, ASC app-id 6784672944)
   når veiviseren spør.
4. Legg inn betalingskort under Account Settings → Billing.
5. Valuta: velg NOK. (Kampanjen mot Sverige budsjetteres da også i NOK —
   helt fint.)

Ingen annonser må «lages»: Search Ads bygger annonsen automatisk av
butikksidens ikon, tittel, undertittel og skjermbilder. (Custom Product Pages
kan testes senere — ikke nå.)

## Struktur: to kampanjer, fire annonsegrupper hver

**Kampanje 1 — NO (storefront: Norway):** start NÅ.
**Kampanje 2 — SE (storefront: Sweden):** klar til start — svensk
butikkside verifisert live 2026-08-30 (v1.0.1: «Mycelet: Svampkarta & prognos»).

Budsjett: **250 kr/dag per kampanje**, 14 dagers evaluering ≈ 3 500 kr per
land. Daily cap settes på kampanjenivå.

### Kampanje NO — annonsegrupper

Alle søkeord legges inn som **exact match** der annet ikke er nevnt.
Search Match: AV i gruppe 1–3, PÅ kun i gruppe 4.

**1. Merkevare** (maks CPT 2 kr)
- `mycelet`
- Nesten gratis, og hindrer at konkurrenter kjøper navnet ditt. Alltid på.

**2. Kategori — høy intensjon** (maks CPT 6 kr — her ligger tyngden)
- `soppapp`, `sopp app`, `soppguide`, `soppjakt`, `sopptur`,
  `kjenne igjen sopp`, `soppkart`, `matsopp app`, `soppkjenner`,
  `sopp identifisering`

**3. Arter** (maks CPT 4 kr)
- `kantarell`, `steinsopp`, `traktkantarell`, `matsopp`, `soppsesong`
- Lavere bud: intensjonen er god men blandet (noen vil ha oppskrifter).

**4. Discovery** (maks CPT 3 kr, Search Match PÅ, brede varianter)
- Jobben er å FINNE søkeord vi ikke tenkte på. Sjekk «Search terms»-rapporten
  ukentlig: termer som konverterer flyttes til gruppe 2/3 som exact,
  termer som brenner penger legges til som negative.

**Negative søkeord — kampanjenivå, exact + broad. IKKE HOPP OVER DETTE:**
«sopp» på norsk er også fotsopp og underlivssopp — uten disse negativene går
budsjettet til folk som leter etter apotekvarer:

```
fotsopp, neglesopp, hudsopp, skjedesopp, underlivssopp, sopp i underlivet,
munnsopp, candida, soppinfeksjon, soppkrem, soppbehandling
```

### Kampanje SE — annonsegrupper (speiler NO)

**1. Merkevare** (2 kr): `mycelet`

**2. Kategori** (6 kr): `svampapp`, `svamp app`, `svampguide`,
`identifiera svamp`, `svampplockning`, `svampkarta`, `svampkännare`,
`matsvamp app`

**3. Arter** (4 kr): `kantarell`, `karl johan`, `trattkantarell`, `stensopp`,
`svampsäsong`

**4. Discovery** (3 kr, Search Match PÅ)

**Negative (kampanjenivå)** — «svamp» er også kjøkkensvamp og infeksjon:

```
fotsvamp, nagelsvamp, hudsvamp, svamp i underlivet, candida, svampinfektion,
tvättsvamp, disksvamp, badsvamp, svampdräkt
```

## Måling — kjeden finnes allerede, ingen kode trengs

- **Search Ads-konsollen:** forbruk, trykk, installasjoner (taps → downloads)
  per søkeord. Dette er CAC-tellerens øverste ledd.
- **RevenueCat:** nye betalende abonnenter i perioden (Overview → Active
  subscriptions; sandbox er filtrert bort i produksjonstallene).
- **Regnestykket etter 14 dager:**
  `CAC = totalt forbruk / nye betalende i samme vindu`.
  Vær ærlig om vinduet: en del konverterer dager etter install, så regn på
  hele 14-dagersperioden, ikke per dag.

**Beslutningsregler (bestemt på forhånd, så vi slipper å synse i oktober):**

| CAC etter 14 dager | Gjør |
|---|---|
| < 150 kr | Skru daily cap opp (500 kr/dag), fortsett ut sesongen |
| 150–250 kr | Behold nivået; kutt annonsegrupper/ord med dårligst tap-to-install |
| > 250 kr | Skru av kategorigruppene, behold kun merkevare-gruppen. Sesongen er for kort til å optimalisere seg ut av det |

Sekundærsignal uansett CAC: **tap-to-install-raten** per søkeord. Under ~30 %
betyr at butikksiden ikke innfrir det søket lovet — da er det ASO-en (tittel,
skjermbilder), ikke budet, som skal justeres.

## Hva dette bevisst IKKE er

- Ingen Meta/Google-annonser: CAC-matten går ikke opp (250 kr+ i BESTE fall).
- Ingen flerkanalskampanje, landingssider eller e-postsekvenser: én kanal,
  fem–ti søkeord, én konsoll. Kompleksitet er kostnad.
- Ingen web-funnel-avhengighet: kjøpet skjer i appen via IAP, så målingen
  over fungerer uten web-analytics. (Web-analytics er fortsatt verdt å gjøre
  for de ORGANISKE kanalene — egen sak.)

## Sjekkliste

1. ✅ 2026-08-30: Konto opprettet (Search Ads Advanced, valuta **USD** — NOK
   støttes ikke; kurs ~10:1 gjør omregningen triviell, alle bud satt i USD)
2. ✅ 2026-08-30: Kampanje **NO – Kategori** live (ID 2144561263), $25/dag,
   30. aug → 15. nov, Manage Bids, 11 negative søkeord (Broad) på kampanjenivå
3. ✅ 2026-08-30: Alle fire annonsegrupper opprettet og verifisert:
   Kategori – exact $0.60 / Merkevare – exact $0.20 / Arter – exact $0.40
   (alle Search Match AV, exact-klammer) + Discovery – search match $0.30
   (Search Match PÅ, ingen søkeord). Status «App pending review» — Apples
   engangsgodkjenning av appen for annonsering, går live av seg selv.
4. 🔜 Sindre: verifiser at betalingskort ligger inne (Account Settings →
   Billing) — uten kort står kampanjen godkjent men bruker ingenting
5. 🔜 Ukentlig, 5 min: Search terms-rapporten → flytt/negativér (Claude kan
   analysere rapporten hvis du limer den inn eller eksporterer CSV)
6. 🔜 **Tirsdag 9. september: sjekkpunkt** (ramme 2 000 kr 5.–19. sep, se
   `docs/strategi-2026-2027.md` § 5 pkt. 4): levering per ord etter
   budøkningene 5. sep, kost per NY nedlasting, og «kom tilbake» blant
   app-registrerte i dagsrapporten (målt fra 6. sep, kilde «app»)
7. 🔜 **13. september: dag 14** — CAC-regnestykket + beslutningsregelen over
8. ✅ 2026-09-05: Første budjusteringer etter uke 1 (39 klikk, ~22 inst.):
   SE «kantarell» (Arter – exact) $0,40 → **$0,90** (11 klikk, 9 inst.),
   SE Discovery $0,35 → **$0,45** (4 inst. à $0,45). NO uendret i påvente av
   Keywords-skjermbilde for «Kategori – exact» (+25 % på ordene med inst.).
9. ✅ 2026-08-30: Kampanje **SE – Kategori** live (ID 2144564134) — samme
   oppsett som NO: $25/dag, 30. aug → 15. nov, 10 negative søkeord (Broad),
   fire annonsegrupper (Kategori $0.60 / Arter $0.40 / Merkevare $0.20, alle
   Search Match AV + Discovery $0.30 med Search Match PÅ). Forutsetningen ble
   verifisert først: svensk butikkside var alt live (v1.0.1, ~26.08).
   Totalbudsjett begge land: **$50/dag** (~7 000 kr over 14-dagersvinduet).
