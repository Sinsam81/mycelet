# Presse-pitch: soppvarselet med offentlig fasit

Skrevet 2026-09-04. Alt sendes som **Mycelet** fra post@mycelet.com. Bygger på
`pressemelding-utkast.md` (9. august) — les forbeholdene der først, de gjelder
fortsatt. Foreningene håndteres i `markedsforing-sesonglanseringer.md`; dette
dokumentet er kun for redaksjoner.

---

## Vinkelen

Augustutkastet var en *kritisk* sak (AI og spiselighet). Denne er en *nytte*-sak,
og den er lettere å få på: den gir leseren noe å bruke i helga, den har et
lokalt tall for hver eneste redaksjon, og den har én detalj ingen andre kan
tilby — **fasiten publiseres offentlig, også når varselet bommer.**

Tre kroker, i prioritert rekkefølge:

1. **Det lokale tallet.** «Soppforholdene i Trondheim er 88 av 100 i dag.» Hver
   redaksjon får sitt eget område med dagens verdi og en lenke som viser det.
   Journalisten kan sjekke påstanden på tre sekunder.
2. **Gratis varsel uten konto.** Én e-post når forholdene snur i området — maks
   én i uka. Et konkret tilbud til leserne, ikke en app-reklame.
3. **Fasiten.** Hvert varsel følges opp med funntall uken etter mot uken før,
   hentet fra Artsobservasjoner/GBIF. Publisert åpent på mycelet.com/apenhet
   og på X (@mycelet). Det er meteorologenes verifikasjonskultur overført til
   sopp — og det er setningen journalisten husker.

Det vi IKKE sier: aldri «her finner du sopp», aldri at noe er trygt å spise,
aldri konkurrentnavn. Samme ærlighetslinje som i selve produktet.

---

## Når pitchen skal sendes

**Du får beskjed automatisk.** De morgenene soppvarselet slår ut, sender
cron-jobben (`/api/cron/xpost`, 07:30) en e-post til adressen i
`PRESSE_VARSEL_TIL` med pitchen ferdig utfylt per region — tall, lenke,
mottakere, riktig språk (`src/lib/alerts/presse.ts`; teksten der SKAL være
identisk med pitchen under). Ingenting sendes til noen redaksjon automatisk.
Du kopierer, sjekker adressen, og sender selv.

**På en omslagsdag.** Pitchen er sterkest den morgenen soppvarselet faktisk
slår ut i journalistens region — da er «det snudde i natt» selve saken, og
tallet i emnefeltet er ferskt. Cron-jobben kjører 07:00; sjekk
mycelet.com/soppforhold, og send til redaksjonene i regionene som snudde.
Tirsdag–torsdag før kl. 10 treffer redaksjonsmøtene.

Uten omslag: send til de tre regionene med høyest tall, med «best i landet
akkurat nå»-rammen i stedet.

**Sjekkliste før hver utsending:**
- Dagens tall og dato hentet fra /soppforhold samme morgen
- Lenken til områdesiden åpnet og kontrollert (mycelet.com/soppforhold/[slug])
- Antall funn («428 000») og områder («22») stemmer med det som står på siden
- Ingen personnavn noe sted i e-posten
- Områdenavnet er presist: «Innlandet» hos oss er en rute rundt Hamar–Elverum,
  ikke fylket — skriv «Hamar–Elverum-området (Mycelets «Innlandet»-område)».
  Presse-varselet gjør dette automatisk (`OMRAADE_PRESIST` i presse.ts).

---

## Pitch — norsk (lokalavis / NRK distrikt)

**Emne:** Soppforholdene i [Trondheim] er [88] av 100 i dag — gratis varsel med
offentlig fasit

Hei [fornavn / redaksjonen],

Kort tips i soppsesongen: forholdene rundt [Trondheim] snudde i natt — fra
[62] til [88] av 100 den siste uka, ifølge Mycelets daglige beregning. Tallet
er vær, jordfuktighet, temperatur og sesong for området, og det ligger åpent
her, uten innlogging:

mycelet.com/soppforhold/[trondheim]

