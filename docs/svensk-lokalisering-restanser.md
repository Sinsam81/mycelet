# Svensk lokalisering — det som gjenstår

Skrevet 2026-08-01, hentet inn i repoet samme dag. Dekker de to punktene som
**ikke** kan fikses i kode.

> **Status 2026-08-01.** Alt som kunne fikses i kode ER fikset og deployet
> (PR #106–#111): rate-limit-meldingen, tom kart-popup, svenske artsnavn i
> identify inkludert de dødelige forvekslingsartene, artssøket i «Legg til funn»,
> forum/profil/Mine steder, feilmeldingene fra identify, datoformatering 17
> steder, og slettevarsel-e-posten på begge språk. En katalogtest
> (`src/lib/__tests__/messages.test.ts`) fanger nå en nøkkel som finnes på norsk
> og mangler på svensk.
>
> Det som står igjen under er de to tingene som ligger utenfor kodebasen: maler
> i Supabase-dashbordet, og oversatt artsinnhold. Den opprinnelige seksjon 3 om
> overlapp med PR #99 er fjernet — den er merget for lengst.

---

## 1. Supabase Auth-e-poster (krever manuell handling — dashboard, ikke repo)

Auth-e-postene ligger i Supabase-dashbordet, ikke i koden, så de kan ikke endres
herfra. De er i dag **kun norske**, og en svensk bruker som ber om nytt passord
får norsk e-post.

**Hvor:** Supabase Dashboard → Authentication → Emails → Templates.

### Hvilke maler som faktisk er i bruk

Jeg sjekket hvilke Auth-kall appen gjør. Bare disse to kan trigges:

| Mal | I bruk? | Trigges av |
|---|---|---|
| **Reset Password** | ✅ Ja, sikkert | `resetPasswordForEmail()` i [auth/forgot](../src/app/auth/forgot/page.tsx) → lander på `/auth/reset` |
| **Confirm signup** | ⚠️ Bare hvis e-postbekreftelse er PÅ | [auth/register](../src/app/auth/register/page.tsx) håndterer begge tilfeller |
| Magic Link / Invite / Change Email / Reauthentication | ❌ Nei | Ingen kall i koden |

**Sjekk først:** Authentication → Providers → Email → «Confirm email». Er den AV,
trenger du bare å gjøre Reset Password. Er den PÅ, gjør begge.

### Hva du må gjøre

Supabase har **ikke** innebygd språkvalg per bruker i disse malene. Vi lagrer
heller ingen språkpreferanse i databasen (språket bor kun i `MYCELET_LOCALE`-
cookien, som Supabase aldri ser).

**Anbefaling: gjør malene tospråklige** — norsk først, svensk under en `<hr>`.
Det er samme løsning jeg brukte for inaktivitets-e-posten i denne runden
([`supabase/functions/_shared/email.ts`](../supabase/functions/_shared/email.ts)),
så de to e-postene blir konsistente. Ingen gjetting, alle kan lese den.

Forslag til Reset Password-mal (lim inn i Message body):

```html
<h2>Tilbakestill passordet ditt</h2>
<p>Du har bedt om å tilbakestille passordet på Mycelet. Trykk under for å velge et nytt:</p>
<p><a href="{{ .ConfirmationURL }}">Velg nytt passord</a></p>
<p>Hvis du ikke ba om dette, kan du ignorere denne e-posten — passordet forblir uendret.</p>

<hr>

<h2>Återställ ditt lösenord</h2>
<p>Du har begärt att återställa lösenordet på Mycelet. Klicka nedan för att välja ett nytt:</p>
<p><a href="{{ .ConfirmationURL }}">Välj nytt lösenord</a></p>
<p>Om du inte begärde detta kan du ignorera det här mejlet — lösenordet förblir oförändrat.</p>
```

Og emnefeltet (Subject heading):

```
Tilbakestill passordet ditt / Återställ ditt lösenord — Mycelet
```

**Ikke rør `{{ .ConfirmationURL }}`** — den er selve lenken. Etter lagring: test
med «Glemt passord» på en ekte adresse og bekreft at lenken lander på
`/auth/reset`.

> Alternativet — å bygge egne e-poster via en Auth Hook for å få ett språk per
> bruker — krever at vi først lagrer språk per bruker (ny kolonne på `profiles`
> som settes av språkbryteren). Det er en større jobb, og lite verdt for to
> e-poster. Tospråklig er riktig valg nå.

---

## 2. Artsside-innhold på svensk (innholdsprosjekt, ikke kodejobb)

**Bekreftet:** dette er akkurat som antatt — innholdet er norsk data i
`mushroom_species`, og det finnes **ingen svenske kolonner** for brødteksten.
`swedish_name` er den eneste oversatte kolonnen som finnes.

### Hva som er norsk på `/species/[id]`

Renderes i [`src/app/species/[id]/page.tsx`](../src/app/species/[id]/page.tsx):

| Kolonne | Type | Hvor det vises |
|---|---|---|
| `description` | TEXT | Brødtekst på artssiden |
| `edibility_notes` | TEXT | «Betinget spiselig»-boksen |
| `toxin_info` | TEXT | Giftinfo |
| `symptoms` | TEXT | Symptomer |
| `habitat` | TEXT[] | Detaljlisten — **og** interpolert i prediksjonsforklaringen |
| `mycorrhizal_partners` | TEXT[] | Prediksjonsforklaringen |

I tillegg, på `look_alikes` (forvekslinger):

| Kolonne | Type |
|---|---|
| `similarity_description` | TEXT |
| `difference_description` | TEXT |

Og disse er norske i skjemaet men brukes ikke på siden i dag — ta dem med hvis
de skal tas i bruk: `cap_description`, `stem_description`, `gills_description`,
`flesh_description`, `spore_description`.

### Hvorfor `habitat[]` er verst

`habitat[]` og `mycorrhizal_partners[]` blir **interpolert rått inn i ellers
svenske setninger** i prediksjonsforklaringen. Det gir halvt svenske, halvt
norske setninger — mer skurrende enn en helt norsk tekst, fordi det ser ut som
en feil snarere enn manglende oversettelse.

Det er også den billigste delen å fikse: `habitat[]` og `mycorrhizal_partners[]`
er korte, gjentakende termer (skogtyper, treslag) fra et lite vokabular, ikke fri
prosa. En oppslagstabell term → svensk term dekker sannsynligvis alle 72 artene.
**Gjør denne først** — den gir mest per krone.

### Hva som trengs for resten

1. **Migrasjon** som legger til svenske kolonner (`description_sv`,
   `edibility_notes_sv`, `toxin_info_sv`, `symptoms_sv`, `habitat_sv`,
   `mycorrhizal_partners_sv`, + de to på `look_alikes`).
2. **Oversatt innhold** for ~72 arter. Dette er jobben — ikke koden.
3. **Kodeendring** (liten): en `getLocalizedField(species, 'description', locale)`
   med norsk fallback, etter samme mønster som `getSpeciesDisplayName`.

⚠️ **Sikkerhetskritisk:** `toxin_info`, `symptoms` og forvekslings-tekstene er
det folk leser når de lurer på om de har spist noe giftig. De må
faktasjekkes av noen som kan svensk sopp-terminologi, ikke maskinoversettes og
publiseres. Merk at PR #99s commit-melding allerede dokumenterer at fire av 26
eksisterende svenske artsnavn var **feil** (tre av dem var et annet arts navn) —
samme risiko gjelder brødteksten, med høyere innsats.

**Anbefalt rekkefølge:** `habitat[]`-vokabular → `description` → forvekslinger →
`toxin_info`/`symptoms` (med fagfellesjekk).

Fram til da faller alt tilbake til norsk, som er trygt: en svensk bruker leser
norsk tekst, men ser aldri tom eller feil informasjon.

---
