# Vekstplan — SEO og annonser

Laget 2026-08-08 via en orkestrert runde: fire uavhengige undersøkelser
(norsk søkeetterspørsel, svensk, hvem som eier søkene i dag, annonseøkonomi),
og en redaksjonell prioritering på toppen. **109 kilder lest.**

---

## ⚠️ TRE FUNN SOM ENDRER PLANEN

### 1. En direkte norsk konkurrent lanserte 6. august 2026

**Tyri**, fra Fiskher AS i Lillesand. Gjør nøyaktig det Mycelet gjør: GBIF-funn
på kart, værdata, skogtype, terreng, AI-artsgjenkjenning, soppvarsel bak
abonnement. Tyri PRO 360 kr/år.

Selskapet står bak **Fishbuddy med 1,2 millioner nedlastinger** (~600 000 i
Norge) og kan krysspromotere gratis. De sendte pressemelding via NTB og fikk
dekning samme dag.

Verifisert uavhengig: NTB-pressemelding 19012270, omtale i Kvinnheringen.

**Hva det betyr:** du kan ikke kjøpe deg forbi 600 000 gratis brukere med
50 kr dagen. Men de er i beta, og de har ikke det du har — en validert
fenologimodell og ærlighet om hva kartet IKKE kan si. Det er der du vinner,
ikke i en annonseauksjon.

### 2. mycelet.com ser ikke ut til å være indeksert av Google

Søk på domenet gir null treff. Alt innhold som skrives nå er derfor en
**2027-investering** — bortsett fra det som kan distribueres uten Google
(Facebook-grupper, presse, lenke i appen).

Verifiser i Search Console før noe annet. Sitemap og robots.txt kom på plass
2026-08-08.

### 3. «Mycelet» er opptatt i Sverige

**mycelet.se** er et svensk soppfirma med samme navn. Svensk merkevaresøk er
altså tapt på forhånd. Og **svampindex.se** gjør allerede det Mycelet gjør:
290 kommuner, ukentlig indeks 0–100 på regn, jordfuktighet, skogtype og sesong.

**Konsekvens: nedprioriter Sverige kraftig.** Norge står tomt; Sverige er
forsvart.

---

## 💸 GOOGLE ADS: IKKE BRUK PENGER NÅ

> **Revidert 2026-09-03.** Konklusjonen står som *salgskanal*. Men det kjøres
> én liten, avgrenset **test** (maks 1 500 kr, 4 uker, september 2026) for å
> bytte ut anslagene under — klikkpris, søkevolum, klikk per registrering — med
> målte tall. Hele oppskriften og beslutningsreglene: `docs/google-ads-test.md`.
> Registreringer og betalende per kilde måles nå i dagsrapporten
> (`src/lib/analytics/kilde.ts`).

NEI — ikke bruk penger på Google Ads nå. Ikke én krone denne sesongen. Tre grunner, i rekkefølge etter hvor avgjørende de er:

**1. Regnestykket går ikke opp — og det er ikke et sporingsproblem, det er et matematikkproblem.**
En betalende sesongpasskunde er verdt ca. 241 kr netto til deg (se «okonomi»). Med realistiske konverteringstall trenger du ~500 klikk per betalende kunde. Med norsk klikkpris på 10–20 kr blir det 5 000–10 000 kr for å skaffe en kunde som gir deg 241 kr. Du er 20–40 ganger under vann. Selv i det urealistisk beste tilfellet (10 % av besøkende registrerer seg, 10 % av dem betaler) er du 6 ganger under vann. Sporing fikser ikke dette. Sporing lar deg bare måle at det ikke virker.

**2. VERIFISERT: en direkte norsk konkurrent lanserte for to dager siden, med et distribusjonsapparat du ikke kan konkurrere med.**
Tyri, fra Fiskher AS i Lillesand, ble lansert 6. august 202

### Regnestykket

| | |
|---|---|
| Sesongpass 249 kr via Stripe | **241 kr netto** |
| Samme via Apple IAP (15 % + mva) | **169 kr netto** |
| Klikkpris norske soppsøk (anslag) | 12–18 kr |
| Klikk per betalende kunde (realistisk) | ~500 |
| **Kostnad per kunde verdt 241 kr** | **5 000–10 000 kr** |

**→ Send alltid annonsetrafikk til WEB, aldri til App Store.** Apple koster
72 kr mer per årskunde — 30 % av inntekten.

### Når du en dag SKAL kjøre annonser

Forutsetning: konverteringssporing må virke. Landingssiden har null JavaScript,
så verken Ads-taggen eller Analytics kjører der i dag.

