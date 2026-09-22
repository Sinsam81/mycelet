# Konverteringsgrep, september 2026

> Skrevet 22. september 2026 på databaseuttrekk samme dag, tre uavhengige rangeringer og åtte motprøvde påstander. Tallene er små; alt leses med nevner.

## 1. Hvor pengene ligger

Trakten siden 12. september: 82 kontoer (68 fra appen), 8 ekte prøver; den niende var en forlatt nettkasse.

| Steg | Basis | Per 100 kontoer |
|---|---|---|
| Installasjon som blir konto | ca. 104 av 328 (Apple Ads, 30 d) | 310 installasjoner bak |
| App-konto med bruksdag dag 0 eller 1 | 43 av 68 | 63 |
| Så tilbudsarket | 53 av 82 | 65 |
| Så prissiden | 23 av 82 | 28 |
| Startet prøve | 8 av 82 | 10 |
| Første belastning | 2 av 5 avgjorte | 3 til 4 |

**To ukjente.** Prøve til første belastning: 2 av 5, i App Store 1 av 3. Vent 25 til 35 %; lesbart først på 20 til 30 avgjorte prøver, rundt 1. november. Levetid: én kunde med historikk, sa opp etter to måneder. De to nye fornyes 21. og 22. oktober; et Sesongpass fornyes september 2027.

**Regnestykket.** Netto i App Store etter mva og Apples 15 %: 67 kr per måned, 169 kr per Sesongpass. Annonsene koster 23 kr per konto; med 10 % prøve og 30 til 40 % betaling koster én betalende 570 til 760 kr, mot 134 kr fra en månedskunde som betaler to ganger. Kanalen kjøper nevneren, ikke kunder. Per 100 kontoer gir ti poeng flere som ser arket, ti poeng flere app-kontoer med bruksdag, eller ti prosent flere kontoer hver 0,3 betalende. Passandel fra 1 av 8 til 3 av 8 gir like mange kunder, men 169 kr per kunde i stedet for 67 til 134.

## 2. Grepene, rangert

De tre merket **DENNE UKA** starter nå. Bare grep 3 trenger ny app-binær.

**1. Merge PR #274 «Følg {område}». DENNE UKA.**
Merge og se den på ekte telefon (kart, tillat posisjon, forsiden).
*Hvorfor:* 39 av 82 kontoer har én bruksdag; bare 5 av 25 varselabonnenter har konto. Varselet er appens eneste vei tilbake.
*Effekt:* 0 til 1 betalende nå; lista til august 2027. *Innsats:* 0,2 dag. *Eieren:* 15 minutter på telefonen. *Måles:* rader med kilde «hjem-ett-trykk» blant neste 80 kontoer; realistisk 8 til 12.

**2. Påminnelse før trekket for App Store-prøver. DENNE UKA, klar 25.9.**
Daglig kjøring over løpende App Store-prøver, e-post to til tre dager før trekk, sendt-merke i egen tabell, beløp bare når butikkprisen er lagret.
*Tekst:* Emne «Gratisuka di i Mycelet slutter {dato}». «Vil du ikke fortsette, avslutter du under Abonnementer i App Store. Vil du fortsette, trenger du ikke gjøre noe.» Ett spørsmål med ett trykk: hva var viktigst?
*Hvorfor:* Apple sender ingen påminnelse. Fire prøver slutter 26. til 28.9. Den ene betalende app-kunden åpnet appen dag 0 og dagen etter trekket.
*Effekt:* 0 til minus 1 betalende, null refusjoner. *Innsats:* 0,75 dag. *Eieren:* lime inn én migrasjon. *Måles:* oppsigelser innen 48 timer etter e-posten, refusjoner (basis 0).

**3. Send 1.0.2 nå, test AI-en, AI sist overalt. DENNE UKA.**
Innsending med prisrettelsen («aktuelle priser vises i appen og i App Store») og ny rekkefølge i butikkteksten. Eieren tester AI-soppkjenneren som vanlig gratisbruker; Claude legger Kindwise-sjekk i /api/health og retter språkkoden («no» støttes ikke).
*Tekst:* Forsidekortet «Hele prognosen med Premium», ikke «Finn mer sopp». Rekkefølge overalt: 12 områder med begrunnelse, offline-kart, AI sist.
*Hvorfor:* Butikken sier 79 kr, appen trekker 99. Nøkkelen i den lokale env-fila har brukt 0 av 2 050 Kindwise-kreditter noensinne, og begge identifiseringstabellene i produksjon er tomme. Produksjonen bruker nøkkelen i Vercel, som ikke kan leses herfra, så eierens testbilde avgjør om AI-en noen gang har virket.
*Effekt:* hindrer refusjoner og avvisning. *Innsats:* 0,5 dag, bygg ja. *Eieren:* ett testbilde, én innsending. *Måles:* Kindwise-forbruk 0 til 1 og en rad i ai_identifications samme minutt; 1.0.2 godkjent innen 1.10.

