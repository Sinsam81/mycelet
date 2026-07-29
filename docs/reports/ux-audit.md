# UX-audit

## Kartet

| Konkret problem | Før | Endring/live | Etter/verifisering |
|---|---|---|---|
| For mange konkurrerende handlinger | Lag, funn, lovende steder, bilder, offline og turverktøy konkurrerte i samme kontrollflate | Primærflaten viser søk, funn, lovende steder og én «Mer»-handling; premium/avansert ligger bak progressiv åpning | Mindre visuelt støy på mobil uten tap av funksjon; PR #73 |
| Filterpanelet tok for mye mobilplass | Tekstkontroll og panel konkurrerte med kartets synlige areal | Kollapset ikonknapp og rullbart bunnark | Verifisert på mobil og desktop, norsk og svensk |
| Rå geolocation-feil ble stående | Teknisk feilboks tok kartplass og opplevdes permanent | Lokalisert, kortvarig toast | Kartet forblir brukbart når posisjon nektes |
| «Legg til funn» kunne havne utenfor skjermen | Sone-modus var ca. 834 px høy i et 706 px kart; tittel/første felt forsvant | Maks høyde bundet til kartet og intern vertikal rulling | 390×844: topp og Avbryt forblir tilgjengelig; PR #71 |
| Svensk kart viste norske artsnavn | Forekomstetiketter og søk falt tilbake for tidlig | Svenske navn brukes nå i kartsøk og etiketter | Svensk manuell QA bestått; PR #72/#73 |

Bevisst ikke gjort: total omskriving av `MushroomMap.tsx` eller MapLibre/vector-fliser. Den eksisterende Leaflet-stakken fungerer, og en stor migrering ville hatt høy regresjonsrisiko uten direkte modell- eller salgsverdi.

## Resten av appen

- Svensk katalog, artsdetalj, kalender og forsideseksjoner foretrekker kuraterte svenske navn.
- Svensk søk matcher svensk, norsk og latin, mens norsk fulltekstsøk er bevart.
- Hotspot-feedback er skrevet om til et faktisk etter-besøksspørsmål: «Etter at du besøkte stedet …» og «Letet, fant ikke». Det gjør både hensikt og treningsverdi tydeligere.
- Live prediksjonsforklaringer sier ikke lenger at mange tidligere funn øker sannsynligheten når det signalet ikke er validert.

## Høyverdige forslag, ikke bygget

1. Gjør «Beste dag»/flush-stripen til den tydeligste handlingen på forsiden og prediksjonssiden. Det er modellens sterkeste beviste verdi.
2. Legg til «Finn bilen» og GPX-eksport som premium turverktøy bak «Mer». Høy utendørsverdi, men separat fra denne risikoreduserende runden.
3. Del `MushroomMap.tsx` etter ansvar ved neste større kartendring: basekart, datalag, kontrollark og funnskjema. Ikke gjør en kosmetisk totalrefaktor uten funksjonelt mål.
4. Vis prediksjonens datakvalitet som enkel etikett: «ferske værdata», «grovt skoggrunnlag», «for lite feltfeedback». Dette kan øke tillit uten å love for mye.

