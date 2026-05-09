# Datalagrings-policy

> **Status:** Låst 9. mai 2026 av Sindre. Tallene under er normative.
> Tilhørende endringer som skal følge etter denne låsingen:
> 1. ✅ `/personvern` § 5 oppdatert med konkrete tall (samme commit).
> 2. ⏳ Migrasjon 011 — `account_deletion_warnings`-tabell, FK-endring `findings.user_id` → ON DELETE SET NULL, trigger for å anonymisere forum-innlegg.
> 3. ⏳ Cron-jobber implementeres når Sindre har valgt plattform (Vercel Cron vs Supabase Edge vs pg_cron).
> 4. ⏳ `/personvern` må til norsk advokat for review (A8 user-homework).
>
> **Hvorfor dette er B2 og ikke valgfritt:** GDPR Art. 5(1)(e) krever at personopplysninger ikke lagres lenger enn nødvendig. Uten en eksplisitt policy må vi enten slette alt umiddelbart eller forsvare evigvarig lagring til Datatilsynet. En klar policy + auto-sletting = compliance.

## TL;DR — låst ramme

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

## Tre beslutninger — låst 9. mai 2026

### 1. Inaktive kontoer: 3 år ✅

Brukere som ikke logger inn på 3 år får e-post-varsel. Slettes 90 dager senere hvis ingen respons.

Begrunnelse: Norske sopp-sesonger spenner aug–nov. 3 år dekker tre hele sesonger med margin, samtidig som det begrenser GDPR-eksponering for forlatte kontoer.

### 2. Forum-innlegg ved konto-sletting: anonymiser ✅

Innholdet beholdes, forfatter erstattes med "[slettet bruker]".

Begrunnelse: GDPR Art. 17(3)(a) tillater avveining mot ytringsfrihet/informasjonsfrihet. Sletting av hele tråder bryter samtaler for andre brukere. Anonymisering = praksis-konsensus.

### 3. Negative observasjoner ved konto-sletting: anonymiser og behold ✅

`user_id` settes til NULL; raden beholdes som treningsdata. Begrenset til observasjoner med visibility = 'public' eller 'approximate' — `private` slettes alltid.

Begrunnelse: Negative observasjoner er prediksjons-modellens viktigste signal-kilde for "hvor det IKKE vokser sopp". Anonymiserte rader uten kobling til person + jittered koordinater (±500 m) er ikke personopplysninger og faller utenfor GDPR.

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

## Tidslinje fremover

1. ✅ **Sindre**: Bekreftet alle tre forslag (9. mai 2026).
2. ✅ **Claude**: Oppdatert `/personvern` § 5 med konkrete tall.
3. **Sindre**: Velg cron-plattform før implementasjon: **Vercel Cron** (enklest, gratis t.o.m. 1 cron-job, krever Vercel-deploy først), **Supabase Edge Functions** (Deno-basert, gratis, kan kjøre uavhengig av Vercel), eller **pg_cron** (Postgres-extension, kjører i DB-en, krever Supabase Pro-plan).
4. **Claude**: Implementér migrasjon 011 + cron-handlers + `/api/me/extend-retention`. (~3-4 timer)
5. **Sindre**: Send oppdatert `/personvern` til norsk advokat for review (A8).
6. **Klart for beta-launch.**