**Kampanjetype:** kun Søk. Ikke Performance Max, uansett hva Google-supporten
sier — uten konverteringsdata sender den budsjettet til billig Display-lager.

**Slå av:** Displaynettverket og søkepartnere (står PÅ som standard).
**Stedsinnstilling:** «Tilstedeværelse», ikke «tilstedeværelse eller interesse».

**Søkeord (utvalg):**
`[soppvarsel]` · `"soppvarsel"` · `"soppvarsel norge"` · `[når kommer soppen]` · `"når kommer soppen"` · `"når kommer kantarellen"` · `"når er det sopp i skogen"` · `"soppsesong 2026"` · `"kantarellsesong"` · `"sopp etter regn"` · `"når plukke kantarell"` · `[soppapp]` · `[sopp app]` · `"app for sopp"` · `"beste soppapp"` · `"soppapp norge"` · `[soppkart]` · `"soppkart norge"`

**Negative søkeord — den viktigste lista.** Sopp betyr også fotsopp, muggsopp
og sopp i huset. Uten disse går budsjettet til folk som leter etter noe helt
annet:

`fotsopp` · `neglesopp` · `hudsopp` · `soppinfeksjon` · `underlivssopp` · `gjærsopp` · `candida` · `soppkrem` · `soppmiddel` · `soppdrepende` · `canesten` · `resept` · `reseptfri` · `apotek` · `salve` · `krem` · `kløe` · `symptomer` · `smitte` · `behandling` · `sopp i munnen` · `sopp i skrittet` · `øresopp` · `bleieutslett` · `fotsvamp` · `nagelsvamp` · `hudsvamp` · `svampinfektion` · `underlivssvamp` · `jästsvamp` · `svampkräm` · `receptfritt` · `apotek` · `klåda` · `salva` · `svamp i öronen` · `svamp i ljumsken` · `muggsopp` · `råtesopp` · `hussopp` · `kjellersopp` · `taksopp` · `mugg` · `soppskade` · `soppsanering`

---

## 📝 20 ARTIKLER — PRIORITERT PLAN

# Redaksjonell gjennomgang: 42 forslag → 20 prioriterte, med publiseringsplan

**Dato: lørdag 8. august 2026 = uke 32.** Alt nedenfor er tidfestet mot dette.

---

## 0. Tre ting som endrer hele prioriteringen (verifisert i dag)