**4. Sesongpass først, sant.**
Eieren sjekker først i App Store Connect om Sesongpass har gratisuke i både Norge og Sverige; bare Norge er bevist. Deretter Sesongpass først på prissiden og i arket, med begge butikkprisene og uten forhåndsvalg.
*Tekst (bare når butikken gir gratisuke på passet):* «Prøv Sesongpass gratis i 7 dager. Passet gjelder til ca. {dato}: resten av høsten nå, og neste sesong fram til da. Deretter {pris} per år. Fornyes {dato} om du ikke avslutter, også i prøveuka.» Under: «Heller måned for måned? {pris} per måned.»
*Hvorfor:* 7 av 8 prøver valgte måned; arket nevner bare Premium. Ærlig: 99 kr dekker resten av sesongen; argumentet er 2027.
*Effekt:* like mange betalende, kanskje én færre; 2 til 3 passkunder som fornyes i 2027. *Innsats:* 0,75 dag. *Eieren:* 5 minutter i App Store Connect. *Måles:* passandel av neste 12 prøver (basis 1 av 8; 3 er signal), per land; minst 8 prøver per 80 arkvisninger. Alene i uke 2.

**5. Registrering med to felt færre, og «Lag gratis konto».**
Fjern brukernavn og visningsnavn (de utledes uansett). Bytt førsteskjermens «Prøv gratis», som kolliderer med Premiums gratisuke.
*Tekst:* «Se soppforholdene der du er. Gratis konto: tallet for stedet du står, de 3 mest lovende områdene rundt deg, og et varsel den dagen det snur.»
*Hvorfor:* 183 førsteskjerm-åpninger mot 65 skjemavisninger på åtte dager.
*Effekt:* +0,5 betalende; ulesbart alene. *Innsats:* 0,5 dag. *Måles:* skjemavisninger mot app-kontoer per uke (basis 43 av 64).

**6. Spør dem som avgjorde.**
Én e-post hver til de 8 prøvestarterne, augustkunden og kontoen som forlot Sesongpass-kassen 22:16. Tre spørsmål, ingen rabatt, ingen frist. Claude skriver, eieren sender som Mycelet.
*Tekst (svensk, til kassen):* «Priset visas i norska kronor. Var det något som stoppade dig?»
*Hvorfor:* Ni mennesker er hele nevneren; «hvilken art jakter du på» avgjør vinterbygget.
*Effekt:* 0 til 1 gjenopprettet Sesongpass, 3 til 5 svar. *Innsats:* 0,2 dag. *Eieren:* én time. *Måles:* minst 3 svar på 7 dager.

**7. Foreningspulje 2, uten rabattkode.**
De ca. 45 lokallagene og klubbene som ikke er kontaktet, med Linköping som bevis uten navn («tre bekreftede påmeldinger fra én lenke på klubbens nettside») og kildemerket lenke per forening. Ingen kode.
*Limetekst:* «Soppvarsel for [område]: Mycelet regner ut soppforholdene hver natt og sender én e-post den dagen det snur. Ingen konto. Det sier når forholdene ligger til rette, ikke hvor soppen står.»
*Hvorfor:* Eneste kanal der én eiertime ga et kjøpsforsøk. Men 1 plassering av 11 på fem uker.
*Effekt:* 0 til 2 betalende innen 20.10. *Innsats:* 0,5 dag. *Eieren:* 5 til 10 e-poster om dagen, som Mycelet. *Måles:* bekreftede varselpåmeldinger per plassering (mål 5).

**8. Sporing og blindveien.**
Kildemerke på hver prissidelenke og på varselklikkets videresending. Områdesiden sender innloggede til kartet («Se det på kartet»), ikke til registreringsskjemaet.
*Hvorfor:* 5 til 7 prissidebesøk kan ikke tilskrives noe; en konto etter varselklikk står som «direkte/ukjent».
*Effekt:* 0 direkte. *Innsats:* 0,7 dag. *Måles:* pris-rader per kilde etter to uker.

**9. Bekreftelseskode i appen, og lekkasjen etter innlogging.**
Sekssifret kode i registreringsskjemaet i stedet for lenke i Safari, full sidelast til forsiden etterpå. Samtidig undersøkes hvorfor 8 av 68 app-kontoer logget inn og aldri fikk bruksdag.
*Tekst:* «Skriv inn koden fra e-posten. Du trenger ikke forlate appen.»
*Hvorfor:* Av 25 tapte app-kontoer bekreftet 10 aldri (koden hjelper ikke), 7 klikket lenka og kom aldri tilbake (koden fikser dette), 8 logget inn og forsvant likevel.
*Effekt:* +0,5 til +1 betalende. *Innsats:* 2 dager. *Eieren:* bytte Supabase-malen, teste kaldstart på ekte telefon. *Måles:* app-kontoer med bruksdag samme eller neste dag (basis 43 av 68; mål 36 av neste 50).

