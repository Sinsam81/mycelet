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

### Steg 4 — Sett SERVICE_ROLE_KEY som funksjon-secret

Edge Functions har egne secrets, separat fra .env.local. Sett service-role-keyen:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<din-service-role-key>
```

Service-role-keyen finner du i Supabase Dashboard → Project Settings → API → service_role secret. **Ikke commit den!**

`SUPABASE_URL` settes automatisk av Supabase når funksjonen kjører — ikke nødvendig manuelt.

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

1. **E-post-varsel** når en bruker får sin første warning. `purge-inactive-accounts` setter `warning_email_sent = false`. Nytt steg: integrer Resend/Postmark (Sindre velger leverandør), send mail med "Behold konto"-link til `/api/me/extend-retention`, oppdater flagget til true.
2. **Retention-banner i UI** — når en bruker logger inn og har en pending warning, vis en banner: "Kontoen din er planlagt slettet 15. august. Klikk her for å beholde den." Banner kaller `/api/me/extend-retention` på klikk.
3. **Moderator-UI for å markere reports `resolved`/`dismissed`** — uten det havner aldri rader i den status-en, og `purge-resolved-reports` blir aldri triggered. Migrasjon 011 la til feltene `status` (fantes fra før) og `resolved_at`; backend-skjema er klart.
4. **Send Stripe-periode-relevante billing-rader til langtidsarkiv** før de slettes hvis vi senere vil ta full ansvar for bokføringsloven (5 år) selv. Per nå: Stripe Dashboard er authoritative kilde.

Disse er listet med spesifikt eierskap i `docs/retention-policy.md`.