Det som er nytt i år, og som kanskje er en sak: Mycelet tilbyr et **gratis
soppvarsel på e-post** — én melding den dagen forholdene snur i leserens
område, aldri mer enn én i uka, ingen konto nødvendig. Og hvert varsel får en
**offentlig fasit**: funntall fra Artsobservasjoner uken etter varselet mot
uken før, publisert uansett utfall på mycelet.com/apenhet. Så vidt vi vet er
det ingen andre som publiserer fasit på soppvarsler.

Tjenesten er bygd på åpne data (Meteorologisk institutt, NIBIO, Artsdatabanken
og GBIF — 428 000 registrerte soppfunn) og dekker 22 områder i Norge og
Sverige. Den lover aldri funn, og sier aldri at en sopp er trygg å spise — det
er et bevisst valg vi gjerne forklarer.

Svarer gjerne på spørsmål på e-post, og kan sende skjermbilder eller tall for
flere områder om det er nyttig.

Vennlig hilsen
Mycelet
post@mycelet.com · mycelet.com

---

## Pitch — svensk (lokaltidning / SVT regionalt / SR)

**Ämne:** Svampförhållandena i [Göteborg] är [86] av 100 i dag — gratis
varning med offentligt facit

Hej [förnamn / redaktionen],

Ett kort tips mitt i svampsäsongen: förhållandena kring [Göteborg] vände i
natt — från [60] till [86] av 100 den senaste veckan, enligt Mycelets dagliga
beräkning. Siffran bygger på väder, markfuktighet, temperatur och säsong för
området, och ligger öppet här utan inloggning:

mycelet.com/soppforhold/[goteborg]

Det nya i år, och kanske en artikel: Mycelet erbjuder en **gratis
svampvarning via mejl** — ett meddelande den dag förhållandena vänder i
läsarens område, aldrig mer än ett i veckan, inget konto behövs. Och varje
varning får ett **offentligt facit**: fyndantal från Artportalen/GBIF veckan
efter varningen mot veckan innan, publicerat oavsett utfall på
mycelet.com/apenhet. Såvitt vi vet publicerar ingen annan facit på
svampvarningar.

Tjänsten bygger på öppna data (SMHI, Artdatabanken och GBIF — över 400 000
registrerade svampfynd) och täcker 22 områden i Sverige och Norge. Den lovar
aldrig fynd, och säger aldrig att en svamp är säker att äta — ett medvetet val
vi gärna förklarar.

Svarar gärna på frågor via mejl, och kan skicka skärmbilder eller siffror för
fler områden om det är till nytta.

Vänliga hälsningar
Mycelet
post@mycelet.com · mycelet.com

---

## Mottakere

Adressene under er standard tipsadresser. **Sjekk hver adresse på
redaksjonens nettside før sending** — de endres, og en pitch til en død
adresse er en bortkastet omslagsdag. Én e-post per redaksjon, aldri
masseutsending med synlige mottakere.

### Norge — regionavis + NRK distrikt, koblet til område

| Område i Mycelet | Regionavis | NRK distrikt |
|---|---|---|
| Oslo | Aftenposten (tips@aftenposten.no) | NRK Stor-Oslo |
| Bergen | Bergens Tidende (tips@bt.no) | NRK Vestland |
| Trondheim | Adresseavisen (tips@adressa.no) | NRK Trøndelag |
| Stavanger | Stavanger Aftenblad (tips@aftenbladet.no) | NRK Rogaland |
| Kristiansand | Fædrelandsvennen (tips@fvn.no) | NRK Sørlandet |
| Innlandet | Hamar Arbeiderblad / Oppland Arbeiderblad | NRK Innlandet |
| Ålesund | Sunnmørsposten (tips@smp.no) | NRK Møre og Romsdal |
| Bodø | Avisa Nordland (tips@an.no) | NRK Nordland |
| Tromsø | Nordlys (tips@nordlys.no) | NRK Troms |

NRK sentralt: tips@nrk.no (03030). Distriktskontorene nås ofte best via
samme adresse med distriktet i emnefeltet.

### Norge — riksdekkende og nisje (én pitch, «best i landet»-rammen)

- **UT.no / DNT** — friluftsredaksjon, treffer akkurat målgruppa
- **Friluftsliv** og **Villmarksliv** (magasiner) — lengre ledetid, men lojale lesere
- **Tek.no** — «bygd på åpne data»-vinkelen; teknologiredaksjoner liker fasit-ideen
- **Kode24** — utviklervinkel (åpne data + etterprøvbarhet). Merk: de vil
  gjerne ha en person å intervjue; svar som i Q&A under.