**10. Apple Ads: regel skrevet nå, avgjørelse 28.9.**
Rør ingenting før 28.9. Står Sverige da på 0 av 5 til 6 første belastninger mens Norge har 2, flyttes resten til Norge, og budsjettet legges på intensjonsord («trattkantarell», «svampläget», «soppforhold»). Av senest 20.10.
*Hvorfor:* 570 til 760 kr per betalende mot 67 til 169 kr netto. n på 6 beviser ingenting; beslutningen er reversibel.
*Effekt:* 0; sparer 1 500 til 2 500 kr. *Innsats:* 0. *Eieren:* 30 minutter. *Måles:* første belastning per tidssone 28.9, kost per konto per land.

## 3. Sesongen er snart over

**De neste fire ukene.** Uke 1: grep 1, 2 og 3, pluss eierens e-poster (6). Uke 2: grep 4 alene; 5 og 8 i samme utrulling; foreningspuljen starter; annonsebeslutningen 28.9. Uke 3: grep 9. Uke 4 (13. til 20.10): les alt med nevner, datostyr «Høysesongen er i gang» på prissiden, og send månedskundene én e-post før fornyelsen med tre likestilte valg: la det stå, bytt til Sesongpass i App Store (fra neste fornyelse), eller si opp og følg området gratis.

**Til august 2027.** Omslag-utløser for arkets andre visning. Sign in with Apple i 1.0.3. Artsvarsel etter svarene fra grep 6. Helgeutsikt med vinterstopp. Universal links. Kjøp rett fra arket når passandel og påminnelse er lest. Lista fra grep 1 og 7 er lanseringskanalen med null annonsekost.

## 4. Ikke gjør

- Ta gratisuka av månedsplanen: kutter prøvestarter, ulesbart på 20 prøver.
- Pristrapp fra mai 2027: bindende løfte på to betalende.
- Svensk pris på nett: to nettkasser i uka.
- 14 dagers prøve, omvendt prøve, pause-knapp: ulesbart, trekket havner i sesongslutten.
- Rabatt til dem som sa opp; purring av ubekreftede (16 ga null).
- Foreningskode SOPPKLUBB: må være lik i Stripe og App Store, ingen sandbox-test.
- «Vi minner deg på e-post» på arket før påminnelsen faktisk sender.
- Kjøp rett fra arket nå: først etter grep 2 og 4.
- Artsvarsel, omslag-utløser, helgeutsikt, vinn-tilbake-tilbud (krever iOS 18): vinter.
- Push, A/B-oppsett, prisendring, hard betalingsmur på prognose eller varsel.
- Presse med navn: eieren kan ikke fronte. Følgertall som sosialt bevis: 1 til 6 per område er anti-bevis.

## 5. Påstander som ble testet

| Påstand | Utfall | Det som gjelder |
|---|---|---|
| Kode i appen gir 80 % bruksdag | Avkreftet | Koden fikser 7 av 25 tapte. Mål 72 % |
| Arket må komme i de første minuttene | Holder delvis | Dag 0 er eksponeringsdagen. Flyttingen 14.9 kostet ingen prøver |
| 11 prøver av 80 kontoer er signal | Avkreftet | Status quo for 80 kontoer er 8; først 14 skiller seg ut |
| Prøve til betaling er minst 35 % | Avkreftet | 2 av 5. Vent 25 til 35 %; trengs 20 til 30 avgjorte |
| Sesongpass har gratisuke i begge butikker; passet først gir 5 av 12 | Holder delvis | Bevist bare i norsk butikk. Mål 3 av 12, per land |
| «Følg {område}» gir 16 av 80; varselklikk gir app-dag | Avkreftet | Realistisk 8 til 12. Klikk lander i Safari, ikke i appen |
| Intensjonskanaler konverterer 3 ganger bedre | Avkreftet | Nett mot app er en plattformeffekt (50 mot 24 % til prissiden); prøverate lik |
| AI-identifikasjonen virker i produksjon | Ubevist | Lokal nøkkel: 0 av 2 050 kreditter brukt; alle tabeller tomme. Vercel-nøkkelen ikke sjekket. Testbilde avgjør |

## 6. Mål 20. oktober

1. App-kontoer med bruksdag samme eller neste dag: minst 36 av de neste 50 (basis 63 %).
2. «Følg {område}» med kilde hjem-ett-trykk: minst 8 av de neste 80 kontoene (basis 5 av 89).
3. Passandel: minst 3 av de neste 12 prøvene (basis 1 av 8), per land, med minst 8 prøver per 80 arkvisninger.
4. Prøver med minst 2 bruksdager før dag 7: minst 5 av de neste 10 (basis 2 av 6). Refusjoner 0. 1.0.2 godkjent og AI bevist virkende.

Betalende: 5 til 7 ventes uansett. 8 eller flere er retning, ikke bevis.
