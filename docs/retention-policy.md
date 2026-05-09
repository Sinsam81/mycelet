# Datalagrings-policy (utkast — venter på Sindres beslutninger)

> **Status:** Utkast for diskusjon. Ingen av tallene under er bindende før Sindre har gått gjennom og bekreftet/justert. Når policyen er låst, må den (a) inn i `/personvern` § 7 (Lagringstid), (b) implementeres som cron-jobber, og (c) deles med beta-testere før de logger sitt første funn.
>
> **Hvorfor dette er B2 og ikke valgfritt:** GDPR Art. 5(1)(e) krever at personopplysninger ikke lagres lenger enn nødvendig. Uten en eksplisitt policy må vi enten slette alt umiddelbart eller forsvare evigvarig lagring til Datatilsynet. En klar policy + auto-sletting = compliance.

## TL;DR — foreslått ramme

| Datatype                                | Foreslått frist                          | Hvorfor det forslaget                                      |
|-----------------------------------------|------------------------------------------|------------------------------------------------------------|
| Inaktive kontoer                        | **3 år** uten innlogging → e-post + 90 dg → slett | Lang nok for sesongbrukere; kort nok til å unngå dataopphoping |
| Funn (positive + negative)              | **Beholdes så lenge konto eksisterer**   | Brukerens egne data, kjerne-funksjon. Bruker kan slette når som helst. |
| Forum-innlegg + kommentarer             | **Beholdes så lenge konto eksisterer**, men anonymiseres ved konto-sletting | Bevarer forum-tråder ved sletting (ellers blir tråder ulesbare) |
| Reports filed AV bruker (rapporter andre) | **Beholdes så lenge konto eksisterer**   | Trenger logg over modererings-historikk                    |
| Reports filed OM bruker                 | **Slettes 1 år etter løsning**           | Etter behandlet sak er det ikke lenger nødvendig           |
| `admin_audit_log`                       | **7 år**                                 | Bokføringsloven (krav om revisjons-spor)                   |
| `billing_subscriptions`                 | **5 år**                                 | Bokføringsloven (regnskapsdokumenter, jf. lov om bokføring §13) |
| Stripe webhook-events (`billing_webhook_events`) | **2 år**                          | Debug-historikk; sjelden trengt etter et år               |
| Backups (Supabase point-in-time)        | **30 dager** (Supabase-default)          | Recovery-vindu for ulykker; ikke aktiv lagring             |
| Server-logger (Vercel)                  | **30 dager** (Vercel-default)            | Standard for incident-debugging                            |
| `prediction_tiles` (genererte)          | **Roller daglig** — overskrives          | Ikke persondata, ingen bevarings-grunn                     |
| Geolokasjon ved funn                    | **`display_latitude/longitude`** (jittered til ±500 m) brukes til API-respons | Råkoordinater kun synlig for eier — privacy-by-design |

## Tre beslutninger Sindre må ta

### 1. Inaktive kontoer — hvor lang sjekk-pause? (foreslått: 3 år)

> **Trade-off:** Kortere = ryddigere DB + mindre GDPR-eksponering. Lengre = bedre brukeropplevelse for sesongbrukere som logger inn én gang per høst.
>
> **Innstilling:** Norske sopp-sesonger spenner aug–nov. En bruker som installerer appen i 2026 men neste gang åpner den i 2029 høst → vil sikkert ikke at kontoen er borte. 3 år dekker tre hele sesonger med 100 % margin.

Alternativer å vurdere:
- 2 år (strengere, mindre data-eksponering)
- 3 år (foreslått)
- 5 år (Bokføringsloven-grensen — passer hvis vi vil samkjøre)

**Sindres svar:** _________

### 2. Forum-innlegg ved konto-sletting — slette eller anonymisere? (foreslått: anonymisere)

> **Trade-off:** Sletting = full GDPR Art. 17-respekt, men ødelegger eldre tråder (ulesbare svar uten kontekst). Anonymisering = bevarer forum-verdi, men bruker kan ikke kreve full sletting av sine offentlige bidrag.
>
> **Juridisk:** Art. 17(3)(a) sier "ytringsfrihet og informasjonsfrihet" kan overstyre slette-retten. Forum-bidrag har klart innslag av offentlig diskurs. Anonymisering (erstatte forfatter-id med "[slettet bruker]") er en vanlig kompromiss-løsning og generelt akseptert.

