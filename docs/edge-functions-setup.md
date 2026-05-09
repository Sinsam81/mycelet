# Supabase Edge Functions — oppsett (retention-policy)

Tre Edge Functions i `supabase/functions/` håndterer GDPR-retention. Dette dokumentet forklarer hvordan Sindre setter dem opp **én gang** etter migrasjon 011 er kjørt.

## Oversikt

| Funksjon                          | Plan                       | Hva den gjør                                                      |
|-----------------------------------|----------------------------|-------------------------------------------------------------------|
| `purge-inactive-accounts`         | Daglig 03:00 Europe/Oslo   | Varsler inaktive (3 år) kontoer; sletter etter 90-dagers grace    |
| `purge-resolved-reports`          | Daglig 03:30 Europe/Oslo   | Sletter løste rapporter eldre enn 1 år                            |
| `prune-billing-events`            | Daglig 04:00 Europe/Oslo   | Sletter Stripe webhook-events eldre enn 2 år                      |

Alle tre kjører i Deno-runtime (ikke Node), ligger i Supabase (ikke Vercel), og krever **Service Role Key** for å invokeres.

## Førstegangs-oppsett

### Steg 1 — Installer Supabase CLI (~3 min)

I Terminal:

```bash
brew install supabase/tap/supabase
```

Verifiser:

```bash
supabase --version
```

Hvis du ikke har Homebrew, alternativ: last ned binary fra https://github.com/supabase/cli/releases.

### Steg 2 — Logg inn på Supabase

```bash
supabase login
```

Dette åpner nettleseren og ber deg autorisere CLI-en.

### Steg 3 — Koble lokal repo til Supabase-prosjektet

I prosjekt-mappen (`/Users/sindreoveras/Documents/Dokumenter – Sindre sin MacBook Air/sopp appen`):

```bash
supabase link --project-ref <DIN-PROSJEKT-REF>
```

Project ref finner du ved å gå til Supabase Dashboard → Project Settings → General → Reference ID.

### Steg 4 — Sett funksjon-secrets

Edge Functions har egne secrets, separat fra .env.local. Sett service-role-keyen:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<din-service-role-key>
```

Service-role-keyen finner du i Supabase Dashboard → Project Settings → API → service_role secret. **Ikke commit den!**

`SUPABASE_URL` settes automatisk av Supabase når funksjonen kjører — ikke nødvendig manuelt.

#### Resend (e-post-varsel)

`purge-inactive-accounts` sender varsel på e-post når en bruker havner i 90-dagers grace-perioden. Tre trinn for å aktivere:

1. **Lag konto på https://resend.com** (gratis: 3000 e-post/mnd, 100/dag).
2. **Verifiser domenet `soppjakt.no`** — Resend gir deg DNS-records (SPF, DKIM, return-path). Du legger dem til hos domenetilbyderen din.
3. **Sett to secrets**:

```bash
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set RESEND_FROM_EMAIL=noreply@soppjakt.no
supabase secrets set APP_URL=https://soppjakt.no
```

`APP_URL` brukes i e-postens "Behold konto"-link. Hvis du har annen prod-domene, sett den der i stedet for soppjakt.no.

Hvis Resend-keyene ikke er satt, fortsetter cron-jobben uten å sende e-post — warning-rader skrives fortsatt til DB, og brukere får banner i appen ved innlogging. E-post er bonus for å nå brukere som ikke logger inn.

### Steg 5 — Deploy alle tre funksjonene

```bash
supabase functions deploy purge-inactive-accounts --no-verify-jwt
supabase functions deploy purge-resolved-reports --no-verify-jwt
supabase functions deploy prune-billing-events --no-verify-jwt
```

`--no-verify-jwt` betyr at funksjonen ikke krever en gyldig user-JWT — vi bruker vår egen bearer-token-sjekk i `_shared/auth.ts` mot service-role-keyen. (Standard Supabase JWT-validering ville krevd at du sender en innlogget brukers token, som ikke gir mening for cron-jobber.)

### Steg 6 — Test at de virker

I Terminal:

```bash
curl -X POST 'https://<din-prosjekt-ref>.supabase.co/functions/v1/purge-inactive-accounts' \
  -H "Authorization: Bearer <din-service-role-key>"
```

Forventet svar:

```json
{ "ok": true, "issuedWarnings": 0, "clearedWarnings": 0, "deletedAccounts": 0, "errors": [] }
```

(Tallene er 0 fordi du nettopp har deployet og ingen brukere er 3 år inaktive enda.)

Hvis du får 401 — sjekk at bearer-tokenet er service-role-keyen, ikke anon-keyen.
Hvis du får 500 med "SUPABASE_SERVICE_ROLE_KEY not configured" — secret-en er ikke satt; gå tilbake til steg 4.

### Steg 7 — Sett opp scheduling

To alternativer:

**A) Supabase pg_cron (anbefalt — krever Pro-plan, $25/mnd)**

I Supabase Dashboard → SQL Editor, lim inn og kjør:

```sql
SELECT cron.schedule(
  'purge-inactive-accounts-daily',
  '0 3 * * *',  -- Daglig kl 03:00
  $$
    SELECT net.http_post(
      url := 'https://<din-prosjekt-ref>.supabase.co/functions/v1/purge-inactive-accounts',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <din-service-role-key>',
        'Content-Type', 'application/json'
      )
    );
  $$
);

SELECT cron.schedule(
  'purge-resolved-reports-daily',
  '30 3 * * *',
  $$
    SELECT net.http_post(
      url := 'https://<din-prosjekt-ref>.supabase.co/functions/v1/purge-resolved-reports',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <din-service-role-key>',
        'Content-Type', 'application/json'
      )
    );
  $$
);

SELECT cron.schedule(
  'prune-billing-events-daily',
  '0 4 * * *',
  $$
    SELECT net.http_post(
      url := 'https://<din-prosjekt-ref>.supabase.co/functions/v1/prune-billing-events',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <din-service-role-key>',
        'Content-Type', 'application/json'
      )
    );
  $$
);
```

`pg_cron` og `pg_net` extensions må være aktivert. Gjøres via Dashboard → Database → Extensions.

**B) cron-job.org (gratis — ingen plan-oppgradering)**

1. Lag konto på https://cron-job.org/.
2. New cronjob:
   - URL: `https://<din-prosjekt-ref>.supabase.co/functions/v1/purge-inactive-accounts`
   - Method: POST
   - Header: `Authorization: Bearer <din-service-role-key>`
   - Schedule: 03:00 daily (Europe/Oslo)
3. Repeter for de to andre funksjonene.

Tjenesten ringer URL-en automatisk og logger om den får 200/207/500.

## Hvordan verifisere at det fungerer i drift

- Supabase Dashboard → Functions → klikk på funksjons-navnet → "Logs"-tab. Du skal se én linje per kjøring med tellingene.
- Tabell-utforskeren: `SELECT * FROM account_deletion_warnings;` og `SELECT * FROM admin_audit_log WHERE action = 'account.auto_delete_inactive';`

## Hva som mangler — TODO før beta

1. **Send Stripe-periode-relevante billing-rader til langtidsarkiv** før de slettes hvis vi senere vil ta full ansvar for bokføringsloven (5 år) selv. Per nå: Stripe Dashboard er authoritative kilde.

Resend-e-post, retention-banner i UI og moderator-UI for status-endring er alle implementert (se commit-historikk for PR #47).