**A. mycelet.com ser ikke ut til å være indeksert.** Søk på `mycelet.com soppapp sanketips` gir null treff på domenet — kun snl.no, uio.no og **[mycelet.se](https://mycelet.se/)**, som er et *svensk soppfirma med samme navn*. To konsekvenser:
1. **Ingen av artiklene under vil rangere i 2026-sesongen.** Et nytt domene uten lenker bruker måneder. Alt innhold som skrives nå er en 2027-investering — *unntatt* det som kan distribueres uten Google (Facebook-grupper, presse, lenke i appen, nyhetsbrev).
2. **Svensk merkevaresøk er allerede opptatt.** «Mycelet» i Sverige = mycelet.se. Det svekker hele den svenske innholdssatsingen ytterligere.

➡️ **Uke 33, før én eneste ny artikkel:** sjekk indeksering i Google Search Console, verifiser sitemap/robots, og få på plass en måling som virker uten JavaScript på landingssiden. Å skrive 20 artikler til et uindeksert domene uten måling er å skyte i blinde med bind for øynene.

**B. Det er tørke-år og NSNF sier det selv.** [soppognyttevekster.no/soppsesongen-2026](https://soppognyttevekster.no/soppsesongen-2026/) skriver at hetebølger og tørke har gjort at soppen har latt vente på seg, og at regnet som kommer nå kan redde sesongen. Siden inneholder **null prognose**. Det er *nå* folk lurer på om det er vits i å gå ut — og det er nøyaktig det modellen vår regner på.

**C. Det svenske forbildet er bekreftet levende og ferskt.** [svampindex.se/kommuner](https://svampindex.se/kommuner/) viser **290 av 290 kommuner**, data for uke 32, **oppdatert 7. august 2026**, med indeks 0–100 basert på regn, jordfuktighet, skogtype og sesong — og med ærlig forbehold om at det ikke er artsbestemmelse eller helseråd. Formatet er altså bevist, og Norge står tomt. Men det betyr også: **Sverige er forsvart av en aktør som gjør vårt produkt bedre enn oss på innhold.** Svensk innhold nedprioriteres kraftig i planen under.

**D. Kapasitet.** De tre eksisterende artiklene gikk gjennom mykologi-faktasjekk *og* sikkerhetsgjennomgang. Realistisk takt for én person: **én trygg artikkel per uke**, og en forvekslingsartikkel koster 2–3 uker. Listen under er derfor en plan fram til ~uke 48, ikke en sprint.

---

## ★ DE FEM SOM SKAL SKRIVES FØRST

Begrunnelse for utvalget: gitt at Google ikke leverer trafikk før 2027, er de eneste artiklene som betaler seg i 2026 de som (i) kan legges ut som verdi-først-innlegg i Facebook-grupper med én gang, (ii) er nyttige samme dag de publiseres, (iii) konverterer de få som faktisk kommer, og (iv) ikke krever en flere ukers kildejobb. Alle fem oppfyller minst tre av fire. **Ingen av de fem krever en eneste ny påstand om spiselighet.**

---

### 1. Soppforhold i Norge akkurat nå — oppdatert hver dag
**Uke 33** (start umiddelbart)
- **Søk:** soppforhold nå · har kantarellen kommet · soppsesongen 2026 · er det sopp i skogen nå
- **Hensikt:** Er det verdt å dra ut i helga, der jeg bor — uten å lage konto.
- **Appdata:** flush-timing, værmodell (MET Frost/SMHI), jordfuktighetsindeks, fenologi per art. Publiserer noe vi allerede regner ut daglig.
- **Svensk versjon:** **Ja, men lav ambisjon.** Ren produktparitet — svenske brukere skal ikke møte et tomt Norge. Ikke kjemp om innholdet: svampindex.se eier det med 290 kommuner oppdatert i går.
- **Sikkerhet:** Ingen artspåstander utover artsnavn. Aldri formuleringer som «nå er det trygt å plukke». Fast lenke til soppkontroll.no og Giftinformasjonen 22 59 13 00. **Må ligge utenfor innlogging.**
- **Hvorfor først:** Verifisert hull i Norge — NSNFs egen 2026-side har ingen prognose, og [plukksopp.no](https://www.plukksopp.no/) / [soppkartnorge.no](https://soppkartnorge.no/) har kart uten tid. Dette er den eneste siden på listen som er nyttig *den dagen den publiseres*, uten Google. Og den gir deg én delbar lenke hver eneste uke i sesongen.

### 2. Hvorfor finner du ikke sopp? Seks grunner, lest ut av været de siste 30 dagene
**Uke 33–34**
- **Søk:** hvorfor finner jeg ikke sopp i skogen · hvor er soppen i år · dårlig soppår
- **Hensikt:** Forstå om bomturen skyldtes tørke, feil tidspunkt eller feil skog.
- **Appdata:** tørkevindu, nattetemperatur, dager siden siste 10 mm, jordfuktighetsindeks — diagnostisk, ikke generell biologi.
- **Svensk versjon:** **Ja** (svarer til «Dåligt svampår? Så ser du om torkan stoppat svampen»). SVT/värmlandspressen har dekket tørken i Västerbotten og Värmland — verifiser de sakene i original før de siteres.
- **Sikkerhet:** Ingen artspåstander. Rent vær- og økologiinnhold. Ikke gjenta sirkulerende tall som «30–50 mm over to uker» eller «10–20 dager fra regn til fruktlegeme» som fakta — bruk våre egne modelltall eller la det stå.
- **Hvorfor først:** NSNF bekrefter at 2026 er et tørkepreget år. Dette er spørsmålet som stilles i soppgruppene på Facebook *denne måneden*, det har null sikkerhetskostnad, og det er den korteste veien fra frustrasjon til «å, den appen regner på nettopp dette».

### 3. Utvid /sanketips/sopp-etter-regn med data: hvor mange dager etter regn kommer soppen?
**Uke 34** — *utvidelse av eksisterende artikkel, ikke ny URL*
- **Søk:** hvor lang tid etter regn kommer soppen · hvor mange dager etter regn
- **Hensikt:** Vite hvor mange døgn man skal vente etter regnværet.
- **Appdata:** 428 000 daterte funn krysset mot nedbørshistorikk → histogram dager-etter-regn, splittet på art og landsdel.
- **Svensk versjon:** **Ja, senere (uke 38+)** — «Hur mycket regn krävs?». svampkarta.se har allerede en guide, så gevinsten er mindre.
- **Sikkerhet:** Ingen artspåstander nødvendig. Navngis arter i grafene: kun navn + sesong.
- **Hvorfor først:** Den svakeste SERP-en i hele materialet, og jeg bekreftet den i dag: **treff nr. 1 er [nov.tomathouse.com](https://nov.tomathouse.com/4/rost-gribov-posle-dozhdya.html)** — maskinoversatt russisk soppinnhold — resten er soppgleder.no (PHP fra 2000-tallet), soppdilla.no, og treff om *betongherding* og en datokalkulator. Vi kan slå dette med et diagram. **Og vi skal utvide den eksisterende artikkelen, ikke lage en ny som konkurrerer med den** — den er allerede faktasjekket, så marginalkostnaden er nesten null.

### 4. Hva viser soppkartene egentlig? Om skjevheten i 428 000 registrerte funn
**Uke 34–35**
- **Søk:** soppkart norge · stemmer soppkart · hvor finner jeg sopp på kart
- **Hensikt:** Betyr prikkene «her vokser sopp» eller «her har noen gått tur»?
- **Appdata:** vår egen romlige backtest, som viser at forekomstsignalet i stor grad er tilgjengelighetsskjevhet (nær vei, hytte, sti).
- **Svensk versjon:** **Nei nå.** Samme poeng, men Sverige er rødt hav; oversett i 2027 hvis den norske fungerer.
- **Sikkerhet:** Ingen artspåstander. Metodepåstander om GBIF/Artsdatabanken kildebelegges mot GBIFs egen dokumentasjon.
- **Hvorfor først:** Verifisert at [plukksopp.no](https://www.plukksopp.no/) og [soppkartnorge.no](https://soppkartnorge.no/) selger kart uten å si hva dataene ikke kan si. Ingen konkurrent *kan* skrive dette. Det er den billigste tilliten som finnes, det er den typen side andre lenker til (og lenker er det vi mangler mest), og den beskytter oss mot å overselge kartet — en feil vi har gjort før.

### 5. Derfor sier Mycelet aldri at en sopp er spiselig — og hva Giftinformasjonen mener om AI
**Uke 35** — NO **og** SE
- **Søk:** sopp app · beste sopp app · sopp identifikasjon app · kan man stole på soppapper
- **Hensikt:** Kan jeg stole på en soppapp?
- **Appdata:** ingen — dette er posisjonering. Men den beskriver hva AI-ID-en faktisk gjør (treffprosent, forvekslingsarter, ikke spiselighetsdom).
- **Svensk versjon:** **Ja, egen — ikke oversettelse.** Den svenske debatten er en annen: TV4-saken med svampkonsulent Sandra Holmblad som har testet soppapper og fraråder dem. Verifiser den originalen, ikke referatene, og verifiser påstanden om lakritsriska (*Lactarius helvus* mot Artfakta) før den gjentas.
- **Sikkerhet:** **Verifisert i dag, ordrett fra [helsenorge.no](https://www.helsenorge.no/Giftinformasjon/Sopp/unnga-soppforgiftning):** «Bruk aldri kunstig intelligens til å bestemme sopp du skal bruke til mat.» Den setningen skal siteres, ikke parafraseres bort. Ingen artspåstander. Ikke sammenlign oss med navngitte konkurrenter.
- **Hvorfor først:** Dette er den sterkeste — og mest ubehagelige — posisjonen vi har. Alle AI-ID-apper later som setningen ikke finnes; vi siterer den og sier oss enige. **Advarsel: artikkelen forplikter produktet.** Teksten må stemme med hva appen faktisk viser i dag. Stemmer den ikke, er artikkelen verre enn ingen artikkel.

---

## B. I SESONG (uke 35–40)

### 6. Slik regnes soppvarselet ut — vær, jordfuktighet, skogtype og 30 år med funn
**Uke 35** · Søk: soppprognose / soppvarsel / kan man spå soppsesongen · Hensikt: er varselet til å stole på før jeg betaler · **Appdata:** hele stacken (MET Frost, SMHI, NIBIO SR16, CORINE, GBIF, empirisk fenologi) — inkludert hva modellen *ikke* klarer · **SE: ja, kort versjon** (svampindex.se/metod rangerer på «svampprognos», så en metodeside er en trafikkside, ikke bare en tillitsside) · **Sikkerhet:** si eksplisitt at varselet gjelder sannsynlighet for å *finne* sopp, ikke spiselighet · Nært knyttet til #4, men hold dem adskilt: #4 er en påstand andre kan lenke til, denne er en produktbeskrivelse som forklarer hva 79 kr kjøper.

### 7. Soppkontroll nær deg 2026 / Hitta en svampkonsulent nära dig
**SE-versjon uke 34, NO-versjon uke 36** · Søk: soppkontroll + bynavn / svampkonsulent nära mig · **SE: ja, og den haster mest** — mycelet.com sender i dag svensker til soppognyttevekster.no, som er ubrukelig for dem. Det er en produktfeil, ikke bare et innholdshull · **Appdata:** kart + geolokasjon · **Sikkerhet:** ingen artspåstander, men **feil åpningstid er i praksis et sikkerhetsproblem**. NO: avklar med NSNF før kalenderen gjengis, krediter tydelig, lenk til soppkontroll.no som primærkilde. SE: verifiser Giftinformationscentralens telefonnummer direkte hos dem, ikke fra søkesammendrag. Verifisert: NSNFs digitale soppkontroll åpnet 1. juli, fysiske kontroller starter i løpet av august.

### 8. Traktkantarell og spiss giftslørsopp — og hvor de faktisk overlapper i funndataene
**Uke 36** (før september-toppen) · *Slår sammen to duplikater i forslagslisten.* · Søk: giftslørsopp traktkantarell / traktkantarell forveksling · **Appdata:** 4 352 traktkantarellfunn + 1 795 funn av spiss giftslørsopp lagt på samme kart · **SE: ja, men som egen artikkel senere (uke 38–39)** — trattkantarell/toppig giftspindling er *det* svenske sikkerhetstemaet og navneformene må hentes fra Artfakta, aldri oversettes · **Sikkerhet: høyeste nivå.** Hvert kjennetegn skal kunne føres tilbake til Helsenorge/Giftinformasjonen, FHI-brosjyren «Giftige sopper i Norge», NSNFs normliste eller Artsdatabanken (*Cortinarius rubellus*). Ingen skillekjennetegn formulert fritt. Si eksplisitt at forgiftning kan gi kronisk nyresvikt. Ekstern faktasjekk før publisering — den fanget en oppdiktet NSNF-referanse sist.

### 9. Falsk kantarell
**Uke 36–37** · Søk: falsk kantarell / sopp som ligner på kantarell / falsk kantarell giftig · **Appdata:** hvor og når de to artene faktisk opptrer sammen · **SE: nei** (svensk søkeatferd rundt kantarell er annerledes og lavere) · **Sikkerhet:** NSNFs normliste for status på begge arter, Artsdatabanken for navn (*Hygrophoropsis aurantiaca*), Giftinformasjonen hvis giftighet nevnes. Vi feller ikke spiselighetsdom selv — vi gjengir normlisten. Faktasjekk før publisering · Splittes ut av /sanketips/fem-forvekslinger, som blir hub. Merk: søketoppen er august — i år rekker vi den ikke, dette er en 2027-investering som modnes.

### 10. Er soppsesongen over? Hva frosten gjør — og hvilke arter som står lengst
**Uke 37–38** · *Slår sammen «frost»-forslaget og «hva kan du plukke i oktober–desember».* Jeg beholder tidspunkt-vinkelen og **dropper den delen som skulle liste opp spiselige vintersopper** — den krever art-for-art normlisteoppslag og gir lite igjen · Søk: når er soppsesong over / plukke sopp i oktober / sopp i november · **Appdata:** 34,6 % av traktkantarellfunn i okt+nov mot 8,5 % for steinsopp; værmodell for hva én frostnatt betyr mot varig kulde · **SE: nei** · **Sikkerhet:** ingen spiselighetspåstander. Frostpåstander enten belegges (NIBIO/fagfellevurdert) eller formuleres som «dette ser vi i funndataene» · Bonus: motsesong-trafikk — alle andre slutter å publisere i september.

### 11. Steinsopp eller gallerørsopp?
**Uke 37** · Søk: steinsopp forveksling / gallerørsopp vs steinsopp · **Appdata:** artsbibliotekets forvekslingsadvarsler + hvor og når steinsopp registreres · **SE: nei nå** (Karl Johan er tett dekket av svampindex.se + innholdsfarmer — se kuttlisten) · **Sikkerhet:** NSNF normliste, Artsdatabanken (*Boletus edulis*, *Tylopilus felleus*), Giftinformasjonen. At gallerørsopp er bitter og ikke dødelig må også kildebelegges. Advar om at flere andre rørsopper krever varmebehandling. Ekstern faktasjekk.

### 12. Hvor vokser steinsoppen? Skogtype, treslag og høyde i 4 561 registrerte funn
**Uke 38** · Søk: hvor vokser steinsopp / hvor finner jeg steinsopp · **Appdata:** funn krysset mot NIBIO SR16 (treslag, bonitet, høyde) — en analyse ingen norsk soppside har gjort · **SE: nei** (SLU-data krever konto, ingen anonym live-tilgang — den svenske versjonen er dyrere enn den er verdt) · **Sikkerhet:** ingen spiselighetspåstander; habitatpåstander fra NIBIO eller funndata, aldri fra turblogger; nevnes gallerørsopp, lenk til #11 i stedet for å beskrive den.

---

## C. BYGGES NÅ, BETALER SEG I 2027 (uke 38–44)

### 13. Når kommer kantarellen der du bor? Fylkes- og bysider på funndata
**Uke 38–41 (program, ikke én artikkel)** · *Slår sammen tre overlappende forslag: fylkesfordeling, Oslomarka-malen og de regionale kantarellsidene.* · Søk: kantarell sesong Oslo/Trondheim/Bergen/Nord-Norge · **Appdata:** median første-funn-uke og toppuke per fylke, med antall funn oppgitt ærlig · **SE: ja, men bare som Norrland-variant** (svampindex.se har allerede Skåne/Stockholm/Södermanland; nord er den eneste åpne flanken) · **Sikkerhet:** ingen presise koordinater — fylke/kommune eller grovkornede ruter, både av personvernhensyn og for ikke å tømme lokaliteter. Ikke peke ut navngitte enkeltlokaliteter. Eksplisitt forbehold om registreringsskjevhet, med lenke til #4. Navngis kantarell, kreves forvekslingsavsnitt med lenke til #9 · **Ærlig:** søketoppen for kantarell var uke 32–33, altså nå. Disse sidene rekker ikke 2026. De bygges nå fordi de er malbaserte (billige per side) og trenger 6–12 måneder på å modnes. Merk også at søkeinteressen per innbygger er høyest i Nord-Norge mens funndataene er tettest i Viken — nord bør ikke være siste prioritet.

### 14. Hvilken sopp kommer først? Sesongkurvene side om side
**Uke 39** · Søk: hvilken sopp kommer først / når er det soppsesong · **Appdata:** kantarell (33,5 % aug / 32,8 % sep), steinsopp (43,5 % aug / 40,2 % sep / 8,1 % okt), traktkantarell (1,3 % juli / 45,6 % sep / 25,3 % okt) · **SE: nei** · **Sikkerhet:** ingen artspåstander, kun tidspunkt og funnfrekvens. Ikke skriv «matsopp» uten normlisten som kilde — bruk «arten» / «registrerte funn av» · Fungerer som hub som lenker til #10, #12, #13.

### 15. Piggsopp — nesten like søkt som traktkantarell, og nesten ingen skriver om den
**Uke 39–40** · Søk: blek piggsopp / piggsopp sesong · **Appdata:** 4 095 registrerte funn, toppuke medio september · **SE: ja, egen versjon** — «blek taggsvamp» er en helt annen kulturell størrelse i Sverige, og slekten heter *taggsvamp*, ikke piggsvamp; navnet må bekreftes mot artfakta.se, ikke oversettes. NB: navnelikheten med blek stenmurkla (*Gyromitra gigas*, giftig) må nevnes eksplisitt i den svenske · **Sikkerhet:** NSNF normliste + Artsdatabanken; blek og rødgul piggsopp er to arter. Ingen spiselighetsdom fra oss. Gjengis Giftinformasjonens skive-regel, må den ha samme forbehold som i fem-forvekslinger.

### 16. Er det lov å plukke sopp her? Allemannsretten, verneområder og annen manns eiendom
**Uke 41–42** · Søk: er det lov å plukke sopp i naturreservat · **Appdata:** verneområder finnes som åpent datalag (Naturbase) — vi kan svare «her du står, gjelder dette», og det er en funksjon vi kan bygge etterpå · **SE: ja, egen artikkel** — allemansrätten er et annet lovverk (hemfridszon, tryffel og sprängticka krever grunneiers tillatelse ifølge Naturvårdsverket). Slå sammen de to svenske jus-forslagene til én. **Ikke gjenta påstanden om at sopp «generelt» er forbudt i naturreservat før den er bekreftet direkte hos Naturvårdsverket — kildene spriker** · **Sikkerhet:** friluftsloven (inkl. særreglene for Nordland, Troms og Finnmark), naturmangfoldloven, og at hvert verneområde har sin egen forskrift. Lenk til Lovdata og Miljødirektoratet. Skriv eksplisitt at dette ikke er juridisk rådgivning.

---

## D. BETINGET — skriv bare hvis A–C leverer (uke 43–48)

Jeg står ikke like sterkt bak disse fire. De er med fordi listen skal ha 20, men **hvis kapasiteten tar slutt, er det her du kutter — ikke i A–C.**

### 17. Sjampinjong eller hvit fluesopp
**Uke 43** · Søk: hvit fluesopp vs sjampinjong · **SE: ja, og den svenske er sterkere enn den norske** — Giftinformationscentralen peker på nettopp dette paret som en av verdens vanligste forgiftningsårsaker · **Sikkerhet: høyeste nivå.** Hvit fluesopp står på Giftinformasjonens liste over Norges giftigste. Sporeavtrykk, volva og ring skal siteres, ikke omskrives. Full sikkerhetsgjennomgang, ikke bare faktasjekk · **Hvorfor så lavt:** høyest produksjonskostnad av alle, og vi har allerede dekning i fem-forvekslinger. Gevinsten er en egen URL, ikke ny kunnskap.

### 18. Stubbeskjellsopp eller flatklokkehatt
**Uke 44** · Samme begrunnelse og samme regime som #17. Flatklokkehatt står også på seks-listen. Relevant hele høsten · **SE: nei.**

### 19. Hvit, brun, gul eller lilla sopp — derfor er farge det dårligste kjennetegnet
**Uke 45–46** · Søk: hvit/brun/gul sopp i skogen · **Sikkerhet: farligste artikkelen i hele materialet** — den inviterer til artsbestemmelse. Den skal ikke artsbestemme noe, hver seksjon skal ende i soppkontroll og ikke i en konklusjon, og hele skive-regel-avsnittet må ha samme forbehold som fem-forvekslinger. Full sikkerhetsgjennomgang · **Hvorfor lavt til tross for at intensjonen er ekte:** den krever mest redaksjonell disiplin av alle, og gevinsten er en inngangsport — ikke konvertering. Skriv den når du har overskudd, ikke når du har dårlig tid.

### 20. Goliatmusseron — soppen i norrländsk tallskog som betales i tusenlapper (SE)
**Uke 47 / eller helt i 2027** · **Kun svensk, ingen norsk motpart** · **Hvorfor med:** det er den ene svenske saken som er *interessant nok til å bli delt og sitert*, og som ingen av de tre svenske konkurrentene har. Det er et lenke- og presseframstøt, ikke SEO · **Sikkerhet:** artfakta.se for *Tricholoma matsutake*, rødlistestatus **før** vi oppfordrer til plukking, og forvekslingsrisiko mot andre *Tricholoma* i svensk tallskog verifisert mot Giftinformationscentralen før ett eneste kjennetegn skrives. Ikke publiser presise voksesteder.

---

## KUTTET — og hvorfor

| Forslag | Begrunnelse |
|---|---|
| **Har soppsesongen flyttet seg? 30 år med funndata** | Verifisert at [NRK har en XL-sak fra 10.08.2024](https://www.nrk.no/klima/xl/sesongen-for-sopp-har-flyttet-seg-1.16992001) bygget på professor Håvard Kauserud. Feltet er ikke tomt — det er okkupert av en forsker med bedre data enn oss. Og innsamlingsintensiteten i GBIF har økt kraftig, så en naiv tidsserie viser falsk «tidligere sesong». **Bedre trekk: gi tallene til en journalist i august i stedet for å publisere selv.** Da får vi lenken uten å eie risikoen. |
| **Kantareller blir beska i frysen / frysa svamp** | Stryker på kriterium 1: her kan vi *ikke* svare bedre enn en matblogg. Ingen appdata er relevant. Det er retensjonsinnhold for nyhetsbrev, ikke en artikkel. |
| **Karl Johan: när kommer den (SE)** | Forslaget sier det selv — svampindex.se rangerer allerede, og feltet er fullt av innholdsfarmer. Skriv den kun hvis den navngitte toppdagen faktisk kan leveres per landsdel; ellers dropp. |
| **Fem svampar du inte får plocka (SE)** | Sjarmerende (lion's mane-kroken er ekte), men null produktkobling og null kjøpsintensjon. Reserve. |
| **Stenmurkla (SE)** | God konflikt, men vårsopp — tidligst uke 7–8 i **2027**. Parkeres til da. |
| **Stolt fjällskivling / blek taggsvamp «tryggast för nybörjare» (SE)** | Høyest sikkerhetskostnad i hele materialet i et marked der vi (a) er navnekollidert med mycelet.se og (b) møter fem etablerte aktører. Feil sted å bruke faktasjekk-budsjettet i år. |
| **Plukket stedet tomt — gjenvekst** | Folder inn som seksjon i #3 i stedet for egen URL. Ellers konkurrerer vi med oss selv om samme søk. |
| **Svampläget i Norrland (SE)** | Folder inn i #1s svenske versjon og #13s Norrland-variant. |

---

## Publiseringsplan i kortform

| Uke | Datoer | Leveranse |
|---|---|---|
| **33** | 10.–16. aug | **Teknisk først:** indekseringssjekk + måling. Deretter **#1 Soppforhold nå** (NO), start **#2** |
| **34** | 17.–23. aug | **#2 Hvorfor finner du ikke sopp** · **#3 regn-data inn i eksisterende artikkel** · **#7 SE svampkonsulent** (produktfeil) |
| **35** | 24.–30. aug | **#4 Skjevheten i soppkartene** · **#5 AI og spiselighet** (NO+SE) · **#6 Metodeside** |
| **36** | 31. aug–6. sep | **#8 Traktkantarell/giftslørsopp** (faktasjekk ferdig) · **#7 NO soppkontroll** · **#9 Falsk kantarell** |
| **37** | 7.–13. sep | **#10 Er sesongen over?** · **#11 Steinsopp/gallerørsopp** |
| **38** | 14.–20. sep | **#12 Hvor vokser steinsoppen** · **#13 regionsider starter** · **#3 SE-versjon** |
| **39–41** | 21. sep–11. okt | **#14 sesongkurver** · **#15 piggsopp** (NO+SE) · **#13 fortsetter** · **#8 SE-versjon** |
| **42–44** | 12. okt–1. nov | **#16 regler** (NO+SE) · **#17/#18** hvis kapasitet |
| **45–48** | 2.–29. nov | **#19 farge-artikkelen** · **#20 goliatmusseron** · oppdater #1 til «utenfor sesong»-tilstand |

**Distribusjonsregel gjennom hele planen:** hver artikkel skal ha én tilhørende verdi-først-post til Facebook-gruppene (de tre ferdigskrevne i `docs/markedsforing-innlegg.md` er startpakken). Uten den er artikkelen usynlig til Google våkner — sannsynligvis ikke før 2027.

---

## Verifisert i dag vs. antatt

**Verifisert av meg nå:** Giftinformasjonens AI-setning ordrett ([helsenorge.no](https://www.helsenorge.no/Giftinformasjon/Sopp/unnga-soppforgiftning)) · NSNFs 2026-side har ingen prognose, digital soppkontroll åpnet 1. juli, fysiske kontroller starter i august ([soppognyttevekster.no](https://soppognyttevekster.no/soppsesongen-2026/)) · svampindex.se dekker alle 290 svenske kommuner, oppdatert 7.8.2026 ([svampindex.se/kommuner](https://svampindex.se/kommuner/)) · regn-SERP-en toppes av maskinoversatt russisk innhold ([nov.tomathouse.com](https://nov.tomathouse.com/4/rost-gribov-posle-dozhdya.html)) · NRKs klimasak er fra 10.8.2024 med Kauserud · [plukksopp.no](https://www.plukksopp.no/) og [soppkartnorge.no](https://soppkartnorge.no/) er kart uten tidsdimensjon · [mycelet.se](https://mycelet.se/) er et svensk soppfirma med samme navn · mycelet.com dukker ikke opp på søk på eget domenenavn.

**Antatt, ikke verifisert av meg:** alle GBIF-tallene og prosentfordelingene fra de tre undersøkelsene (månedsfordelinger, funnantall per art og fylke) · alle Google Trends-tallene · at mycelet.com faktisk er uindeksert (søkefravær er en indikasjon, Search Console er beviset) · alle svenske artsnavn og de svenske kildepåstandene i forslagene · Giftinformasjonens forgiftningstall for 2024/2025.

---

## Om sikkerhet i innholdet

De tre eksisterende artiklene ble kildesjekket mot NSNF, Artsdatabanken, NIBIO,
Giftinformasjonen og SLU, og gjennomgått av både en mykologi-faktasjekk og en
sikkerhetsgjennomgang. **Faktasjekken fanget en oppdiktet NSNF-henvisning før
publisering.**

Samme standard gjelder alt nytt. Emner som krever nye påstander om spiselighet
eller forveksling (nr. 8, 9, 11, 17, 18 i lista) koster 2–3 uker hver, ikke én.
Skriv dem ikke raskere.

Svenske artsnavn hentes fra SLU Artdatabanken/Dyntaxa, **aldri** ved å oversette
det norske: flere svenske soppnavn skiller seg bare med ett ord fra navnet på
en ANNEN art.
