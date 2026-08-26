# Datalagrings-policy

> **Status:** Låst 9. mai 2026 av eieren. Tallene under er normative.
> Tilhørende endringer som skal følge etter denne låsingen:
> 1. ✅ `/personvern` § 5 oppdatert med konkrete tall (samme commit).
> 2. ⏳ Migrasjon 011 — `account_deletion_warnings`-tabell, FK-endring `findings.user_id` → ON DELETE SET NULL, trigger for å anonymisere forum-innlegg.
> 3. ⏳ Cron-jobber implementeres når plattform er valgt (Vercel Cron vs Supabase Edge vs pg_cron).
> 4. ⏳ `/personvern` må til norsk advokat for review (A8 user-homework).
>
> **Hvorfor dette er B2 og ikke valgfritt:** GDPR Art. 5(1)(e) krever at personopplysninger ikke lagres lenger enn nødvendig. Uten en eksplisitt policy må vi enten slette alt umiddelbart eller forsvare evigvarig lagring til Datatilsynet. En klar policy + auto-sletting = compliance.

## TL;DR — låst ramme

| Datatype                                | Foreslått frist                          | Hvorfor det forslaget                                      |
|-----------------------------------------|------------------------------------------|------------------------------------------------------------|
| Inaktive kontoer                        | **3 år** uten innlogging → e-post + 90 dg → slett | Lang nok for sesongbrukere; kort nok til å unngå dataopphoping |
| Funn (positive + negative)              | **Beholdes så lenge konto eksisterer**   | Brukerens egne data, kjerne-funksjon. Bruker kan slette enkeltfunn når som helst, fra kartpopupen (migrasjon 056) |
| Funn brukeren selv har slettet          | **30 dager** — `deleted_at` settes med én gang, `/api/cron/purge-deleted-findings` hard-sletter raden og bildet etterpå | Angrevindu. Sletting skjer med tommelen på en telefon i skogen; uten frist er et feilklikk endelig |
| Forum-innlegg + kommentarer             | **Beholdes så lenge konto eksisterer**, men anonymiseres ved konto-sletting | Bevarer forum-tråder ved sletting (ellers blir tråder ulesbare) |
| Reports filed AV bruker (rapporter andre) | **Beholdes så lenge konto eksisterer**   | Trenger logg over modererings-historikk                    |
| Reports filed OM bruker                 | **Slettes 1 år etter løsning**           | Etter behandlet sak er det ikke lenger nødvendig           |
| AI-identifiseringshistorikk (`identifications` + bildene) | **12 måneder** — rad og bilde slettes av `/api/cron/purge-identifications` | Historikken er et mellomlager, ikke et arkiv: det brukeren vil beholde, lagrer de som funn. Bruker kan slette enkeltrader når som helst. Gir ett sesongtilbakeblikk og et hardt tak på lagringskostnaden (Supabase Free: 1 GB totalt). |
| AI-kvoteteller (`ai_identifications`)   | **7 dager**                              | Kun de siste 24 timene leses noen gang (migrasjon 020); resten er feilsøkingsmargin |
| `admin_audit_log`                       | **7 år**                                 | Bokføringsloven (krav om revisjons-spor)                   |
| `billing_subscriptions`                 | **5 år**                                 | Bokføringsloven (regnskapsdokumenter, jf. lov om bokføring §13) |
| Stripe webhook-events (`billing_webhook_events`) | **2 år**                          | Debug-historikk; sjelden trengt etter et år               |
| Backups (Supabase point-in-time)        | **30 dager** (Supabase-default)          | Recovery-vindu for ulykker; ikke aktiv lagring             |
| Server-logger (Vercel)                  | **30 dager** (Vercel-default)            | Standard for incident-debugging                            |
| `prediction_tiles` (genererte)          | **30 dager** — eldre rader slettes av `/api/cron/generate-tiles` | Ikke persondata. Bare dagens dato leses; vinduet finnes for feilsøking |
| Geolokasjon ved funn                    | **`display_latitude/longitude`** (jittered til ±500 m) brukes til API-respons | Råkoordinater kun synlig for eier — privacy-by-design |

## Sletting av eget funn — myk, med 30 dagers frist

Lagt til 26. august 2026 (migrasjon 056). Fram til da fantes det ingen vei ut av
et feilregistrert funn: RLS tillot sletting, men ingen flate brukte den, så
eneste utvei var å slette hele kontoen.

- **Flate:** kartpopupen, kun på egne funn. To-trinns bekreftelse.
- **Sletting:** myk — `findings.deleted_at` settes. Raden forsvinner samtidig
  fra alle lesesteder (`public_findings`-viewet, `get_user_stats`, /mine-steder,
  profilen, forsiden, kartet, GPX-eksporten, forum-koblingen, admin-statistikken).
- **Angre:** `POST /api/findings/:id/restore`, tilbudt i varselet rett etter
  slettingen og gyldig så lenge raden finnes.
- **Permanent fjerning:** `/api/cron/purge-deleted-findings` (daglig 03:30)
  hard-sletter rader eldre enn 30 dager og fjerner bildet i `finding-images`.
  Bildet ryddes FØRST, raden etterpå — feiler bildet, blir raden liggende og
  neste kjøring prøver på nytt.
- **Ved kontosletting:** allerede slettede funn hard-slettes i STEP 1a av
  `/api/me/delete`, før noe vurderes for anonymisert bevaring. Et funn brukeren
  har slettet skal aldri overleve som treningsdata.
- **Ett unntak fra filtreringen, med vilje:** AI-kvoten i `/api/identify` teller
  kall, ikke funn. Den filtrerer ikke bort slettede rader — ellers ville
  «identifiser → lagre → slett» gitt en ny gratis runde hver gang.

Vinduet på 30 dager står fire steder og må holdes i takt: her, i
`PURGE_AFTER_DAYS`, i kommentaren på `findings.deleted_at` (migrasjon 056), og i
personvernerklæringen (`Personvern.retentionActiveDesc`, nb + sv).

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
@daily 03:30 — purge_identifications          ✅ IMPLEMENTERT (Vercel Cron)
  Slett identifications-rader eldre enn 12 mnd — BILDET FØRST, så raden.
  (Motsatt rekkefølge etterlater bilder ingenting peker på: usynlige for
  brukeren og for neste kjøring, men fortsatt lagret hos oss.)
  Rydder samtidig ai_identifications eldre enn 7 dager.

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

1. ✅ **Eier**: Bekreftet alle tre forslag (9. mai 2026).
2. ✅ **Claude**: Oppdatert `/personvern` § 5 med konkrete tall.
3. **Eier**: Velg cron-plattform før implementasjon: **Vercel Cron** (enklest, gratis t.o.m. 1 cron-job, krever Vercel-deploy først), **Supabase Edge Functions** (Deno-basert, gratis, kan kjøre uavhengig av Vercel), eller **pg_cron** (Postgres-extension, kjører i DB-en, krever Supabase Pro-plan).
4. **Claude**: Implementér migrasjon 011 + cron-handlers + `/api/me/extend-retention`. (~3-4 timer)
5. **Eier**: Send oppdatert `/personvern` til norsk advokat for review (A8).
6. **Klart for beta-launch.**