### Sverige

| Område i Mycelet | Lokaltidning | Övrigt |
|---|---|---|
| Stockholm | Dagens Nyheter / Mitt i | SVT Stockholm |
| Göteborg | Göteborgs-Posten | SVT Väst |
| Malmö | Sydsvenskan | SVT Skåne |
| Uppsala | Upsala Nya Tidning | SVT Uppsala |
| Umeå | Västerbottens-Kuriren | SVT Västerbotten |
| Sundsvall / Östersund | Sundsvalls Tidning / Östersunds-Posten | SVT Mitt / Jämtland |
| Linköping | Östgöta Correspondenten | SVT Öst |
| Örebro | Nerikes Allehanda | SVT Örebro |

SVT sentralt: nyhetstips@svt.se. **SR P1 Naturmorgon** er den beste enkelte
kanalen i Sverige for dette — et lørdagsprogram om natur med stor, lojal
lytterskare (naturmorgon@sverigesradio.se). Ellers **Utemagasinet** og
**Land.se** (landsbygd/skog).

---

## Spørsmålene som kommer — og svarene

**Hvem står bak Mycelet?**
> Mycelet lages av et lite norsk enkeltpersonforetak. Vi ønsker at tallene og
> fasiten skal stå i sentrum, ikke oss — sitater kan tilskrives «utvikleren
> bak Mycelet». Alt om datagrunnlag og metode ligger åpent på
> mycelet.com/datakilder og mycelet.com/apenhet.

(Se forbehold 1 i `pressemelding-utkast.md`. Noen redaksjoner takker nei uten
en navngitt person. Da takker vi for interessen og går videre — det er en
kjent kostnad, ikke et problem å løse i innboksen.)

**Hvordan regnes tallet?**
> Nedbør de siste to ukene, jordfuktighet, temperatur, hvor vi er i sesongen
> for artene som vokser der, og om skogtypen passer dem. Værdata fra
> Meteorologisk institutt og SMHI, skogdata fra NIBIO og CORINE, sesongkurver
> fra 428 000 daterte funn i Artsdatabanken/GBIF.

**Hvor treffsikkert er det?**
> På *når* treffer modellen godt: AUC 0,88 i en streng test der den ble trent
> på funn før 2021 og testet på funn etter. På *hvor* — altså hvilket sted i
> skogen — er den ærlig på at den ikke vet. Derfor viser vi områder, ikke
> punkter. Hele metoden og alle tallene: mycelet.com/apenhet.

**Kan appen si om en sopp er spiselig?**
> Nei, og det er et bevisst valg. Bildegjenkjenningen viser treffprosent og
> giftige forvekslingsarter, men gir aldri en spiselighetsdom — det som
> avgjør, ser man ofte ikke på et bilde. Er man i tvil, lar man soppen stå
> eller får den kontrollert av en soppkontroll.

**Hva koster det?**
> Soppvarselet, kartet og artsbiblioteket er gratis. Premium (99 kr/mnd eller
> sesongpass) gir mer detaljert prognose for stedet du står, sju dagers
> utsikt og offline-kart. Første uke gratis.

**Hva om varselet bommer?**
> Da står det i fasiten. Vi publiserer funntallene uansett utfall — det er
> hele poenget. Et varsel som ikke kan etterprøves, er ikke verdt å stole på.

**Hvor mange bruker det?**
> Vi oppgir ikke brukertall ennå — tjenesten ble lansert i august. (Ærlig og
> kort. Ikke pynt.)

---

## Etter utsending

- **Én oppfølging** etter fire dager hvis stille — kort, med et nytt ferskt
  tall («i dag 91 av 100»). Aldri mer enn én.
- Får en redaksjon saken på: del lenken fra @mycelet på X (uten lenke i selve
  teksten — se `src/lib/x/innlegg.ts` for hvorfor), og legg den på /apenhet
  under «omtale» hvis vi lager en slik seksjon.
- Loggfør hvem som fikk hva når, i dette dokumentet, nederst.

## Sendelogg

| Dato | Redaksjon | Område/tall | Svar |
|---|---|---|---|
| | | | |
