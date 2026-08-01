# Beslutning: bildebøttene forblir offentlige

**Dato:** 1. august 2026
**Spørsmål:** skal `finding-images` og `forum-images` gjøres private, med signerte URL-er?
**Svar:** nei. Men hullet som faktisk finnes, lukkes.

## Hva som ble vurdert

Revisjonssveipet fant at bøttene er offentlige (migrasjon 019), og at et funn
brukeren har merket som `private` derfor har bildet sitt liggende på en URL
hvem som helst kan hente — hvis de kjenner den. Det opplagte tiltaket er å gjøre
bøttene private og servere alt gjennom signerte, tidsbegrensede lenker.

Jeg gikk gjennom hvert lesepunkt før jeg bestemte meg. Det er tre steder som
BYGGER offentlige URL-er, og fem-seks flater som VISER brukeropplastede bilder.

## Hvorfor ikke private bøtter

**1. De fleste bildene SKAL være offentlige.** Forsiden viser «Siste funn fra
fellesskapet» til utloggede besøkende. De bildene hører til funn brukeren
bevisst har delt offentlig. Gjør vi bøtta privat, må nettopp det innholdet
serveres gjennom en proxy eller en egen offentlig bøtte — altså mer maskineri
for å komme tilbake til der vi startet, uten personverngevinst.

**2. For private funn er URL-en allerede utilgjengelig.** Den lagres bare i
`findings.thumbnail_url`, og RLS-policyen «Brukere kan lese egne funn»
(migrasjon 015) gjør at ingen andre kan lese den raden. Viewet `public_findings`
filtrerer dessuten bort alt som ikke er `public` eller `approximate`. Det finnes
altså ingen vei til URL-en for andre enn eieren.

**3. Stien kan ikke gjettes lenger.** Nye opplastinger bruker en tilfeldig UUID
(`src/lib/storage/upload-path.ts`). 128 bit er ikke noe man brute-forcer.

**4. Signerte URL-er koster noe ekte.** De utløper. Det brekker
nettleser-caching, det brekker en lenke brukeren selv har lagret, og det
kompliserer offline-kartet — som er en premium-funksjon folk betaler for.

Summen: å bytte modell ville rørt hver bildevisning i en app med betalende
brukere, for å lukke en risiko som i praksis allerede er lukket.

## Hva som FAKTISK er et hull, og som lukkes

Bilder lastet opp **før 1. august 2026** har stien `${user_id}/${Date.now()}.jpg`.
Begge delene er gjettbare:

- `user_id` ligger åpent i `public_findings` for alle som har lagt ut ett eneste
  offentlig funn.
- `Date.now()` er et tidspunkt. Kjenner du omtrent når, er søkerommet sekunder.

For en som vil målrette én bestemt bruker er det et gjennomførbart søk. Det er
den ekte eksponeringen, og den gjelder de gamle filene — ikke modellen.

**Tiltak:** `scripts/rekey-storage-objects.mjs` gir hver gammel fil en ny,
tilfeldig sti og oppdaterer `findings.image_url`, `findings.thumbnail_url` og
`forum_posts.images` i samme slengen. Kjør den med `--dry-run` først.

## Når bør beslutningen tas opp igjen

- Hvis appen begynner å lagre noe mer sensitivt enn soppbilder.
- Hvis en bruker rapporterer at et privat bilde er kommet på avveie.
- Hvis Apple eller Datatilsynet spør konkret om lagringsmodellen.

Da er den riktige løsningen ikke «privat bøtte for alt», men **to bøtter**: en
offentlig for det brukeren har delt, og en privat med signerte URL-er for
private funn. Det skiller kostnaden fra der den gir gevinst.