**Sindres svar:** _________

### 3. Negative observasjoner — beholdes ved konto-sletting? (foreslått: anonymiseres + beholdes)

> Negative observasjoner ("jeg lette her, fant ingenting") er en del av prediksjons-modellens treningsdata. Hvis vi sletter alle ved konto-sletting, mister vi en betydelig signal-kilde. Anonymisering (fjerne `user_id`) bevarer treningsdata uten å beholde kobling til person.
>
> **Juridisk:** Hvis user_id fjernes og posisjon allerede er randomisert til ±500 m (`approximate`-default), så er raden ikke lenger en personopplysning og GDPR gjelder ikke lenger. Da kan vi beholde den.
>
> **Edge case:** Hvis brukeren hadde `private`-visibility på et funn (display_lat/lon = NULL), så er det åpenbart en personopplysning og må slettes. Bare `public`/`approximate` overlever anonymisering.

**Sindres svar:** _________

## Implementerings-skisse (når policy er låst)

### Cron-jobber

Tre planlagte oppgaver, foreslås kjørt via Vercel Cron eller Supabase Edge:

```
@daily 03:00 — purge_inactive_accounts
  Finn brukere uten innlogging på X år.
  Send varsel-e-post (90 dager før sletting).
  Slett auth.users → cascade rensk profile + dependent rows.

@daily 03:30 — anonymize_billing_old
  Slett billing_subscriptions-rader eldre enn 5 år.
  Slett billing_webhook_events eldre enn 2 år.

@daily 04:00 — purge_resolved_reports
  Slett reports med status='resolved' og resolved_at < NOW() - 1 år.
```

Alle jobber skriver til `admin_audit_log` for revisjonsspor.

### Kode-endringer som trengs

- Ny tabell `account_deletion_warnings` for å spore "varslet om sletting"-tilstand.
- Endring i `findings` ved konto-sletting: hvis policyen blir "anonymiser i stedet for slett", må FK fra findings.user_id til auth.users gå fra ON DELETE CASCADE → ON DELETE SET NULL.
- Trigger på sletting som anonymiserer forum-innlegg (sett user_id = NULL, behold innhold).
- API-endepunkt `/api/me/extend-retention` som lar brukere logge inn og bekrefte at de fortsatt vil ha kontoen.

### Kommunikasjon til brukere

- `/personvern` § 7 oppdateres med disse tallene (erstatter `[FYLL INN]`-markører).
- Settings-side får "Datalagring"-seksjon som viser brukerens egen lagrings-tilstand: "Ditt siste innlogging: dd.mm.åååå. Kontoen vil bli slettet hvis du ikke logger inn innen dd.mm.åååå."
- E-post-varsel 90 dager før auto-sletting med direkte link til "Behold kontoen min".

## Hva som IKKE er i denne policyen (med vilje)

- **GBIF-backfill av historiske observasjoner** (Phase 2 uke 7): kommer fra GBIF/Artsdatabanken, er offentlig data, ingen brukerkobling. Faller utenfor GDPR.
- **Aggregerte statistikker** (antall funn per art per kommune per år): regnes som anonyme aggregater, beholdes uavgrenset.
- **Email-bouncer / varslings-feilstate**: skal hodelistest og slettes etter 30 dager — gå inn i en separat e-post-policy senere.

## Tidslinje for å låse policyen

1. **Sindre**: Les utkastet, fyll inn de tre `_________`-feltene over. (~30 min)
2. **Sammen**: Diskuter trade-offer hvis Sindre velger noe annet enn foreslått.
3. **Claude**: Implementér cron-jobber og kode-endringer. Skriv migrasjon for `account_deletion_warnings`. Oppdater `/personvern`. (~3-4 timer)
4. **Sindre**: Send oppdatert `/personvern` til norsk advokat for review (A8 user-homework).
5. **Klart for beta-launch.**
