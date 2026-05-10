# Logging i Mycelet

Sist oppdatert: 6. mai 2026.

## De fire typene logging

Mycelet har fire forskjellige logging-systemer som løser fire forskjellige problemer. Det er kritisk å forstå forskjellen — å bruke feil verktøy gir enten støy, GDPR-brudd, eller manglende sporbarhet når det betyr noe.

### 1. Full logging (info / warn / error)

**Hva:** Hendelser, input, feil og flyt mens koden kjører.

**Hvor:** `src/lib/log/index.ts` → `logger.info()` / `logger.warn()` / `logger.error()`.

**Når:** Hver gang en signifikant ting skjer i en API-rute eller bakgrunnsjobb. Brukeren logget seg inn, en betaling gikk gjennom, en ekstern API svarte med 500, en database-spørring tok lang tid.

**Eksempel:**

```typescript
import { createRequestLogger } from '@/lib/log/request';

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  log.info('identify.start');
  try {
    const result = await callPlantId(image);
    log.info('identify.success', { suggestionCount: result.length });
    return NextResponse.json(result);
  } catch (err) {
    log.error('identify.failed', err);
    return NextResponse.json({ error: '...' }, { status: 502 });
  }
}
```

### 2. Debug logging (debug)

**Hva:** Ekstra detaljer brukt under utvikling for å forstå logikk.

**Hvor:** Samme logger, `logger.debug()`. Av i produksjon (`LOG_LEVEL=info` der), på i dev (`LOG_LEVEL=debug` default).

**Når:** Når du vil forstå hvorfor noe skjer akkurat slik. *Hvilket vær-API ble valgt? Hvilke koordinater fikk vi? Hvilken cache-nøkkel ble truffet?* Verdifullt for utvikling, støy i produksjon.

**Eksempel:**

```typescript
log.debug('identify.calling_plantid', {
  hasCoordinates: body.latitude != null,
  tier: capabilities.tier
});
```

### 3. Audit log (sporbarhet for sensitive handlinger)

**Hva:** Spor av hva som har skjedd i ettertid — hvem gjorde hva mot hvem, fra hvilken IP, når.

**Hvor:** `src/lib/audit/log.ts` → `logAdminAction()`. Skriver til `admin_audit_log`-tabellen i Postgres med trigger som blokkerer UPDATE og DELETE (append-only).

**Når:** Sensitive admin-handlinger og bruker-initierte handlinger som har juridisk eller sikkerhetsmessig betydning. Moderator gir noen verified-forager-status. Bruker sletter sin egen konto. Admin sletter andres konto.

**Eksempel:**

```typescript
import { logAdminAction } from '@/lib/audit/log';

await logAdminAction({
  actorId: user.id,
  action: 'verified_forager.upsert',
  targetUserId: body.userId,
  metadata: { role: body.role },
  request
});
```

**NB:** Audit-loggen er IKKE en erstatning for runtime-logging. Tabellen er designet for compliance-spor og skal være liten og append-only — ikke et sted å dumpe debug-data. Hvis du er i tvil om noe er audit-verdig, bruk runtime `logger.info` i stedet.

### 4. Trace logging (steg-for-steg gjennom flyten)

**Hva:** Detaljert tidslinje over hva som skjer i én forespørsel.

**Hvor:** Samme logger, `logger.trace()`. Av som standard, slå på med `LOG_LEVEL=trace` når du graver i en spesifikk feil.

**Når:** Når noe ser ut til å være riktig på papiret men feil i praksis, og du må følge en forespørsel steg for steg gjennom systemet. Også når prediksjons-modellen returnerer rart score og du må se hver mellomberegning.

**Korrelasjons-ID:** Hver forespørsel via `createRequestLogger(request)` får automatisk en kort `reqId` som henger på alle log-linjer fra den forespørselen. Slik kan du trekke ut "alt som skjedde i request abc123" når du leter i Vercel logs.

`reqId` genereres i middleware (`src/lib/supabase/middleware.ts`), settes som `X-Request-Id` på *request*-headere, og leses av `createRequestLogger` i hver rute. Hvis en upstream-proxy (Vercel edge, Cloudflare osv.) sender `X-Request-Id` inn, ærer vi den i stedet for å generere en ny — slik flyter samme ID gjennom flere lag.

**Eksempel:**

```typescript
log.trace('prediction.weather_provider_chosen', { region: 'NO', provider: 'frost' });
log.trace('prediction.fallback_path_entered', { reason: 'no_tiles_in_bounds' });
log.trace('prediction.species_adjustment_applied', { speciesFit, baseScore });
```

#### ⚠ Kjent begrensning: `X-Request-Id` på *response* til klienten

Vi har forsøkt å sette `X-Request-Id` på respons-headeren (slik at klienten kan sitere den i support-tickets), men Next 14 App Router propagerer ikke middleware-satt response-headere til responsen som handler/page bygger. Verifisert empirisk: hverken `response.headers.set()` eller `NextResponse.next({ headers: {...} })` kommer gjennom.

**Konsekvens:** Klienten ser ikke `reqId` i nettverk-fanen i DevTools eller i fetch-respons-headers.

**Hva som fortsatt fungerer 100 %:**
- `reqId` i alle server-side log-linjer (det viktigste)
- `reqId` tilgjengelig for handlere via `request.headers.get('x-request-id')`
- Cross-correlation av flere log-linjer fra samme request

**Hvis vi senere må ha klient-side reqId:**
- Refaktor til en `withRequestLogging(request, async (log) => {...})`-wrapper som setter headeren på selve handler-responsen
- Eller vent til Next 16-oppgradering (denne quirken er rapportert flere steder, sannsynligvis fikset i 16)

For nå er server-side log-korrelasjon nok — det dekker 95 % av "hvor gikk det galt"-debugging. Klient-side reqId er nice-to-have, ikke kritisk.

## Når bruker man hva?

| Situasjon | Verktøy |
|-----------|---------|
| En ekstern API feilet | `log.error('xxx.failed', err)` |
| En forespørsel kom inn | `log.info('xxx.start')` |
| En forespørsel gikk gjennom OK | `log.info('xxx.success', { keyResultData })` |
| En bruker traff sin daglige kvote | `log.info('xxx.quota_reached')` |
| Du vil forstå *hvorfor* en gren ble valgt | `log.debug('xxx.branch_taken', { reason })` |
| Du følger flyten gjennom 5 steg for å feilsøke | `log.trace('xxx.step_N')` |
| Moderator ga noen en rolle | `logAdminAction({ action: 'role.upsert', ... })` |
| Bruker slettet sin egen konto | `logAdminAction({ action: 'account.self_delete', ... })` + `log.warn('account.self_delete.success')` (begge — runtime-log for monitoring, audit-log for compliance) |

## Konfigurasjon

`.env.local`:

```
LOG_LEVEL=debug   # default i dev
# LOG_LEVEL=info  # default i produksjon
# LOG_LEVEL=trace # når du må grave dypt
```

Nivåene rangerer: `trace < debug < info < warn < error`. Setter du `LOG_LEVEL=warn` får du bare `warn` og `error` — alt under er stille.

## PII-redaksjon

All `ctx` og `err`-data passerer gjennom `redactPII` før den skrives ut:

- **Objekt-nøkler** som inneholder `password`, `secret`, `token`, `apikey`, `authorization`, `cookie`, eller miljø-variabel-navn vi har dokumentert (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_WEBHOOK_SECRET`, m.fl.) → verdien erstattes med `<redacted>`.
- **E-post-adresser** hvor som helst i strenger → maskes til `s***@gmail.com` (første tegn synlig, lokal del skjult, domene beholdt).
- **Interne ID-er** (UUID-er, numeriske DB-ID-er) er IKKE PII og beholdes — de er meningsløse uten DB-tilgang og uvurderlige for å koble logger til support-saker.
- **IP-adresser** beholdes for sikkerhets-forensics.

Hvis du er usikker på om noe er PII, redakter det. Nedsiden av over-redaksjon er debug-friksjon; nedsiden av under-redaksjon er GDPR Art. 32.

## Hvor logene havner

| Miljø | Hvor |
|-------|------|
| Lokal `npm run dev` | Terminal stdout, pretty-printed med farger og tidsstempel |
| Vercel produksjon | Vercel logs dashboard (JSON-format, søkbare) |
| Fremtidig: Sentry | Vil fange `error`-nivå automatisk når Sentry er koblet på (Phase B5) |
| Fremtidig: log drain | Når trafikken vokser, kan Vercel sende strukturerte JSON-logs til Datadog/Loki/whatever |

## Hva som ikke logges (med vilje)

- **Råe e-poster, telefonnumre, fulle navn** — redaktert
- **API-nøkler, tokens, passord** — redaktert via key-pattern matching
- **Råe HTTP-bodyer fra brukere** — kan inneholde uforventet PII; logg bare felter du eksplisitt har sjekket
- **Stack traces fra ikke-Error-objekter** — `log.error('msg', stringValue)` håndterer det, men foretrekk å throw `new Error()` så vi får ekte stack
